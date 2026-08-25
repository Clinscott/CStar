import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';

const originalRoot = registry.getRoot();
const originalCodexHome = process.env.CODEX_HOME;
const originalCallerThread = process.env.CSTAR_MCP_CALLER_THREAD_ID;
const originalCallerTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT;
const originalForgeTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalSentinel = process.env.CSTAR_FORGE_TEST_SENTINEL;
const temporaryRoots: string[] = [];
const CSTAR_TARGET = '/home/morderith/Corvus/CStar/AGENTS.md';

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function writeAuthorizationSession(codexHome: string, target: string) {
    const threadId = randomUUID();
    const turnId = randomUUID();
    const timestamp = new Date().toISOString();
    const content = [{
        type: 'input_text',
        text: `Corvus CStar 5.6. I authorize you to complete the audit in full using one CStar Forge execution through Hermes and M3, targeting exactly ${target}.`,
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
        ...['first steering update', 'second steering update'].map((text, index) => ({
            timestamp: new Date(Date.parse(timestamp) + (index + 1) * 1_000).toISOString(),
            type: 'response_item',
            payload: {
                type: 'message', role: 'user',
                content: [{ type: 'input_text', text }],
                internal_chat_message_metadata_passthrough: { turn_id: turnId },
            },
        })),
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

function writeCountingAdapter(root: string): string {
    const script = path.join(root, 'sealed-forge-adapter.py');
    fs.writeFileSync(script, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file, encoding="utf-8") as handle:',
        '    intent = json.load(handle)',
        'write_to = intent["payload"]["write_to"]',
        'sentinel = write_to + ".count"',
        'count = int(open(sentinel).read()) if os.path.exists(sentinel) else 0',
        'with open(sentinel, "w", encoding="utf-8") as handle:',
        '    handle.write(str(count + 1))',
        'response = {',
        '    "status": "pass",',
        '    "summary": "sealed durable Forge fixture",',
        '    "files_changed": [],',
        '    "artifacts": {},',
        '    "validation": {"sealed_fixture": "pass"},',
        '    "metrics": {"adapter_invocations": 1},',
        '    "boundaries": {"codex_worker_fallback_allowed": False, "live_source_collection": False},',
        '    "callback_packet": "DURABLE_FORGE_TEST_PACKET",',
        '}',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'with open(write_to, "w", encoding="utf-8") as handle:',
        '    json.dump(response, handle)',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "sealed-fixture-intent",',
        '    "model": intent["payload"]["model"],',
        '    "hermes_profile": intent["payload"]["hermes_profile"],',
        '    "wrote_to": write_to,',
        '    "live_spend": False,',
        '    "live_source_collection": False,',
        '}))',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return script;
}

function createFixture() {
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-durable-'));
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, 'docs', 'operations'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md'), '# Forge spec\n');
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-pipeline-playbook.md'), '# Forge playbook\n');
    const codexHome = path.join(root, 'codex-home');
    fs.mkdirSync(codexHome, { recursive: true });
    const authorization = writeAuthorizationSession(codexHome, CSTAR_TARGET);
    registry.setRoot(root);
    process.env.CODEX_HOME = codexHome;
    process.env.CSTAR_MCP_CALLER_THREAD_ID = authorization.threadId;
    process.env.CSTAR_MCP_CALLER_TRANSPORT = 'direct-stdio';
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCountingAdapter(root);
    const db = database.getDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = 'bead:test:durable-forge-handler';
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Durable Forge handler test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, CSTAR_TARGET, now, now);
    return { root, authorization, beadId };
}

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv('CODEX_HOME', originalCodexHome);
    restoreEnv('CSTAR_MCP_CALLER_THREAD_ID', originalCallerThread);
    restoreEnv('CSTAR_MCP_CALLER_TRANSPORT', originalCallerTransport);
    restoreEnv('CSTAR_FORGE_TEST_MODE', originalForgeTestMode);
    restoreEnv('CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT', originalAdapter);
    restoreEnv('CSTAR_FORGE_TEST_SENTINEL', originalSentinel);
    while (temporaryRoots.length > 0) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('CStar durable Forge public path', () => {
    it('records verified evidence from Codex request metadata when the shared MCP child has no thread env', async () => {
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
                validator_identity: 'caller-label-is-not-authority',
                independent_of_execution: true,
                artifacts: [{ path: artifactPath, sha256: sha256(fs.readFileSync(artifactPath, 'utf-8')) }],
                checks: [{
                    name: 'request metadata binding check',
                    status: 'pass',
                    evidence_path: checkPath,
                    sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
                }],
            },
        }, {
            requestId: 9,
            _meta: {
                threadId: fixture.authorization.threadId,
                'x-codex-turn-metadata': {
                    session_id: fixture.authorization.threadId,
                    thread_id: fixture.authorization.threadId,
                    turn_id: fixture.authorization.turnId,
                    thread_source: 'user',
                    parent_thread_id: null,
                    forked_from_thread_id: null,
                    subagent_kind: null,
                },
            },
        });

        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'recorded_verified');
        assert.equal(parsed.authoritative, true);
        assert.equal(parsed.validator_identity_source, 'codex_request_meta');
        assert.equal(
            parsed.validator_identity,
            `codex-thread:${fixture.authorization.threadId}:turn:${fixture.authorization.turnId}`,
        );
        assert.equal(parsed.validation_request_thread_id, fixture.authorization.threadId);
        assert.equal(parsed.validation_request_turn_id, fixture.authorization.turnId);
        assert.equal(parsed.validation_request_record_count, 3);
        assert.match(parsed.validation_request_record_set_sha256, /^[a-f0-9]{64}$/);
        assert.match(parsed.validation_request_first_timestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.match(parsed.validation_request_timestamp, /^\d{4}-\d{2}-\d{2}T/);
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
                validator_identity: 'not-authoritative',
                independent_of_execution: true,
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
        assert.equal(parsed.status, 'partial');
        assert.equal(parsed.validation_persisted, false);
        assert.equal(parsed.authoritative, false);
        assert.equal(parsed.validation_warning, 'validation_evidence_requires_bound_direct_stdio_request');
        const db = database.getDb(fixture.root);
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
                validator_identity: 'ignored-caller-label',
                independent_of_execution: true,
                artifacts: [{ path: artifactPath, sha256: sha256(fs.readFileSync(artifactPath, 'utf-8')) }],
                checks: [{
                    name: 'independent check',
                    status: 'pass',
                    evidence_path: checkPath,
                    sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
                }],
            },
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'partial');
        assert.equal(parsed.validation_persisted, false);
        assert.equal(parsed.validation_authority, 'not_persisted');
        assert.equal(parsed.authoritative, false);
        assert.equal(parsed.stored_verdict, null);
        assert.equal(parsed.mutation, undefined);
        assert.equal(parsed.forge_validation_warning, 'forge_execution_receipt_not_found');

        const db = database.getDb(fixture.root);
        const persisted = db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get('val-rollback-on-forge-finalization-failure');
        assert.equal(persisted, undefined);
    });

    it('classifies unsafe trace preflight as failed-final before adapter start', async () => {
        const fixture = createFixture();
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
            prohibited_actions: ['merge', 'push', 'deploy', 'live source collection'],
            requested_actions: ['produce bounded response packet'],
            spend_policy: {
                mode: 'live_authorized' as const,
                max_retries: 0,
                live_source_allowed: false,
                operator_authorization_ref: fixture.authorization.reference,
            },
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: {
                expected_packet: 'DURABLE_FORGE_TEST_PACKET',
                callback_required: true,
            },
            package_locks: [],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };
        const requestResult = await handleForgeRequest(base);
        assert.equal(requestResult.isError, undefined, requestResult.content[0].text);
        const request = JSON.parse(requestResult.content[0].text);

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
            operator_authorization_ref: fixture.authorization.reference,
            idempotency_key: 'trace-preflight-must-not-spawn',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'failed_final');
        assert.equal(parsed.attempt_status, 'FAILED_FINAL');
        assert.equal(parsed.forge_execution.attempted, false);
        assert.equal(parsed.forge_execution.adapter_invoked, false);
        assert.equal(parsed.forge_execution.live_spend, false);
        assert.match(parsed.error, /forge_artifact_directory_unsafe_type/);
        assert.deepEqual(fs.readdirSync(outsideArtifacts), []);
    });

    it('records one authorized request, invokes once, and replays without spend', async () => {
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
            prohibited_actions: ['merge', 'push', 'deploy', 'live source collection'],
            requested_actions: ['produce bounded response packet'],
            spend_policy: {
                mode: 'live_authorized' as const,
                max_retries: 0,
                live_source_allowed: false,
                operator_authorization_ref: fixture.authorization.reference,
            },
            live_source_policy: 'no live source collection',
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: {
                expected_packet: 'DURABLE_FORGE_TEST_PACKET',
                callback_required: true,
                callback_thread_id: fixture.authorization.threadId,
            },
            package_locks: [],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };

        const requestResult = await handleForgeRequest(base);
        assert.equal(requestResult.isError, undefined, requestResult.content[0].text);
        const request = JSON.parse(requestResult.content[0].text);
        assert.equal(request.status, 'authorized_request_recorded');
        assert.match(request.receipt_id, /^dispatch-forge-/);
        const persisted = database.getDb(fixture.root).prepare(`
            SELECT operator_record_sha256, operator_record_set_sha256, operator_record_count
            FROM hall_forge_requests WHERE request_id = ?
        `).get(request.receipt_id) as Record<string, unknown>;
        assert.match(String(persisted.operator_record_sha256), /^[a-f0-9]{64}$/);
        assert.match(String(persisted.operator_record_set_sha256), /^[a-f0-9]{64}$/);
        assert.equal(persisted.operator_record_count, 3);

        const executeArgs = {
            ...base,
            forge_request_receipt_id: request.receipt_id,
            forge_request_decision_id: decisionId,
            forge_request_bead_id: fixture.beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: fixture.authorization.reference,
            idempotency_key: 'durable-handler-one-shot',
        };
        const originalSession = fs.readFileSync(fixture.authorization.sessionFile, 'utf-8');
        fs.writeFileSync(
            fixture.authorization.sessionFile,
            originalSession.replace('first steering update', 'first steering UPDATE'),
            { mode: 0o600 },
        );
        const driftResult = await handleForgeExecute({ ...executeArgs, idempotency_key: 'record-set-drift' });
        assert.equal(driftResult.isError, true);
        assert.match(JSON.parse(driftResult.content[0].text).error, /forge_operator_authorization_attestation_drift/);
        fs.writeFileSync(fixture.authorization.sessionFile, originalSession, { mode: 0o600 });
        fs.appendFileSync(fixture.authorization.sessionFile, `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'same-turn-noise', output: 'ignored', internal_chat_message_metadata_passthrough: { turn_id: fixture.authorization.turnId } } })}\n`);
        const firstResult = await handleForgeExecute(executeArgs);
        assert.equal(firstResult.isError, undefined, firstResult.content[0].text);
        const first = JSON.parse(firstResult.content[0].text);
        assert.equal(first.status, 'delivered_unverified');
        assert.equal(first.attempt_status, 'STARTED');
        assert.equal(first.request_status, 'AUTHORIZED');
        assert.equal(first.forge_execution.adapter_result.envelope.requested_model, 'MiniMax-M3');
        assert.equal(first.forge_execution.adapter_result.envelope.actual_model, null);
        assert.equal(first.forge_execution.adapter_result.envelope.model_source, 'unreported');
        const invocationCountPath = `${first.forge_execution.adapter_result.envelope.response_artifact.path}.count`;
        assert.equal(fs.readFileSync(invocationCountPath, 'utf-8'), '1');

        const pendingReplayResult = await handleForgeExecute(executeArgs);
        assert.equal(pendingReplayResult.isError, undefined, pendingReplayResult.content[0].text);
        const pendingReplay = JSON.parse(pendingReplayResult.content[0].text);
        assert.equal(pendingReplay.status, 'delivered_pending_validation_replay');
        assert.equal(pendingReplay.replayed, true);
        assert.equal(pendingReplay.forge_execution.fail_closed_reason, 'independent_validation_required');
        assert.equal(fs.readFileSync(invocationCountPath, 'utf-8'), '1');

        const validationTranscript = path.join(fixture.root, 'validation-transcript.txt');
        fs.writeFileSync(validationTranscript, 'independent fixture inspection: pass\n');
        const responseArtifact = first.forge_execution.adapter_result.envelope.response_artifact;
        const validationResult = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'SUCCESS',
            notes: 'Independent fixture inspection confirmed the exact callback and one invocation.',
            validation_id: 'val-durable-handler-one-shot',
            forge_execution_receipt_id: first.execution_receipt_id,
            validation_evidence: {
                validator_identity: 'test:independent-forge-validator',
                independent_of_execution: true,
                artifacts: [{ path: responseArtifact.path, sha256: responseArtifact.sha256 }],
                checks: [{
                    name: 'independent fixture inspection',
                    status: 'pass',
                    evidence_path: validationTranscript,
                    sha256: sha256(fs.readFileSync(validationTranscript, 'utf-8')),
                }],
            },
        });
        assert.equal(validationResult.isError, undefined, validationResult.content[0].text);
        const validation = JSON.parse(validationResult.content[0].text);
        assert.equal(validation.forge_validation.accepted, true);
        assert.equal(validation.forge_validation.attempt_status, 'SUCCEEDED');
        assert.equal(validation.forge_validation.request_status, 'SUCCEEDED');

        const replayResult = await handleForgeExecute(executeArgs);
        assert.equal(replayResult.isError, undefined, replayResult.content[0].text);
        const replay = JSON.parse(replayResult.content[0].text);
        assert.equal(replay.status, 'succeeded_replay');
        assert.equal(replay.replayed, true);
        assert.equal(replay.execution_receipt_id, first.execution_receipt_id);
        assert.equal(fs.readFileSync(invocationCountPath, 'utf-8'), '1');
    });
});
