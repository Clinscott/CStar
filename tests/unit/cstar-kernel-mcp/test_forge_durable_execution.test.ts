import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeExecute as rawHandleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeAuthorize as rawHandleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest as rawHandleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    writeCountingAdapter,
    writeSingleInputSession,
} from './forge_durable_execution_test_support.js';

const originalRoot = registry.getRoot();
const originalCodexHome = process.env.CODEX_HOME;
const originalCallerThread = process.env.CSTAR_MCP_CALLER_THREAD_ID;
const originalCallerTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT;
const originalForgeTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalForgeRuntimeTestBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalSentinel = process.env.CSTAR_FORGE_TEST_SENTINEL;
const temporaryRoots: string[] = [];
const CSTAR_TARGET = path.resolve('AGENTS.md');
const DURABLE_BEAD_ID = 'bead:test:durable-forge-handler';
const handleForgeRequest: typeof rawHandleForgeRequest = (args, context) =>
    rawHandleForgeRequest(args, context);
const handleForgeAuthorize: typeof rawHandleForgeAuthorize = (args, context) =>
    rawHandleForgeAuthorize(args, context);
const handleForgeExecute: typeof rawHandleForgeExecute = (args, context) =>
    rawHandleForgeExecute(args, context);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function writeAuthorizationSession(codexHome: string, target: string, decisionId: string) {
    const threadId = randomUUID();
    const turnId = randomUUID();
    const timestamp = new Date().toISOString();
    const content = [{
        type: 'input_text',
        text: `Build the repair for ${DURABLE_BEAD_ID} and ${decisionId}.`,
    }];
    const messageSha256 = sha256(JSON.stringify(content));
    const sessionDir = path.join(codexHome, 'sessions', '2026', '07', '12');
    fs.mkdirSync(sessionDir, { recursive: true });
    const rows = [
        {
            timestamp,
            type: 'session_meta',
            payload: {
                id: threadId,
                thread_source: 'user',
                parent_thread_id: null,
                agent_path: null,
                forked_from_id: null,
            },
        },
        {
            timestamp,
            type: 'response_item',
            payload: {
                type: 'message', role: 'user', content,
                internal_chat_message_metadata_passthrough: { turn_id: turnId },
            },
        },
    ];
    const sessionFile = path.join(sessionDir, `rollout-fixture-${threadId}.jsonl`);
    fs.writeFileSync(
        sessionFile,
        `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        { mode: 0o600 },
    );
    return {
        threadId,
        turnId,
        sessionFile,
        reference: `codex-thread:${threadId}:turn:${turnId}:sha256:${messageSha256}`,
    };
}

function requestContext(authorization: { threadId: string; turnId: string }) {
    return {
        requestId: 9,
        _meta: {
            threadId: authorization.threadId,
            'x-codex-turn-metadata': {
                session_id: authorization.threadId,
                thread_id: authorization.threadId,
                turn_id: authorization.turnId,
                thread_source: 'user',
                parent_thread_id: null,
                forked_from_thread_id: null,
                subagent_kind: null,
            },
        },
    };
}

function createFixture(decisionId = 'decision-test-durable-forge-handler') {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-durable-'));
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, 'docs', 'operations'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md'), '# Forge spec\n');
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-pipeline-playbook.md'), '# Forge playbook\n');
    const codexHome = path.join(root, 'codex-home');
    fs.mkdirSync(codexHome, { recursive: true });
    const authorization = writeAuthorizationSession(codexHome, CSTAR_TARGET, decisionId);
    registry.setRoot(root);
    process.env.CODEX_HOME = codexHome;
    process.env.CSTAR_MCP_CALLER_THREAD_ID = authorization.threadId;
    process.env.CSTAR_MCP_CALLER_TRANSPORT = 'direct-stdio';
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCountingAdapter(root);
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = DURABLE_BEAD_ID;
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Durable Forge handler test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, CSTAR_TARGET, now, now);
    return { root, codexHome, authorization, beadId };
}

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv('CODEX_HOME', originalCodexHome);
    restoreEnv('CSTAR_MCP_CALLER_THREAD_ID', originalCallerThread);
    restoreEnv('CSTAR_MCP_CALLER_TRANSPORT', originalCallerTransport);
    restoreEnv('CSTAR_FORGE_TEST_MODE', originalForgeTestMode);
    restoreEnv('CSTAR_FORGE_RUNTIME_TEST_BYPASS', originalForgeRuntimeTestBypass);
    restoreEnv('CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT', originalAdapter);
    restoreEnv('CSTAR_FORGE_TEST_SENTINEL', originalSentinel);
    while (temporaryRoots.length > 0) fs.rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
});

describe('CStar durable Forge public path', () => {
    it('does not grant verified authority without an exact work receipt subject', async () => {
        const fixture = createFixture();
        const artifactPath = path.join(fixture.root, 'request-meta-artifact.txt');
        const checkPath = path.join(fixture.root, 'request-meta-check.txt');
        fs.writeFileSync(artifactPath, 'artifact bytes\n');
        fs.writeFileSync(checkPath, 'check passed\n');
        delete process.env.CSTAR_MCP_CALLER_THREAD_ID;
        process.env.CSTAR_FORGE_TEST_MODE = '0';

        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'SUCCESS',
            validation_id: 'val-codex-request-meta-binding',
            validation_evidence: {
                artifacts: [{ path: artifactPath, sha256: sha256(fs.readFileSync(artifactPath, 'utf-8')) }],
                checks: [{
                    name: 'request metadata binding check',
                    status: 'pass',
                    evidence_path: checkPath,
                    sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
                }],
            },
        }, requestContext(fixture.authorization));

        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'partial');
        assert.equal(parsed.authoritative, false);
        assert.equal(parsed.validation_persisted, false);
        assert.equal(parsed.validation_warning, 'validation_evidence_work_receipt_subject_required');
    });

    it('fails closed without host request metadata when the shared MCP child has no thread env', async () => {
        const fixture = createFixture();
        const artifactPath = path.join(fixture.root, 'missing-meta-artifact.txt');
        const checkPath = path.join(fixture.root, 'missing-meta-check.txt');
        fs.writeFileSync(artifactPath, 'artifact bytes\n');
        fs.writeFileSync(checkPath, 'check passed\n');
        delete process.env.CSTAR_MCP_CALLER_THREAD_ID;
        process.env.CSTAR_FORGE_TEST_MODE = '0';

        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'SUCCESS',
            validation_id: 'val-codex-request-meta-missing',
            validation_evidence: {
                artifacts: [{ path: artifactPath, sha256: sha256(fs.readFileSync(artifactPath, 'utf-8')) }],
                checks: [{
                    name: 'missing metadata check',
                    status: 'pass',
                    evidence_path: checkPath,
                    sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
                }],
            },
        });

        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.error, 'codex_request_identity_metadata_required');
        const db = database.getReadDb(fixture.root);
        const persisted = db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get('val-codex-request-meta-missing');
        assert.equal(persisted, undefined);
    });

    it('rolls back the validation row when Forge finalization fails', async () => {
        const fixture = createFixture();
        const artifactPath = path.join(fixture.root, 'independent-artifact.txt');
        const checkPath = path.join(fixture.root, 'independent-check.txt');
        fs.writeFileSync(artifactPath, 'artifact bytes\n');
        fs.writeFileSync(checkPath, 'check passed\n');

        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'SUCCESS',
            validation_id: 'val-rollback-on-forge-finalization-failure',
            forge_execution_receipt_id: 'missing-forge-execution-receipt',
            validation_evidence: {
                artifacts: [{ path: artifactPath, sha256: sha256(fs.readFileSync(artifactPath, 'utf-8')) }],
                checks: [{
                    name: 'independent check',
                    status: 'pass',
                    evidence_path: checkPath,
                    sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
                }],
            },
        }, requestContext(fixture.authorization));
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'partial');
        assert.equal(parsed.validation_persisted, false);
        assert.equal(parsed.validation_authority, 'not_persisted');
        assert.equal(parsed.authoritative, false);
        assert.equal(parsed.stored_verdict, null);
        assert.equal(parsed.mutation, undefined);
        assert.equal(parsed.forge_validation_warning, 'forge_execution_receipt_not_found');

        const db = database.getReadDb(fixture.root);
        const persisted = db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get('val-rollback-on-forge-finalization-failure');
        assert.equal(persisted, undefined);
    });

    it('classifies unsafe trace preflight as failed-final before adapter start', async () => {
        const fixture = createFixture('decision-test-trace-preflight-fail-closed');
        const decisionId = 'decision-test-trace-preflight-fail-closed';
        const base = {
            bead_id: fixture.beadId,
            decision_id: decisionId,
            source_callback_thread_id: fixture.authorization.threadId,
            objective: 'Produce a sealed response-only validation packet',
            prompt: 'Return only the bounded durable Forge test packet.',
            target_paths: [CSTAR_TARGET],
            scope: 'CStar trace preflight authority test only',
            authority_lane: 'yellow' as const,
            required_metrics: [{ name: 'adapter_invocations', threshold: '= 0' }],
            artifact_expectations: ['DURABLE_FORGE_TEST_PACKET'],
            prohibited_actions: ['git_merge', 'git_push', 'deploy', 'authorized_source_collection'],
            requested_actions: ['response_only'],
            spend_policy: {
                mode: 'live_authorized' as const,
                max_retries: 0,
                live_source_allowed: false,
            },
            live_source_policy: 'no live source collection',
            fixture_policy: 'synthetic_only' as const,
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: {
                expected_packet: 'DURABLE_FORGE_TEST_PACKET',
                callback_required: true,
            },
            package_locks: [],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };
        const requestResult = await handleForgeRequest(base, requestContext(fixture.authorization));
        assert.equal(requestResult.isError, undefined, requestResult.content[0].text);
        const request = JSON.parse(requestResult.content[0].text);
        assert.equal(request.status, 'pending_authorization_recorded');
        const authorizeResult = await handleForgeAuthorize({
            forge_request_receipt_id: request.receipt_id,
            request_sha256: request.request_sha256,
        }, requestContext(fixture.authorization));
        const authorization = JSON.parse(authorizeResult.content[0].text);
        assert.equal(authorization.status, 'authorized', authorizeResult.content[0].text);

        const workRoot = path.join(fixture.root, 'work');
        const outsideArtifacts = path.join(fixture.root, 'outside-artifacts');
        fs.mkdirSync(workRoot);
        fs.mkdirSync(outsideArtifacts, { mode: 0o700 });
        fs.symlinkSync(outsideArtifacts, path.join(workRoot, 'forge-executions'));
        const result = await handleForgeExecute({
            ...base,
            forge_request_receipt_id: request.receipt_id,
            forge_request_decision_id: decisionId,
            forge_request_bead_id: fixture.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: authorization.operator_authorization_ref,
            idempotency_key: 'trace-preflight-must-not-spawn',
        }, requestContext(fixture.authorization));
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'failed_final');
        assert.equal(parsed.attempt_status, 'FAILED_FINAL');
        assert.equal(parsed.forge_execution.attempted, false);
        assert.equal(parsed.forge_execution.adapter_invoked, false);
        assert.equal(parsed.forge_execution.live_spend, false);
        assert.match(parsed.error, /forge_artifact_directory_unsafe_type/);
        assert.deepEqual(fs.readdirSync(outsideArtifacts), []);
    });

    it('records one authorized request, preserves ambiguous spend, and replays without another invocation', async () => {
        const fixture = createFixture();
        const decisionId = 'decision-test-durable-forge-handler';
        const base = {
            bead_id: fixture.beadId,
            decision_id: decisionId,
            state_update_thread_id: fixture.authorization.threadId,
            source_callback_thread_id: fixture.authorization.threadId,
            objective: 'Produce a sealed response-only validation packet',
            prompt: 'Return only the bounded durable Forge test packet.',
            target_paths: [CSTAR_TARGET],
            scope: 'CStar durable Forge authority test only',
            authority_lane: 'yellow' as const,
            required_metrics: [{ name: 'adapter_invocations', threshold: '= 1' }],
            artifact_expectations: ['DURABLE_FORGE_TEST_PACKET'],
            prohibited_actions: ['git_merge', 'git_push', 'deploy', 'authorized_source_collection'],
            requested_actions: ['response_only'],
            spend_policy: {
                mode: 'live_authorized' as const,
                max_retries: 0,
                live_source_allowed: false,
            },
            live_source_policy: 'no live source collection',
            fixture_policy: 'synthetic_only' as const,
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: {
                expected_packet: 'DURABLE_FORGE_TEST_PACKET',
                callback_required: true,
                callback_thread_id: fixture.authorization.threadId,
            },
            package_locks: [],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };

        const requestResult = await handleForgeRequest(base, requestContext(fixture.authorization));
        assert.equal(requestResult.isError, undefined, requestResult.content[0].text);
        const request = JSON.parse(requestResult.content[0].text);
        assert.equal(request.status, 'pending_authorization_recorded');
        assert.match(request.receipt_id, /^dispatch-forge-/);
        const authorizeResult = await handleForgeAuthorize({
            forge_request_receipt_id: request.receipt_id,
            request_sha256: request.request_sha256,
        }, requestContext(fixture.authorization));
        const authorization = JSON.parse(authorizeResult.content[0].text);
        assert.equal(authorization.status, 'authorized', authorizeResult.content[0].text);
        const persisted = database.getReadDb(fixture.root).prepare(`
            SELECT operator_record_sha256, operator_record_set_sha256, operator_record_count
            FROM hall_forge_requests WHERE request_id = ?
        `).get(request.receipt_id) as Record<string, unknown>;
        assert.match(String(persisted.operator_record_sha256), /^[a-f0-9]{64}$/);
        assert.match(String(persisted.operator_record_set_sha256), /^[a-f0-9]{64}$/);
        assert.equal(persisted.operator_record_count, 1);

        const executeArgs = {
            ...base,
            forge_request_receipt_id: request.receipt_id,
            forge_request_decision_id: decisionId,
            forge_request_bead_id: fixture.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: authorization.operator_authorization_ref,
            idempotency_key: 'durable-handler-one-shot',
        };
        const laterSession = writeSingleInputSession(
            fixture.codexHome,
            'A later root-user turn cannot spend the exact one-turn grant.',
        );
        const driftResult = await handleForgeExecute(
            { ...executeArgs, idempotency_key: 'record-set-drift' },
            requestContext(laterSession),
        );
        assert.equal(driftResult.isError, true);
        assert.equal(
            JSON.parse(driftResult.content[0].text).error_code,
            'forge_execution_authorization_required',
        );
        const attemptsBefore = database.getReadDb(fixture.root).prepare(`
            SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?
        `).get(request.receipt_id) as { count: number };
        assert.equal(attemptsBefore.count, 0);

        const firstResult = await handleForgeExecute(executeArgs, requestContext(fixture.authorization));
        assert.equal(firstResult.isError, true, firstResult.content[0].text);
        const first = JSON.parse(firstResult.content[0].text);
        assert.equal(first.status, 'ambiguous');
        assert.equal(first.attempt_status, 'UNKNOWN');
        assert.equal(first.request_status, 'AMBIGUOUS');
        assert.equal(first.forge_execution.adapter_result.envelope.requested_model, 'MiniMax-M3');
        assert.equal(first.forge_execution.adapter_result.envelope.actual_model, null);
        assert.equal(first.forge_execution.adapter_result.envelope.model_source, 'unreported');
        assert.equal(first.forge_execution.adapter_result.envelope.live_spend, null);
        assert.equal(first.forge_execution.adapter_result.envelope.live_spend_unknown, true);
        const firstArtifact = first.forge_execution.adapter_result.envelope.response_artifact;
        const firstArtifactStat = fs.statSync(firstArtifact.path);
        const executionRoot = path.dirname(path.dirname(firstArtifact.path));
        const executionDirectoriesBeforeReplay = fs.readdirSync(executionRoot).sort();

        const deniedReplayResult = await handleForgeExecute({
            ...executeArgs,
            operator_authorization_ref: `${authorization.operator_authorization_ref}-tampered`,
        }, requestContext(laterSession));
        assert.equal(deniedReplayResult.isError, true);
        assert.equal(
            JSON.parse(deniedReplayResult.content[0].text).error_code,
            'forge_execution_authorization_required',
        );

        const tamperDb = database.getWritableDb(fixture.root);
        tamperDb.prepare(`
            UPDATE hall_forge_requests SET expires_at = expires_at + 1 WHERE request_id = ?
        `).run(request.receipt_id);
        const timeDriftReplayResult = await handleForgeExecute(
            executeArgs,
            requestContext(laterSession),
        );
        assert.equal(timeDriftReplayResult.isError, true);
        assert.equal(
            JSON.parse(timeDriftReplayResult.content[0].text).error_code,
            'forge_execution_authorization_required',
        );
        tamperDb.prepare(`
            UPDATE hall_forge_requests SET expires_at = expires_at - 1 WHERE request_id = ?
        `).run(request.receipt_id);

        const pendingReplayResult = await handleForgeExecute(executeArgs, requestContext(laterSession));
        assert.equal(pendingReplayResult.isError, true, pendingReplayResult.content[0].text);
        const pendingReplay = JSON.parse(pendingReplayResult.content[0].text);
        assert.equal(pendingReplay.status, 'ambiguous_replay');
        assert.equal(pendingReplay.replayed, true);
        assert.equal(pendingReplay.attempt_status, 'UNKNOWN');
        assert.equal(pendingReplay.forge_execution.fail_closed_reason, 'durable_attempt_unknown');
        assert.equal(fs.statSync(firstArtifact.path).mtimeMs, firstArtifactStat.mtimeMs);
        assert.deepEqual(fs.readdirSync(executionRoot).sort(), executionDirectoriesBeforeReplay);
        const attemptsAfter = database.getReadDb(fixture.root).prepare(`
            SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?
        `).get(request.receipt_id) as { count: number };
        assert.equal(attemptsAfter.count, 1);
    });
});
