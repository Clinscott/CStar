import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import {
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { DISPATCH_RED_ACTIONS } from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_action_authority.js';
import { handleForgeAuthorize as rawHandleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute as rawHandleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeRequest as rawHandleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    buildForgeRequestId,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import type { LegacyCanonicalForgeRequestV2 } from '../../../src/tools/cstar-kernel-mcp/tools/forge_legacy_v2_compatibility.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    restoreEnv,
    validRequestContext,
} from './operator_authorization_test_support.js';

const SOURCE_ROOT = path.resolve('.');
const handleForgeRequest: typeof rawHandleForgeRequest = (args, context) =>
    rawHandleForgeRequest(args, context);
const handleForgeAuthorize: typeof rawHandleForgeAuthorize = (args, context) =>
    rawHandleForgeAuthorize(args, context);
const handleForgeExecute: typeof rawHandleForgeExecute = (args, context) =>
    rawHandleForgeExecute(args, context);
const originalRoot = registry.getRoot();
const savedEnv = {
    worker: process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT,
    testMode: process.env.CSTAR_FORGE_TEST_MODE,
    runtimeTestBypass: process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS,
    hermes: process.env.HERMES_BIN,
    modelResponse: process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE,
    artifacts: process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT,
    home: process.env.HOME,
    nodeTestContext: process.env.NODE_TEST_CONTEXT,
    callerThread: process.env.CSTAR_MCP_CALLER_THREAD_ID,
    callerTransport: process.env.CSTAR_MCP_CALLER_TRANSPORT,
};
const roots: string[] = [];

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function writePreflightHermes(root: string): string {
    const executable = path.join(root, 'synthetic-hermes.mjs');
    fs.writeFileSync(executable, [
        `#!${process.execPath}`,
        'const args=process.argv.slice(2);',
        'if(args.length===1&&args[0]==="--version")process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if(args.length===1&&args[0]==="--help")process.stdout.write("--profile --provider --model\\n");',
        'else if(args.length===2&&args[0]==="chat"&&args[1]==="--help")process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");',
        'else if(args.length===1&&args[0]==="--oauth-status")process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v2",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,horizon_seconds:2100,horizon_started_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS),required_until_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS),horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}));',
        'else process.exit(91);',
    ].join('\n'));
    fs.chmodSync(executable, 0o700);
    return executable;
}

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-v2-public-'));
    roots.push(root);
    const project = path.join(root, 'project');
    const output = path.join(project, 'output.ts');
    const lockPath = path.join(project, 'package-lock.json');
    const surface = path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md');
    fs.mkdirSync(path.dirname(surface), { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(surface, '# Synthetic Forge surface\n');
    fs.writeFileSync(lockPath, '{"lockfileVersion":3}\n');
    const modelResponse = path.join(project, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify({
        status: 'success',
        summary: 'Applied the bounded legacy continuity fixture.',
        files: [{ path: 'output.ts', content: 'export const legacyV2 = true;\n' }],
        artifacts: {},
        validation: { focused: 'pass' },
        metrics: { files_written: 1 },
        boundaries: { live_source_collection: false, git_mutation: false },
        callback_packet: 'LEGACY_V2_PUBLIC_PACKET',
    }));
    const home = path.join(root, 'home');
    fs.mkdirSync(path.join(home, '.hermes', 'profiles', 'cstar-hub'), { recursive: true });
    const runtimeDir = path.join(root, 'forge-runtime');
    fs.mkdirSync(runtimeDir, { mode: 0o700 });
    for (const name of [
        'forge_worker_adapter.py',
        'forge_worker_safety.py',
        'forge_worker_evidence.py',
        'hermes_minimax_delegate.mjs',
        'forge_delegate_evidence.mjs',
        'forge_delegate_preflight.mjs',
        'hermes_runtime_lineage.mjs',
        'forge_role_plan.mjs',
    ]) {
        fs.copyFileSync(path.join(
            SOURCE_ROOT, '.agents', 'skills', 'corvus-forge', 'scripts', name,
        ), path.join(runtimeDir, name));
    }
    fs.chmodSync(path.join(runtimeDir, 'hermes_minimax_delegate.mjs'), 0o700);
    registry.setRoot(root);
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = path.join(
        runtimeDir, 'forge_worker_adapter.py',
    );
    process.env.HERMES_BIN = writePreflightHermes(root);
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = path.join(root, 'artifacts');
    fs.mkdirSync(process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT, { mode: 0o700 });
    process.env.HOME = home;

    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = 'bead:test:legacy-v2-public-path';
    const decisionId = 'decision:test:legacy-v2-public-path';
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Legacy v2 public path test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, project, now, now);
    const legacy: LegacyCanonicalForgeRequestV2 = {
        schema: 'cstar.forge_request.v2',
        bead_id: beadId,
        decision_id: decisionId,
        state_update_thread_id: null,
        source_callback_thread_id: '019f0000-0000-7000-8000-000000000001',
        objective: 'Build one bounded synthetic output.',
        prompt: null,
        target_paths: [project],
        required_output_paths: [output],
        system_under_test: null,
        scope: 'Synthetic legacy v2 public path only.',
        authority_lane: 'yellow',
        required_metrics: [{
            name: 'bounded_output', threshold: '= pass', acceptance_rule: null, unit: null,
        }],
        artifact_expectations: ['bounded synthetic output'],
        prohibited_actions: ['collect external sources', 'write outside the required output'].sort(),
        requested_actions: ['edit exactly the required output'],
        spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source. Execute only after a separately bound exact operator grant.',
        retry_budget: 0,
        callback_contract: {
            expected_packet: 'LEGACY_V2_PUBLIC_PACKET', callback_required: true,
            callback_thread_id: '019f0000-0000-7000-8000-000000000001',
        },
        package_locks: [{ path: lockPath, sha256: sha256(fs.readFileSync(lockPath)) }],
        dispatch_surface_ref: 'docs/operations/corvus-forge-skill-spec.md',
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        adapter_runtime: { schema: 'legacy_adapter_runtime', sha256: '1'.repeat(64) },
        write_capability: 'project_files',
        max_attempts: 1,
    };
    const summary = stableJson(legacy);
    const requestSha256 = sha256(summary);
    const requestId = buildForgeRequestId(requestSha256);
    saveForgeRequest(db, {
        request_id: requestId,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: decisionId,
        request_sha256: requestSha256,
        request_summary_json: summary,
        target_paths_sha256: sha256(stableJson(legacy.target_paths)),
        live_source_allowed: false,
        max_attempts: 1,
        adapter_ref: legacy.adapter_ref!,
        write_capability: 'project_files',
    });
    const prohibitedActions = ['authorized_source_collection', ...DISPATCH_RED_ACTIONS];
    const baseArgs = {
        bead_id: beadId,
        decision_id: decisionId,
        state_update_thread_id: undefined,
        source_callback_thread_id: legacy.source_callback_thread_id,
        objective: legacy.objective,
        target_paths: legacy.target_paths,
        required_output_paths: legacy.required_output_paths,
        scope: legacy.scope,
        authority_lane: legacy.authority_lane,
        required_metrics: legacy.required_metrics.map((metric) => ({
            name: metric.name,
            threshold: metric.threshold,
        })),
        artifact_expectations: legacy.artifact_expectations,
        prohibited_actions: prohibitedActions,
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: legacy.live_source_policy,
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: legacy.callback_contract,
        package_locks: legacy.package_locks,
        dispatch_surface_ref: legacy.dispatch_surface_ref!,
        execution_adapter_ref: legacy.adapter_ref!,
    };
    return {
        root, db, output, modelResponse, runtimeDir,
        legacy, summary, requestSha256, requestId, baseArgs,
    };
}

async function reconcileAndAuthorize(fixture: ReturnType<typeof createFixture>) {
    const requestSession = createSession({ textParts: ['Reconcile the bounded legacy request.'] });
    const pending = parse(await handleForgeRequest(
        fixture.baseArgs,
        validRequestContext(requestSession.threadId, requestSession.turnId),
    ));
    const authorizationSession = createSession({ textParts: [pending.authorization_challenge] });
    const authorizationContext = validRequestContext(
        authorizationSession.threadId,
        authorizationSession.turnId,
    );
    const authorized = parse(await handleForgeAuthorize({
        forge_request_receipt_id: fixture.requestId,
        request_sha256: fixture.requestSha256,
    }, authorizationContext));
    return { pending, authorized, authorizationContext, requestSession };
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv('CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT', savedEnv.worker);
    restoreEnv('CSTAR_FORGE_TEST_MODE', savedEnv.testMode);
    restoreEnv('CSTAR_FORGE_RUNTIME_TEST_BYPASS', savedEnv.runtimeTestBypass);
    restoreEnv('HERMES_BIN', savedEnv.hermes);
    restoreEnv('CSTAR_FORGE_WORKER_MODEL_RESPONSE', savedEnv.modelResponse);
    restoreEnv('CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT', savedEnv.artifacts);
    restoreEnv('HOME', savedEnv.home);
    restoreEnv('NODE_TEST_CONTEXT', savedEnv.nodeTestContext);
    restoreEnv('CSTAR_MCP_CALLER_THREAD_ID', savedEnv.callerThread);
    restoreEnv('CSTAR_MCP_CALLER_TRANSPORT', savedEnv.callerTransport);
    cleanupOperatorAuthorizationFixtures();
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('legacy Forge v2 public continuity path', () => {
    it('reconciles, authorizes, executes once, and replays without replacing the request', async () => {
        const fixture = createFixture();
        const { pending, authorized, authorizationContext, requestSession } =
            await reconcileAndAuthorize(fixture);

        assert.equal(pending.status, 'legacy_v2_compatibility_pending', JSON.stringify(pending, null, 2));
        assert.equal(pending.receipt_id, fixture.requestId);
        assert.equal(pending.request_sha256, fixture.requestSha256);
        assert.match(pending.authorization_challenge, /^CSTAR_FORGE_AUTHORIZE v2-compat-v1 /);
        assert.equal(fixture.db.prepare('SELECT COUNT(*) FROM hall_forge_requests').pluck().get(), 1);
        const reconciled = getForgeRequest(fixture.db, fixture.requestId)!;
        assert.equal(reconciled.request_summary_json, fixture.summary);
        assert.equal(reconciled.requester_thread_id, requestSession.threadId);
        assert.equal(reconciled.requester_turn_id, requestSession.turnId);
        assert.equal(pending.authorization_manifest.compatibility_manifest
            .legacy_requester_lineage.status, 'recorded_v2_extension');

        assert.equal(authorized.status, 'authorized');
        assert.equal(authorized.execution_grant_sha256, pending.authorization_manifest.compatibility_manifest_sha256);

        const executeArgs = {
            ...fixture.baseArgs,
            forge_request_receipt_id: fixture.requestId,
            forge_request_decision_id: fixture.legacy.decision_id,
            forge_request_bead_id: fixture.legacy.bead_id,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: authorized.operator_authorization_ref,
            idempotency_key: 'legacy-v2-public-one-shot',
        };
        const executed = parse(await handleForgeExecute(executeArgs, authorizationContext));
        const replay = parse(await handleForgeExecute(executeArgs, authorizationContext));

        assert.equal(executed.status, 'delivered_unverified', JSON.stringify(executed, null, 2));
        assert.equal(executed.forge_execution.adapter_invoked, true);
        assert.equal(executed.forge_execution.live_source_collection, false);
        assert.equal(fs.readFileSync(fixture.output, 'utf-8'), 'export const legacyV2 = true;\n');
        assert.equal(replay.status, 'delivered_pending_validation_replay');
        assert.equal(replay.forge_execution.adapter_invoked, false);
        assert.equal(
            fixture.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?')
                .pluck().get(fixture.requestId),
            1,
        );
        const stored = getForgeRequest(fixture.db, fixture.requestId)!;
        assert.equal(stored.request_sha256, fixture.requestSha256);
        assert.equal(stored.request_summary_json, fixture.summary);

        const evidencePath = path.join(fixture.root, 'independent-v2-validation.txt');
        fs.writeFileSync(evidencePath, 'legacy v2 output independently validated\n');
        const evidenceSha256 = sha256(fs.readFileSync(evidencePath));
        const outputSha256 = sha256(fs.readFileSync(fixture.output));
        const responseArtifact = executed.forge_execution.adapter_result.envelope.response_artifact;
        const validatorSession = createSession({
            textParts: ['Independently validate the delivered legacy v2 Forge output.'],
        });
        delete process.env.NODE_TEST_CONTEXT;
        process.env.CSTAR_MCP_CALLER_THREAD_ID = validatorSession.threadId;
        process.env.CSTAR_MCP_CALLER_TRANSPORT = 'direct-stdio';
        const validation = parse(await handleRecordResult({
            bead_id: fixture.legacy.bead_id,
            verdict: 'SUCCESS',
            validation_id: 'validation:legacy-v2-public-path',
            forge_execution_receipt_id: executed.execution_receipt_id,
            validation_evidence: {
                artifacts: [
                    { path: evidencePath, sha256: evidenceSha256 },
                    { path: fixture.output, sha256: outputSha256 },
                    { path: responseArtifact.path, sha256: responseArtifact.sha256 },
                ],
                checks: [{
                    name: 'legacy v2 bounded output',
                    status: 'pass',
                    evidence_path: evidencePath,
                    sha256: evidenceSha256,
                }],
            },
        }, validRequestContext(validatorSession.threadId, validatorSession.turnId)));
        assert.notEqual(validatorSession.threadId, requestSession.threadId);
        assert.notEqual(validatorSession.threadId, authorizationContext._meta.threadId);
        assert.equal(validation.status, 'recorded_verified', JSON.stringify(validation, null, 2));
        assert.equal(validation.forge_validation.accepted, true);
        assert.equal(validation.forge_validation.attempt_status, 'SUCCEEDED');
        assert.equal(validation.forge_validation.request_status, 'SUCCEEDED');
    });

    it('rejects a semantic widening before challenge publication or request mutation', async () => {
        const fixture = createFixture();
        const requestSession = createSession({ textParts: ['Attempt a widened reconciliation.'] });
        const widened = parse(await handleForgeRequest({
            ...fixture.baseArgs,
            scope: `${fixture.baseArgs.scope} Add another subsystem.`,
        }, validRequestContext(requestSession.threadId, requestSession.turnId)));

        assert.equal(widened.error, 'forge_legacy_v2_semantic_reconciliation_mismatch');
        assert.equal(fixture.db.prepare('SELECT COUNT(*) FROM hall_forge_requests').pluck().get(), 1);
        const stored = getForgeRequest(fixture.db, fixture.requestId)!;
        assert.equal(stored.status, 'PENDING_AUTH');
        assert.equal(stored.request_summary_json, fixture.summary);
        assert.equal(stored.authorization_profile, undefined);
    });

    it('rejects runtime drift before reservation or provider invocation', async () => {
        const fixture = createFixture();
        const { authorized, authorizationContext } = await reconcileAndAuthorize(fixture);
        fs.appendFileSync(path.join(fixture.runtimeDir, 'forge_worker_safety.py'), '\n# drift\n');
        const result = parse(await handleForgeExecute({
            ...fixture.baseArgs,
            forge_request_receipt_id: fixture.requestId,
            forge_request_decision_id: fixture.legacy.decision_id,
            forge_request_bead_id: fixture.legacy.bead_id,
            execution_mode: 'live_authorized',
            operator_authorization_ref: authorized.operator_authorization_ref,
            idempotency_key: 'legacy-v2-runtime-drift',
        }, authorizationContext));

        assert.equal(result.error, 'forge_legacy_v2_execution_grant_mismatch');
        assert.equal(
            fixture.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?')
                .pluck().get(fixture.requestId),
            0,
        );
        assert.equal(fs.existsSync(fixture.output), false);
    });
});
