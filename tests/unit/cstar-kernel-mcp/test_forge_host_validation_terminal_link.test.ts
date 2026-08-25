import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { CODE_ROOT } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    finalizeForgeAttempt,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    saveAndAuthorizeForgeRequest,
    forgeRequestInput,
    insertForgeReceiptBead,
} from './forge_receipt_test_support.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';

const originalRoot = registry.getRoot();
const originalCodexHome = process.env.CODEX_HOME;
const originalTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT;
const originalForgeTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
const originalValidationThread = process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
const proofRoots: string[] = [];

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function writeValidatorReceipt(
    codexHome: string,
    recorderThreadId: string,
    validatorThreadId: string,
    validatorTurnId: string,
    manifestSha256: string,
    validationId: string,
): void {
    const timestamp = Date.now();
    const finalText = `Independent validation complete. ${manifestSha256} ${validationId}`;
    const sessionDir = path.join(codexHome, 'sessions', '2026', '07', '31');
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    const sessionMeta = {
        timestamp: new Date(timestamp - 2_000).toISOString(),
        type: 'session_meta',
        payload: {
            id: validatorThreadId,
            session_id: recorderThreadId,
            thread_source: 'subagent',
            parent_thread_id: recorderThreadId,
            forked_from_id: recorderThreadId,
            agent_path: '/root/validator',
            agent_role: 'validator',
            source: {
                subagent: {
                    thread_spawn: {
                        parent_thread_id: recorderThreadId,
                        depth: 1,
                        agent_path: '/root/validator',
                        agent_role: 'validator',
                    },
                },
            },
        },
    };
    const final = {
        timestamp: new Date(timestamp - 1_000).toISOString(),
        type: 'response_item',
        payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: finalText }],
            internal_chat_message_metadata_passthrough: { turn_id: validatorTurnId },
        },
    };
    const complete = {
        timestamp: new Date(timestamp - 500).toISOString(),
        type: 'event_msg',
        payload: {
            type: 'task_complete',
            turn_id: validatorTurnId,
            last_agent_message: finalText,
            completed_at: (timestamp - 600) / 1_000,
        },
    };
    fs.writeFileSync(
        path.join(sessionDir, `rollout-host-link-${validatorThreadId}.jsonl`),
        `${[sessionMeta, final, complete].map((row) => JSON.stringify(row)).join('\n')}\n`,
        { mode: 0o600 },
    );
}

function createFixture(mode: 'terminal' | 'delivery' = 'terminal') {
    const root = fs.mkdtempSync(path.join('/tmp', 'cstar-host-link-hall-'));
    const proofRoot = path.join(CODE_ROOT, `.cstar-host-link-${randomUUID()}`);
    proofRoots.push(proofRoot);
    fs.mkdirSync(proofRoot, { recursive: true, mode: 0o700 });
    registry.setRoot(root);
    const recorder = createSession({ textParts: ['Record the bounded host validation result.'] });
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = `bead:test:host-terminal-${randomUUID()}`;
    insertForgeReceiptBead(db, repoId, beadId);
    const request = forgeRequestInput(repoId, beadId, { now: Date.now() });
    const authorization = saveAndAuthorizeForgeRequest(db, request).authorization;
    const executionReceiptId = `forge-execute-${randomUUID()}`;
    const attempt = reserveForgeAttempt(db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `host-link-${randomUUID()}`,
        execution_receipt_id: executionReceiptId,
        adapter_ref: request.adapter_ref!,
    }).attempt;
    markForgeAttemptStarted(db, attempt.attempt_id);
    const deliveryContent = 'bounded Forge-v2 delivery artifact\n';
    const deliveryArtifactPath = path.join(root, 'delivery-artifact.txt');
    const deliveryArtifactSha256 = sha256(deliveryContent);
    if (mode === 'terminal') {
        finalizeForgeAttempt(db, {
            attempt_id: attempt.attempt_id,
            status: 'UNKNOWN',
            error_code: 'synthetic_ambiguous_provider_failure',
        });
    } else {
        fs.writeFileSync(deliveryArtifactPath, deliveryContent, { mode: 0o600 });
        recordForgeDelivery(db, {
            attempt_id: attempt.attempt_id,
            result_status: 'synthetic-delivered',
            result_artifact_sha256: deliveryArtifactSha256,
        });
    }

    const validationId = `validation:host-terminal-${randomUUID()}`;
    const artifactPath = path.join(proofRoot, 'artifact.txt');
    const checkPath = path.join(proofRoot, 'check.txt');
    fs.writeFileSync(artifactPath, 'bounded artifact\n', { mode: 0o600 });
    fs.writeFileSync(checkPath, 'PASS\n', { mode: 0o600 });
    const relativeArtifact = path.relative(CODE_ROOT, artifactPath);
    const relativeCheck = path.relative(CODE_ROOT, checkPath);
    const artifactSha256 = sha256('bounded artifact\n');
    const checkSha256 = sha256('PASS\n');
    const manifest = {
        schema: 'cstar.independent_validation_input.v1',
        bead_id: beadId,
        validation_id: validationId,
        reported_verdict: 'FAILURE',
        artifacts: [{ path: relativeArtifact, sha256: artifactSha256, bytes: 17 }],
        checks: [{
            name: 'terminal UNKNOWN classification',
            status: 'pass',
            evidence_path: relativeCheck,
            sha256: checkSha256,
        }],
    };
    const manifestPath = path.join(proofRoot, 'manifest.json');
    const manifestContent = `${JSON.stringify(manifest)}\n`;
    fs.writeFileSync(manifestPath, manifestContent, { mode: 0o600 });
    const manifestSha256 = sha256(manifestContent);
    const validatorThreadId = randomUUID();
    const validatorTurnId = randomUUID();
    writeValidatorReceipt(
        recorder.codexHome,
        recorder.threadId,
        validatorThreadId,
        validatorTurnId,
        manifestSha256,
        validationId,
    );
    process.env.CSTAR_MCP_CALLER_TRANSPORT = 'direct-stdio';
    process.env.CSTAR_FORGE_TEST_MODE = '0';
    return {
        root,
        db,
        beadId,
        attempt,
        recorder,
        validationId,
        manifestPath: path.relative(CODE_ROOT, manifestPath),
        artifactPath: relativeArtifact,
        checkPath: relativeCheck,
        manifestSha256,
        artifactSha256,
        checkSha256,
        validatorThreadId,
        validatorTurnId,
        deliveryArtifactPath,
        deliveryArtifactSha256,
    };
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv('CODEX_HOME', originalCodexHome);
    restoreEnv('CSTAR_MCP_CALLER_TRANSPORT', originalTransport);
    restoreEnv('CSTAR_FORGE_TEST_MODE', originalForgeTestMode);
    restoreEnv('NODE_TEST_CONTEXT', originalNodeTestContext);
    restoreEnv('CSTAR_VALIDATION_TEST_THREAD_ID', originalValidationThread);
    cleanupOperatorAuthorizationFixtures();
    while (proofRoots.length > 0) fs.rmSync(proofRoots.pop()!, { recursive: true, force: true });
});

describe('host validation terminal Forge linkage', () => {
    it('rejects mixed host-v3 and Forge subjects before Hall access', async () => {
        const fixture = createFixture();
        registry.setRoot(path.join(fixture.root, 'unavailable-control-root'));
        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'FAILURE',
            notes: 'Independent host validation confirms no product was produced.',
            validation_id: fixture.validationId,
            forge_execution_receipt_id: fixture.attempt.execution_receipt_id,
            host_validation_receipt: {
                validator_thread_id: fixture.validatorThreadId,
                validator_turn_id: fixture.validatorTurnId,
                manifest_path: fixture.manifestPath,
                manifest_sha256: fixture.manifestSha256,
            },
            validation_evidence: {
                artifacts: [{ path: fixture.artifactPath, sha256: fixture.artifactSha256 }],
                checks: [{
                    name: 'terminal UNKNOWN classification',
                    status: 'pass',
                    evidence_path: fixture.checkPath,
                    sha256: fixture.checkSha256,
                }],
            },
        }, validRequestContext(fixture.recorder.threadId, fixture.recorder.turnId));

        assert.equal(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.error, 'validation_subject_kind_ambiguous');
        assert.equal(fixture.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get(fixture.validationId), undefined);
        const linked = fixture.db.prepare(`
            SELECT status, validation_id, validation_authority, validation_verdict
            FROM hall_forge_attempts WHERE attempt_id = ?
        `).get(fixture.attempt.attempt_id) as Record<string, unknown>;
        assert.deepEqual(linked, {
            status: 'UNKNOWN',
            validation_id: null,
            validation_authority: null,
            validation_verdict: null,
        });
    });

    it('persists verified-v2 evidence and finalizes its delivered Forge attempt atomically', async () => {
        const fixture = createFixture('delivery');
        process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
        process.env.CSTAR_FORGE_TEST_MODE = '1';
        process.env.CSTAR_VALIDATION_TEST_THREAD_ID = 'test-independent-validator-thread';
        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'ACCEPTED',
            validation_id: fixture.validationId,
            forge_execution_receipt_id: fixture.attempt.execution_receipt_id,
            validation_evidence: {
                artifacts: [{
                    path: fixture.deliveryArtifactPath,
                    sha256: fixture.deliveryArtifactSha256,
                }],
                checks: [{
                    name: 'Forge-v2 atomic delivery validation',
                    status: 'pass',
                    evidence_path: fixture.deliveryArtifactPath,
                    sha256: fixture.deliveryArtifactSha256,
                }],
            },
        }, validRequestContext(fixture.recorder.threadId, fixture.recorder.turnId));

        assert.equal(result.isError, undefined, result.content[0].text);
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'recorded_verified');
        assert.equal(parsed.validation_persisted, true);
        assert.equal(parsed.validation_authority, 'verified_v2');
        assert.equal(parsed.forge_validation.mode, 'delivery_finalization');
        assert.equal(parsed.forge_validation.execution_status_changed, true);
        assert.deepEqual(fixture.db.prepare(`
            SELECT status, validation_id, validation_authority
            FROM hall_forge_attempts WHERE attempt_id = ?
        `).get(fixture.attempt.attempt_id), {
            status: 'SUCCEEDED',
            validation_id: fixture.validationId,
            validation_authority: 'verified_v2',
        });
        assert.deepEqual(fixture.db.prepare(`
            SELECT verdict, authority_class FROM hall_validation_runs WHERE validation_id = ?
        `).get(fixture.validationId), { verdict: 'ACCEPTED', authority_class: 'verified_v2' });
    });
});
