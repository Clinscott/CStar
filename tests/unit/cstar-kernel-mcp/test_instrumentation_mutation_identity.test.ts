import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    errorResponse,
    mcpErrorCode,
    preAuthorizationError,
    preAuthorizationErrorResponse,
    preAuthorizationResponse,
    textResponse,
} from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    instrumentTool,
    isPreAuthorizationRejection,
} from '../../../src/tools/cstar-kernel-mcp/telemetry/usage.js';
import { verifyCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { handleForgeAuthorize as rawHandleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute as rawHandleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import {
    handleForgeRequest as rawHandleForgeRequest,
    type ForgeRequestArgs,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleGoalResume } from '../../../src/tools/cstar-kernel-mcp/tools/goal_resume.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const handleForgeRequest: typeof rawHandleForgeRequest = (args, context) =>
    rawHandleForgeRequest(args, context);
const handleForgeAuthorize: typeof rawHandleForgeAuthorize = (args, context) =>
    rawHandleForgeAuthorize(args, context);
const handleForgeExecute: typeof rawHandleForgeExecute = (args, context) =>
    rawHandleForgeExecute(args, context);

const originalRoot = registry.getRoot();
const originalForgeRuntimeTestBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];

function makeTelemetryRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-telemetry-identity-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.agents'), { mode: 0o700 });
    registry.setRoot(root);
    return root;
}

function validForgeRequest(overrides: Partial<ForgeRequestArgs> = {}): ForgeRequestArgs {
    return {
        bead_id: 'bead-telemetry-boundary',
        decision_id: 'decision-telemetry-boundary',
        source_callback_thread_id: '019e9063-56e8-7831-a7ee-9241badce6c5',
        objective: 'Exercise the synthetic Forge telemetry authorization boundary.',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
        required_output_paths: ['src/tools/cstar-kernel-mcp.ts'],
        scope: 'synthetic telemetry boundary',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'boundary', threshold: 'no preauthorization writes' }],
        artifact_expectations: ['synthetic receipt'],
        prohibited_actions: ['git_commit', 'deploy', 'expanded_spend'],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'forbidden',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'TELEMETRY_BOUNDARY', callback_required: true },
        package_locks: [],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        ...overrides,
    };
}

beforeEach(() => {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalForgeRuntimeTestBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalForgeRuntimeTestBypass;
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('MCP instrumentation authorization boundary', () => {
    it('trusts only internal preauthorization disposition, never attacker-controlled text', () => {
        const response = preAuthorizationResponse(
            { status: 'rejected' },
            'future_preauthorization_code',
        );
        const thrown = preAuthorizationError(
            'future_preauthorization_exception',
            'codex_request_identity_attacker_chosen_text',
        );

        assert.equal(isPreAuthorizationRejection(response), true);
        assert.equal(isPreAuthorizationRejection(thrown), true);
        assert.equal(isPreAuthorizationRejection({ error: 'codex_request_identity_metadata_required' }), false);
        assert.equal(isPreAuthorizationRejection(new Error('forge_authorization_challenge_exact_match_required')), false);
        assert.equal(
            JSON.parse(errorResponse(new Error('Human compatibility explanation.')).content[0]!.text).error_code,
            'cstar_internal_error',
        );
        assert.equal(
            JSON.parse(errorResponse(new Error('forge_stable_code:detail')).content[0]!.text).error_code,
            'forge_stable_code',
        );
    });

    it('leaves no telemetry or Hall artifacts for rejected identities and records accepted calls', async () => {
        const root = makeTelemetryRoot();
        const state = path.join(root, '.agents', 'state');
        const stats = path.join(root, '.stats');
        const session = createSession({
            textParts: ['Synthetic root-user request for one instrumented mutation.'],
        });
        const wrapped = instrumentTool(
            'cstar_test_mutation',
            async (_args: Record<string, never>, context) => {
                try {
                    await verifyCodexRequestIdentity(context);
                    return textResponse({ status: 'ok' });
                } catch (error) {
                    return preAuthorizationErrorResponse(mcpErrorCode(error), error);
                }
            },
        );

        const missing = await wrapped({});
        assert.equal(missing.isError, true);
        assert.match(JSON.parse(missing.content[0]!.text).error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(state), false);
        assert.equal(fs.existsSync(stats), false);

        const subagent = await wrapped({}, validRequestContext(session.threadId, session.turnId, {
            thread_source: 'subagent',
            parent_thread_id: 'parent-thread',
            subagent_kind: 'review',
        }));
        assert.equal(subagent.isError, true);
        assert.match(JSON.parse(subagent.content[0]!.text).error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(state), false);
        assert.equal(fs.existsSync(stats), false);

        const thrown = instrumentTool('cstar_test_mutation', async () => {
            throw preAuthorizationError('operator_authorization_reference_format_invalid');
        });
        await assert.rejects(() => thrown({}), /operator_authorization_reference_format_invalid/);
        assert.equal(fs.existsSync(state), false);
        assert.equal(fs.existsSync(stats), false);

        const accepted = await wrapped({}, validRequestContext(session.threadId, session.turnId));
        assert.equal(accepted.isError, undefined);
        assert.equal(JSON.parse(accepted.content[0]!.text).status, 'ok');
        assert.equal(fs.readFileSync(path.join(state, 'cstar-kernel-mcp-usage.jsonl'), 'utf-8').trim().split('\n').length, 1);
        assert.equal(fs.readFileSync(path.join(state, 'cstar-kernel-mcp-usefulness.jsonl'), 'utf-8').trim().split('\n').length, 1);
        assert.equal(fs.existsSync(stats), false);
    });

    it('keeps actual Forge request, authorize, and execute preauthorization exits write-free', async () => {
        const root = makeTelemetryRoot();
        const state = path.join(root, '.agents', 'state');
        const stats = path.join(root, '.stats');
        const requestId = `dispatch-forge-${'a'.repeat(32)}`;
        const requestSha256 = 'b'.repeat(64);

        const request = await instrumentTool('cstar_forge_request', handleForgeRequest)(
            validForgeRequest({ bead_id: undefined }),
        );
        const authorize = await instrumentTool('cstar_forge_authorize', handleForgeAuthorize)({
            forge_request_receipt_id: requestId,
            request_sha256: requestSha256,
        });
        const execute = await instrumentTool('cstar_forge_execute', handleForgeExecute)({
            ...validForgeRequest(),
            forge_request_receipt_id: requestId,
            forge_request_decision_id: 'decision-telemetry-boundary',
            forge_request_bead_id: 'bead-telemetry-boundary',
            execution_mode: 'live_authorized',
            operator_authorization_ref: 'operator-authorization-ref',
            idempotency_key: 'telemetry-boundary-attempt',
        });

        assert.equal(JSON.parse(request.content[0]!.text).error_code, 'forge_request_contract_invalid');
        assert.equal(authorize.isError, true);
        const authorizePayload = JSON.parse(authorize.content[0]!.text);
        assert.equal(authorizePayload.error_code, 'forge_operator_authorization_required');
        assert.equal(authorizePayload.authorization_diagnostic_class, 'caller_identity_metadata');
        assert.equal(isPreAuthorizationRejection(authorize), true);
        assert.equal(
            JSON.parse(execute.content[0]!.text).error_code,
            'forge_execution_authorization_required',
        );
        assert.equal(fs.existsSync(state), false);
        assert.equal(fs.existsSync(stats), false);
    });

    it('keeps goal, bead, and result identity rejections write-free through instrumentation', async () => {
        const root = makeTelemetryRoot();
        const state = path.join(root, '.agents', 'state');
        const stats = path.join(root, '.stats');

        const goal = await instrumentTool('cstar_goal_resume', handleGoalResume)({
            repair_bead_id: 'bead:repair:telemetry-boundary',
            decision_id: 'decision:telemetry-boundary',
            host_goal_objective_sha256: 'a'.repeat(64),
            host_goal_snapshot_sha256: 'b'.repeat(64),
            observed_host_status: 'blocked',
            host_resume_capability: 'unavailable',
        });
        const bead = await instrumentTool('cstar_bead', handleBead)({
            action: 'create',
            rationale: 'Synthetic telemetry identity boundary.',
        });
        const result = await instrumentTool('cstar_record_result', handleRecordResult)({
            bead_id: 'bead:telemetry-boundary',
            verdict: 'INCONCLUSIVE',
            notes: 'Synthetic telemetry identity boundary.',
        });

        for (const response of [goal, bead, result]) {
            assert.equal(response.isError, true);
            assert.match(JSON.parse(response.content[0]!.text).error_code, /^codex_request_identity_/);
        }
        assert.equal(fs.existsSync(state), false);
        assert.equal(fs.existsSync(stats), false);
    });

    it('still records ordinary failures that occur after the authorization boundary', async () => {
        const root = makeTelemetryRoot();
        const wrapped = instrumentTool('cstar_test_mutation', async () => (
            errorResponse(new Error('codex_request_identity_attacker_chosen_post_boundary'))
        ));

        const result = await wrapped({});

        assert.equal(result.isError, true);
        const usage = fs.readFileSync(
            path.join(root, '.agents', 'state', 'cstar-kernel-mcp-usage.jsonl'),
            'utf-8',
        );
        assert.match(usage, /"ok":false/);
        assert.doesNotMatch(usage, /attacker_chosen/);
    });
});
