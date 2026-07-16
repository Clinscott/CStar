import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import { writeCountingAdapter } from './forge_durable_execution_test_support.js';

const sourceRoot = path.resolve('.');
const target = path.join(sourceRoot, 'AGENTS.md');
const originalRoot = registry.getRoot();
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalTestContext = process.env.NODE_TEST_CONTEXT;
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];

function context(session: { threadId: string; turnId: string }) {
    return validRequestContext(session.threadId, session.turnId);
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-runtime-gate-'));
    roots.push(root);
    registry.setRoot(root);
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCountingAdapter(root, true);
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    const beadId = 'bead:test:forge-runtime-lifecycle-gate';
    const decisionId = 'decision:test:forge-runtime-lifecycle-gate';
    const requestSession = createSession({ textParts: [
        `Build the repair for ${beadId} and ${decisionId}.`,
    ] });
    const db = database.getWritableDb(root);
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Synthetic runtime lifecycle gate', 'IN_PROGRESS', ?, ?)
    `).run(beadId, buildHallRepositoryId(normalizeHallPath(root)), target, now, now);
    const base = {
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: requestSession.threadId,
        objective: 'Return one bounded synthetic runtime-gate packet.',
        target_paths: [target],
        scope: 'Synthetic Forge runtime lifecycle gate.',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'adapter_invocations', threshold: '= 0' }],
        artifact_expectations: ['synthetic runtime-gate receipt'],
        prohibited_actions: ['project_files', 'authorized_source_collection'],
        requested_actions: ['response_only'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'RUNTIME_GATE_TEST', callback_required: true },
        package_locks: [],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
    };
    return { root, db, beadId, decisionId, requestSession, base };
}

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

async function authorize(value: ReturnType<typeof fixture>) {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
    const request = parse(await handleForgeRequest(value.base, context(value.requestSession)));
    const authorization = parse(await handleForgeAuthorize({
        forge_request_receipt_id: request.receipt_id,
        request_sha256: request.request_sha256,
    }, context(value.requestSession)));
    return { request, authorizationSession: value.requestSession, authorization };
}

function bindingSequence(...bindings: string[]) {
    let index = 0;
    return () => ({ binding_sha256: bindings[Math.min(index++, bindings.length - 1)]! });
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalAdapter === undefined) delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    else process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = originalAdapter;
    if (originalTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = originalTestContext;
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge runtime lifecycle gate', () => {
    it('leaves request, authorization, and attempt ledgers unchanged while runtime readiness is red', async () => {
        const value = fixture();
        delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
        const blockedRequest = parse(await handleForgeRequest(value.base, context(value.requestSession)));
        assert.match(blockedRequest.error, /forge_runtime_not_ready/);
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_requests').get().count, 0);

        process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
        const request = parse(await handleForgeRequest(value.base, context(value.requestSession)));
        delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
        const blockedAuthorization = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.receipt_id,
            request_sha256: request.request_sha256,
        }, context(value.requestSession)));
        assert.match(blockedAuthorization.error, /forge_runtime_not_ready/);
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').get().count, 0);

        process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
        const authorization = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.receipt_id,
            request_sha256: request.request_sha256,
        }, context(value.requestSession)));
        delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
        const blockedExecute = parse(await handleForgeExecute({
            ...value.base,
            forge_request_receipt_id: request.receipt_id,
            forge_request_decision_id: value.decisionId,
            forge_request_bead_id: value.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: authorization.operator_authorization_ref,
            idempotency_key: 'red-runtime-must-not-reserve',
        }, context(value.requestSession)));
        assert.match(blockedExecute.error, /forge_runtime_not_ready/);
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_attempts').get().count, 0);
        assert.equal(fs.existsSync(path.join(value.root, 'work', 'forge-executions')), false);
    });

    it('keeps no-spend request and no-op execute available while live readiness is red', async () => {
        const value = fixture();
        delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
        const noSpend = parse(await handleForgeRequest({
            ...value.base,
            decision_id: `${value.decisionId}:no-spend`,
            spend_policy: { mode: 'no_spend' as const, max_retries: 0, live_source_allowed: false },
        }, context(value.requestSession)));
        assert.equal(noSpend.status, 'no_spend_request_recorded');
        const noOp = parse(await handleForgeExecute({
            ...value.base,
            forge_request_receipt_id: 'dispatch-forge-00000000000000000000000000000000',
            forge_request_decision_id: value.decisionId,
            forge_request_bead_id: value.beadId,
            execution_mode: 'no_op' as const,
            operator_authorization_ref: 'not-used-by-no-op',
            idempotency_key: 'red-runtime-no-op',
        }, context(value.requestSession)));
        assert.equal(noOp.status, 'validated_noop');
        assert.equal(noOp.forge_execution.attempted, false);
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_attempts').get().count, 0);
    });

    it('detects pre-reservation binding drift without a durable attempt or adapter invocation', async () => {
        const value = fixture();
        const granted = await authorize(value);
        const result = parse(await handleForgeExecute({
            ...value.base,
            forge_request_receipt_id: granted.request.receipt_id,
            forge_request_decision_id: value.decisionId,
            forge_request_bead_id: value.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: granted.authorization.operator_authorization_ref,
            idempotency_key: 'runtime-drift-before-reservation',
        }, context(granted.authorizationSession), bindingSequence('binding-a', 'binding-b')));
        assert.match(result.error, /forge_runtime_binding_drift/);
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_attempts').get().count, 0);
        assert.equal(fs.existsSync(path.join(value.root, 'forge-adapter-invoked')), false);
    });

    it('finalizes post-reservation drift without invoking the adapter or claiming spend', async () => {
        const value = fixture();
        const granted = await authorize(value);
        const result = parse(await handleForgeExecute({
            ...value.base,
            forge_request_receipt_id: granted.request.receipt_id,
            forge_request_decision_id: value.decisionId,
            forge_request_bead_id: value.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: granted.authorization.operator_authorization_ref,
            idempotency_key: 'runtime-drift-after-reservation',
        }, context(granted.authorizationSession), bindingSequence('binding-a', 'binding-a', 'binding-b')));
        assert.equal(result.status, 'failed_final');
        assert.match(result.error, /forge_runtime_binding_drift/);
        assert.equal(result.forge_execution.attempted, false);
        assert.equal(result.forge_execution.adapter_invoked, false);
        assert.equal(result.forge_execution.live_spend, false);
        const attempt = value.db.prepare(
            'SELECT status, error_code FROM hall_forge_attempts',
        ).get() as { status: string; error_code: string };
        assert.equal(attempt.status, 'FAILED_FINAL');
        assert.match(attempt.error_code, /forge_runtime_binding_drift/);
        assert.equal(fs.existsSync(path.join(value.root, 'forge-adapter-invoked')), false);
    });
});
