import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    finalizeForgeAttempt,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const originalTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
const originalValidationThread = process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
const temporaryRoots: string[] = [];

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function createFixture() {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-terminal-link-'));
    temporaryRoots.push(root);
    registry.setRoot(root);
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    const validationSession = createSession({
        textParts: ['Synthetic root-user request for terminal Forge validation linkage.'],
    });
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = 'bead:test:terminal-public-link';
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'VALIDATION', ?, 'Terminal link public test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, path.join(root, 'target.txt'), now, now);

    const suffix = randomUUID().replaceAll('-', '');
    const requesterThreadId = randomUUID();
    const executorThreadId = randomUUID();
    const request: SaveForgeRequestInput = {
        request_id: `dispatch-forge-${suffix}`,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: `decision-${suffix}`,
        request_sha256: 'd'.repeat(64),
        request_summary_json: JSON.stringify({
            schema: 'cstar.forge_request.v3',
            required_output_paths: [],
        }),
        adapter_ref: null,
        write_capability: 'project_files',
        target_paths_sha256: 'e'.repeat(64),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: requesterThreadId,
        requester_turn_id: randomUUID(),
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
        operator_thread_id: executorThreadId,
        operator_turn_id: randomUUID(),
        operator_message_sha256: 'a'.repeat(64),
        operator_record_sha256: 'b'.repeat(64),
        operator_record_set_sha256: 'c'.repeat(64),
        operator_record_count: 1,
        authorized_at: now,
        expires_at: now + 60_000,
        now,
    }).authorization;
    const attempt = reserveForgeAttempt(db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: 'terminal-link',
        execution_receipt_id: `forge-execute-${suffix}`,
        adapter_ref: request.adapter_ref ?? '',
    }).attempt;
    markForgeAttemptStarted(db, attempt.attempt_id);
    finalizeForgeAttempt(db, {
        attempt_id: attempt.attempt_id,
        status: 'FAILED_FINAL',
        result_status: 'synthetic-provider-failure',
        error_code: 'synthetic_provider_failure',
    });
    return {
        root,
        db,
        beadId,
        attempt,
        requesterThreadId,
        executorThreadId,
        requestContext: validRequestContext(validationSession.threadId, validationSession.turnId),
    };
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
    cleanupOperatorAuthorizationFixtures();
    while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('public terminal Forge validation linkage', () => {
    it('rejects self-validation from the Forge requester or executor root task', async () => {
        const fixture = createFixture();
        const evidencePath = path.join(fixture.root, 'self-validation.txt');
        fs.writeFileSync(evidencePath, 'self validation must not pass\n');
        const evidenceSha = sha256(fs.readFileSync(evidencePath, 'utf-8'));

        for (const [role, threadId] of [
            ['requester', fixture.requesterThreadId],
            ['executor', fixture.executorThreadId],
        ] as const) {
            process.env.CSTAR_VALIDATION_TEST_THREAD_ID = threadId;
            const validationId = `val-terminal-self-${role}`;
            const result = await handleRecordResult({
                bead_id: fixture.beadId,
                verdict: 'REJECTED',
                validation_id: validationId,
                forge_execution_receipt_id: fixture.attempt.execution_receipt_id,
                validation_evidence: {
                    artifacts: [{ path: evidencePath, sha256: evidenceSha }],
                    checks: [{
                        name: 'self review',
                        status: 'pass',
                        evidence_path: evidencePath,
                        sha256: evidenceSha,
                    }],
                },
            }, fixture.requestContext);

            const parsed = JSON.parse(result.content[0].text);
            assert.equal(parsed.status, 'partial');
            assert.equal(parsed.validation_persisted, false);
            assert.equal(parsed.forge_validation_warning, 'validation_evidence_validator_not_independent');
            assert.equal(fixture.db.prepare(
                'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
            ).get(validationId), undefined);
        }
    });

    it('persists verified rejection while preserving failed execution state', async () => {
        const fixture = createFixture();
        const evidencePath = path.join(fixture.root, 'independent-validation.txt');
        fs.writeFileSync(evidencePath, 'independent synthetic rejection evidence\n');
        const evidenceSha = sha256(fs.readFileSync(evidencePath, 'utf-8'));
        const beforeAttempt = fixture.db.prepare(`
            SELECT status, result_status, error_code, completed_at
            FROM hall_forge_attempts WHERE attempt_id = ?
        `).get(fixture.attempt.attempt_id) as Record<string, unknown>;
        const beforeRequest = fixture.db.prepare(`
            SELECT status, active_attempt_id, completed_at
            FROM hall_forge_requests WHERE request_id = ?
        `).get(fixture.attempt.request_id) as Record<string, unknown>;

        const result = await handleRecordResult({
            bead_id: fixture.beadId,
            verdict: 'REJECTED',
            notes: 'Independent validation confirms the terminal failure.',
            validation_id: 'val-terminal-public-link',
            forge_execution_receipt_id: fixture.attempt.execution_receipt_id,
            validation_evidence: {
                artifacts: [{ path: evidencePath, sha256: evidenceSha }],
                checks: [{
                    name: 'terminal failure review',
                    status: 'pass',
                    evidence_path: evidencePath,
                    sha256: evidenceSha,
                }],
            },
        }, fixture.requestContext);

        assert.equal(result.isError, undefined, result.content[0].text);
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'recorded_verified');
        assert.equal(parsed.forge_validation.mode, 'terminal_evidence_link');
        assert.equal(parsed.forge_validation.execution_status_changed, false);
        assert.equal(parsed.forge_validation.accepted, false);
        const afterAttempt = fixture.db.prepare(`
            SELECT status, result_status, error_code, completed_at, validation_id
            FROM hall_forge_attempts WHERE attempt_id = ?
        `).get(fixture.attempt.attempt_id) as Record<string, unknown>;
        const afterRequest = fixture.db.prepare(`
            SELECT status, active_attempt_id, completed_at
            FROM hall_forge_requests WHERE request_id = ?
        `).get(fixture.attempt.request_id) as Record<string, unknown>;
        assert.deepEqual(
            { status: afterAttempt.status, result_status: afterAttempt.result_status,
                error_code: afterAttempt.error_code, completed_at: afterAttempt.completed_at },
            beforeAttempt,
        );
        assert.deepEqual(afterRequest, beforeRequest);
        assert.equal(afterAttempt.validation_id, 'val-terminal-public-link');
    });
});
