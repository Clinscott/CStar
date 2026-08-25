import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import {
    issueIndependentValidatorTicket,
    consumeIndependentValidatorTicket,
} from '../../../src/tools/pennyone/intel/validation_ticket_controller.js';
import { recordForgeDelivery } from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    finalizeForgeAttempt,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import { createHostReceipt } from './validation_ticket_test_helpers.js';

const originalRoot = registry.getRoot();
const originalTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
const originalValidationThread = process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
const originalValidationTurn = process.env.CSTAR_VALIDATION_TEST_TURN_ID;
const temporaryRoots: string[] = [];
const VALIDATOR_THREAD = '019f0000-0000-7000-8000-000000000301';
const VALIDATOR_TURN = '019f0000-0000-7000-8000-000000000302';
const HOST_VALIDATOR_THREAD = '019f0000-0000-7000-8000-000000000401';
const HOST_VALIDATOR_TURN = '019f0000-0000-7000-8000-000000000402';

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

interface FixtureOptions {
    repositoryRoot?: string;
    requiredOutputPaths?: string[];
}

function fixture(options: FixtureOptions = {}) {
    const controlRoot = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-ticket-control-'));
    const repositoryRoot = options.repositoryRoot ?? controlRoot;
    temporaryRoots.push(controlRoot);
    if (repositoryRoot !== controlRoot) temporaryRoots.push(repositoryRoot);
    fs.mkdirSync(repositoryRoot, { recursive: true });
    registry.setRoot(controlRoot);
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    process.env.CSTAR_VALIDATION_TEST_THREAD_ID = VALIDATOR_THREAD;
    process.env.CSTAR_VALIDATION_TEST_TURN_ID = VALIDATOR_TURN;

    const validationSession = createSession({ textParts: ['Synthetic independent Forge validator.'] });
    const db = database.getWritableDb(controlRoot);
    const repoId = buildHallRepositoryId(normalizeHallPath(repositoryRoot));
    const now = Date.now();
    db.prepare(`
        INSERT OR IGNORE INTO hall_repositories (
            repo_id, root_path, name, status, active_persona,
            baseline_gungnir_score, intent_integrity, created_at, updated_at
        ) VALUES (?, ?, 'Synthetic repository', 'DORMANT', '', 0, 0, ?, ?)
    `).run(repoId, normalizeHallPath(repositoryRoot), now, now);

    const suffix = randomUUID().replaceAll('-', '');
    const beadId = `bead:test:validation-ticket-${suffix}`;
    const targetPath = path.join(repositoryRoot, 'target.ts');
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'FILE', ?, 'Synthetic validation-ticket fixture', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, targetPath, now, now);

    const request: SaveForgeRequestInput = {
        request_id: `dispatch-forge-${suffix}`,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: `decision-${suffix}`,
        request_sha256: 'd'.repeat(64),
        request_summary_json: JSON.stringify({
            schema: 'cstar.forge_request.v3',
            required_output_paths: options.requiredOutputPaths ?? [],
        }),
        adapter_ref: null,
        write_capability: 'project_files',
        target_paths_sha256: 'e'.repeat(64),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: '019f0000-0000-7000-8000-000000000311',
        requester_turn_id: '019f0000-0000-7000-8000-000000000312',
        requester_record_set_sha256: 'c'.repeat(64),
        authorization_profile: 'exact_request_challenge_v1',
        authorization_challenge_sha256: 'f'.repeat(64),
        now,
    };
    saveForgeRequest(db, request);
    const authorization = authorizeForgeRequest(db, {
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        authorization_profile: 'exact_request_challenge_v1',
        challenge_sha256: request.authorization_challenge_sha256!,
        operator_authorization_ref: `test:${suffix}`,
        operator_thread_id: '019f0000-0000-7000-8000-000000000321',
        operator_turn_id: '019f0000-0000-7000-8000-000000000322',
        operator_message_sha256: 'a'.repeat(64),
        operator_record_sha256: 'b'.repeat(64),
        operator_record_set_sha256: 'c'.repeat(64),
        operator_record_count: 1,
        authorized_at: now,
        expires_at: now + 60_000,
        now,
    }).authorization;
    const reserved = reserveForgeAttempt(db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `ticket-${suffix}`,
        execution_receipt_id: `forge-execute-${suffix}`,
        adapter_ref: request.adapter_ref ?? '',
    }).attempt;
    markForgeAttemptStarted(db, reserved.attempt_id, now);

    const evidenceContent = `synthetic evidence ${suffix}\n`;
    const evidencePath = path.join(repositoryRoot, 'evidence', 'validation.txt');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, evidenceContent, { mode: 0o600 });
    const evidenceSha = sha256(evidenceContent);
    recordForgeDelivery(db, {
        attempt_id: reserved.attempt_id,
        result_status: 'synthetic-delivery',
        result_artifact_sha256: evidenceSha,
        external_execution_id: `external-${suffix}`,
        now,
    });
    return {
        controlRoot,
        repositoryRoot,
        repoId,
        beadId,
        db,
        request,
        attempt: reserved,
        evidencePath,
        evidenceSha,
        now,
        requestContext: validRequestContext(validationSession.threadId, validationSession.turnId),
        recorderThreadId: validationSession.threadId,
        recorderTurnId: validationSession.turnId,
        recorderSessionFile: validationSession.sessionFile,
        evidence: {
            artifacts: [{ path: 'evidence/validation.txt', sha256: evidenceSha }],
            checks: [{
                name: 'synthetic validation',
                status: 'pass' as const,
                evidence_path: 'evidence/validation.txt',
                sha256: evidenceSha,
            }],
        },
    };
}

function ticket(fixtureValue: ReturnType<typeof fixture>, expiresAt?: number) {
    return issueIndependentValidatorTicket(fixtureValue.db, {
        repository_id: fixtureValue.repoId,
        bead_id: fixtureValue.beadId,
        execution_receipt_id: fixtureValue.attempt.execution_receipt_id,
        attempt_id: fixtureValue.attempt.attempt_id,
        scope_sha256: 'e'.repeat(64),
        validator_thread_id: VALIDATOR_THREAD,
        validator_turn_id: VALIDATOR_TURN,
        expires_at: expiresAt,
        now: fixtureValue.now,
    });
}

function parsed(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0].text) as Record<string, any>;
}

function validConsumption(fixtureValue: ReturnType<typeof fixture>, token: string, validationId = 'val-direct') {
    return consumeIndependentValidatorTicket(fixtureValue.db, {
        ticket: token,
        repository_id: fixtureValue.repoId,
        bead_id: fixtureValue.beadId,
        execution_receipt_id: fixtureValue.attempt.execution_receipt_id,
        attempt_id: fixtureValue.attempt.attempt_id,
        scope_sha256: 'e'.repeat(64),
        validator_thread_id: VALIDATOR_THREAD,
        validator_turn_id: VALIDATOR_TURN,
        validation_id: validationId,
        now: fixtureValue.now + 1,
    });
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    if (originalTestMode === undefined) delete process.env.CSTAR_FORGE_TEST_MODE;
    else process.env.CSTAR_FORGE_TEST_MODE = originalTestMode;
    if (originalNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = originalNodeTestContext;
    if (originalValidationThread === undefined) delete process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
    else process.env.CSTAR_VALIDATION_TEST_THREAD_ID = originalValidationThread;
    if (originalValidationTurn === undefined) delete process.env.CSTAR_VALIDATION_TEST_TURN_ID;
    else process.env.CSTAR_VALIDATION_TEST_TURN_ID = originalValidationTurn;
    cleanupOperatorAuthorizationFixtures();
    while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('one-use Forge validation tickets', () => {
    it('issues through the kernel, consumes once, and finalizes positive Forge validation', async () => {
        const value = fixture();
        const issued = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'INCONCLUSIVE',
            validation_id: 'ticket-issue',
            validation_ticket_request: {
                execution_receipt_id: value.attempt.execution_receipt_id,
                attempt_id: value.attempt.attempt_id,
                scope_sha256: 'e'.repeat(64),
            },
        }, value.requestContext));
        assert.equal(issued.status, 'validation_ticket_issued', JSON.stringify(issued));
        assert.match(issued.validation_ticket, /^cstar-validation-ticket\.v1\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/);

        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'val-ticket-success',
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            validation_ticket: issued.validation_ticket,
            validation_evidence: value.evidence,
        }, value.requestContext));
        assert.equal(result.status, 'recorded_verified', JSON.stringify(result));
        assert.equal(result.forge_validation.accepted, true);
        assert.equal(result.forge_validation.attempt_status, 'SUCCEEDED');
        const storedTicket = value.db.prepare(`
            SELECT repo_id, bead_id, execution_receipt_id, attempt_id, scope_sha256,
                   validator_thread_id, validator_turn_id, nonce_sha256,
                   consumed_at, consumed_validation_id
            FROM hall_forge_validation_tickets
        `).get() as Record<string, unknown>;
        assert.equal(storedTicket.repo_id, value.repoId);
        assert.equal(storedTicket.bead_id, value.beadId);
        assert.equal(storedTicket.execution_receipt_id, value.attempt.execution_receipt_id);
        assert.equal(storedTicket.attempt_id, value.attempt.attempt_id);
        assert.equal(storedTicket.scope_sha256, 'e'.repeat(64));
        assert.equal(storedTicket.validator_thread_id, VALIDATOR_THREAD);
        assert.equal(storedTicket.validator_turn_id, VALIDATOR_TURN);
        assert.match(String(storedTicket.nonce_sha256), /^[a-f0-9]{64}$/);
        assert.equal(storedTicket.consumed_validation_id, 'val-ticket-success');
        assert.equal(typeof storedTicket.consumed_at, 'number');

        const replay = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'val-ticket-replay',
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            validation_ticket: issued.validation_ticket,
            validation_evidence: value.evidence,
        }, value.requestContext));
        assert.equal(replay.validation_persisted, false);
        assert.equal(replay.forge_validation_warning, 'validation_ticket_replayed');
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get('val-ticket-replay'), undefined);
    });

    it('accepts host-v3 evidence through its exact consumed Forge ticket', async () => {
        const value = fixture();
        const validationId = 'val-ticket-host-v3';
        const receipt = createHostReceipt(value, validationId, HOST_VALIDATOR_THREAD, HOST_VALIDATOR_TURN);
        const issued = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'INCONCLUSIVE',
            validation_id: 'ticket-host-v3-issue',
            validation_ticket_request: {
                execution_receipt_id: value.attempt.execution_receipt_id,
                attempt_id: value.attempt.attempt_id,
                scope_sha256: 'e'.repeat(64),
                validator_thread_id: HOST_VALIDATOR_THREAD,
                validator_turn_id: HOST_VALIDATOR_TURN,
            },
        }, value.requestContext));
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: validationId,
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            host_validation_receipt: receipt,
            validation_ticket: issued.validation_ticket,
        }, value.requestContext));
        assert.equal(result.status, 'recorded_verified', JSON.stringify(result));
        assert.equal(result.validation_authority, 'verified_v3');
        assert.equal(result.forge_validation.accepted, true);
        assert.equal(result.forge_validation.attempt_status, 'SUCCEEDED');
        assert.equal(value.db.prepare(
            'SELECT status FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(value.attempt.attempt_id)?.status, 'SUCCEEDED');
        assert.equal(value.db.prepare(
            'SELECT consumed_validation_id FROM hall_forge_validation_tickets',
        ).get()?.consumed_validation_id, validationId);
        assert.equal(value.db.prepare(
            'SELECT authority_class FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId)?.authority_class, 'verified_v3');
    });

    it('persists host-v3 evidence as additive audit evidence without Forge linkage', async () => {
        const value = fixture();
        const validationId = 'val-host-v3-audit-only';
        const receipt = createHostReceipt(value, validationId, HOST_VALIDATOR_THREAD, HOST_VALIDATOR_TURN);
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: validationId,
            host_validation_receipt: receipt,
        }, value.requestContext));
        assert.equal(result.status, 'recorded_verified');
        assert.equal(result.validation_authority, 'verified_v3');
        assert.equal(result.forge_validation, undefined);
        assert.equal(value.db.prepare(
            'SELECT authority_class FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId)?.authority_class, 'verified_v3');
    });

    it('rejects a public ticket request that names the root recorder as validator', async () => {
        const value = fixture();
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'INCONCLUSIVE',
            validation_ticket_request: {
                execution_receipt_id: value.attempt.execution_receipt_id,
                attempt_id: value.attempt.attempt_id,
                scope_sha256: 'e'.repeat(64),
                validator_thread_id: value.recorderThreadId,
                validator_turn_id: value.recorderTurnId,
            },
        }, value.requestContext));
        assert.equal(result.status, 'partial');
        assert.equal(result.validation_warning, 'validation_ticket_validator_not_independent');
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_validation_tickets',
        ).get()?.count, 0);
    });

    it('rejects a host-v3 ticket bound to the recorder instead of the independent validator', async () => {
        const value = fixture();
        const validationId = 'val-ticket-host-v3-wrong-recorder';
        const receipt = createHostReceipt(value, validationId, HOST_VALIDATOR_THREAD, HOST_VALIDATOR_TURN);
        const issued = issueIndependentValidatorTicket(value.db, {
            repository_id: value.repoId,
            bead_id: value.beadId,
            execution_receipt_id: value.attempt.execution_receipt_id,
            attempt_id: value.attempt.attempt_id,
            scope_sha256: 'e'.repeat(64),
            validator_thread_id: value.recorderThreadId,
            validator_turn_id: value.recorderTurnId,
            now: value.now,
            expires_at: value.now + 60_000,
        });
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: validationId,
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            host_validation_receipt: receipt,
            validation_ticket: issued.ticket,
        }, value.requestContext));
        assert.equal(result.validation_persisted, false);
        assert.equal(result.forge_validation_warning, 'validation_ticket_validator_mismatch');
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId), undefined);
        assert.equal(value.db.prepare(
            'SELECT consumed_at FROM hall_forge_validation_tickets',
        ).get()?.consumed_at, null);
    });

    it('rejects scope, identity, malformed, expired, and replayed use without partial consumption', () => {
        const value = fixture();
        const issued = ticket(value, value.now + 10);
        const base = {
            ticket: issued.ticket,
            repository_id: value.repoId,
            bead_id: value.beadId,
            execution_receipt_id: value.attempt.execution_receipt_id,
            attempt_id: value.attempt.attempt_id,
            scope_sha256: 'e'.repeat(64),
            validator_thread_id: VALIDATOR_THREAD,
            validator_turn_id: VALIDATOR_TURN,
            validation_id: 'val-direct',
            now: value.now + 1,
        };
        assert.throws(() => consumeIndependentValidatorTicket(value.db, {
            ...base, scope_sha256: 'f'.repeat(64),
        }), /validation_ticket_scope_mismatch/);
        assert.throws(() => consumeIndependentValidatorTicket(value.db, {
            ...base, validator_thread_id: '019f0000-0000-7000-8000-000000000399',
        }), /validation_ticket_validator_mismatch/);
        assert.throws(() => consumeIndependentValidatorTicket(value.db, {
            ...base, ticket: 'not-a-ticket',
        }), /validation_ticket_malformed/);
        assert.throws(() => consumeIndependentValidatorTicket(value.db, {
            ...base, now: value.now + 10,
        }), /validation_ticket_expired/);
        assert.equal(value.db.prepare(
            'SELECT consumed_at FROM hall_forge_validation_tickets WHERE ticket_id = ?',
        ).get(issued.ticket_id)?.consumed_at, null);

        validConsumption(value, issued.ticket, 'val-direct-valid');
        assert.throws(() => consumeIndependentValidatorTicket(value.db, {
            ...base, validation_id: 'val-direct-replay', now: value.now + 2,
        }), /validation_ticket_replayed/);
    });

    it('rolls back ticket consumption and validation persistence when Forge finalization fails', async () => {
        const value = fixture({ requiredOutputPaths: ['evidence/missing.txt'] });
        const issued = ticket(value, value.now + 60_000);
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'val-ticket-rollback',
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            validation_ticket: issued.ticket,
            validation_evidence: value.evidence,
        }, value.requestContext));
        assert.equal(result.validation_persisted, false);
        assert.match(result.forge_validation_warning, /^forge_validation_required_output_unverified:/);
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get('val-ticket-rollback'), undefined);
        assert.equal(value.db.prepare(
            'SELECT consumed_at FROM hall_forge_validation_tickets WHERE ticket_id = ?',
        ).get(issued.ticket_id)?.consumed_at, null);
        const attempt = value.db.prepare(
            'SELECT status, result_status, validation_id FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(value.attempt.attempt_id) as Record<string, unknown>;
        assert.equal(attempt.status, 'STARTED');
        assert.match(String(attempt.result_status), /^DELIVERED_PENDING_VALIDATION:/);
        assert.equal(attempt.validation_id, null);
    });

    it('reads Forge evidence from the bead repository root while recording lifecycle state in CStar', async () => {
        const spokeRoot = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-ticket-spoke-'));
        const value = fixture({ repositoryRoot: spokeRoot });
        const issued = ticket(value, value.now + 60_000);
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'val-ticket-spoke',
            forge_execution_receipt_id: value.attempt.execution_receipt_id,
            validation_ticket: issued.ticket,
            validation_evidence: value.evidence,
        }, value.requestContext));
        assert.equal(result.status, 'recorded_verified');
        assert.equal(result.forge_validation.attempt_status, 'SUCCEEDED');
        const persisted = value.db.prepare(`
            SELECT repo_id, evidence_manifest_json
            FROM hall_validation_runs WHERE validation_id = ?
        `).get('val-ticket-spoke') as { repo_id: string; evidence_manifest_json: string };
        assert.equal(persisted.repo_id, value.repoId);
        const manifest = JSON.parse(persisted.evidence_manifest_json) as {
            artifacts: Array<{ path: string }>;
        };
        assert.ok(manifest.artifacts.every((entry) => entry.path.startsWith(spokeRoot)));
        assert.equal(fs.existsSync(path.join(value.controlRoot, 'evidence', 'validation.txt')), false);
    });
});
