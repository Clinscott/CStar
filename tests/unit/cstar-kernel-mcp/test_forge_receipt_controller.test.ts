import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';

import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeAttemptByIdempotency,
    getForgeRequest,
    markForgeAttemptStarted,
    reserveForgeAttempt,
    saveForgeRequest,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    finalizeForgeValidation,
    recordForgeDelivery,
} from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import { ensureHallSchema } from '../../../src/tools/pennyone/intel/schema.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';

const temporaryRoots: string[] = [];

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-receipts-'));
    temporaryRoots.push(root);
    const dbPath = path.join(root, 'hall.db');
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 1000');
    ensureHallSchema(db, root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    return { root, dbPath, db, repoId };
}

function insertBead(db: Database.Database, repoId: string, beadId: string) {
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Forge receipt test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, '/tmp/fixture', now, now);
}

function requestInput(
    repoId: string,
    beadId: string,
    overrides: Partial<SaveForgeRequestInput> = {},
): SaveForgeRequestInput {
    const suffix = randomUUID();
    const now = Date.now();
    return {
        request_id: `dispatch-forge-${suffix}`,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: `decision-${suffix}`,
        operator_authorization_ref: `codex-thread:${suffix}`,
        operator_thread_id: suffix,
        operator_turn_id: randomUUID(),
        operator_message_sha256: 'a'.repeat(64),
        operator_record_sha256: 'b'.repeat(64),
        operator_record_set_sha256: 'e'.repeat(64),
        operator_record_count: 3,
        request_sha256: 'c'.repeat(64),
        request_summary_json: JSON.stringify({ suffix }),
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        write_capability: 'project_files',
        target_paths_sha256: 'd'.repeat(64),
        live_source_allowed: false,
        max_attempts: 1,
        authorized_at: now,
        expires_at: now + 60_000,
        now,
        ...overrides,
    };
}

afterEach(() => {
    while (temporaryRoots.length > 0) {
        fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('durable CStar Forge request and attempt receipts', () => {
    it('persists pending requests before authorization', () => {
        const fixture = createFixture();
        const beadId = 'bead:test:pending';
        insertBead(fixture.db, fixture.repoId, beadId);
        const input = requestInput(fixture.repoId, beadId, {
            operator_authorization_ref: undefined,
            operator_thread_id: undefined,
            operator_turn_id: undefined,
            operator_message_sha256: undefined,
            operator_record_sha256: undefined,
            operator_record_set_sha256: undefined,
            operator_record_count: undefined,
            adapter_ref: undefined,
            write_capability: undefined,
            authorized_at: undefined,
            expires_at: undefined,
        });

        const saved = saveForgeRequest(fixture.db, input);

        assert.equal(saved.replayed, false);
        assert.equal(saved.request.status, 'PENDING_AUTH');
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: input.request_id,
                idempotency_key: 'pending-attempt',
                execution_receipt_id: 'pending-receipt',
                adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            }),
            /forge_request_not_authorized:PENDING_AUTH/,
        );
        fixture.db.close();
    });

    it('persists the ordered authorization record set and rejects replay drift', () => {
        const fixture = createFixture();
        const beadId = 'bead:test:authorization-record-set';
        insertBead(fixture.db, fixture.repoId, beadId);
        const input = requestInput(fixture.repoId, beadId);

        const saved = saveForgeRequest(fixture.db, input);
        assert.equal(saved.request.operator_record_sha256, input.operator_record_sha256);
        assert.equal(saved.request.operator_record_set_sha256, input.operator_record_set_sha256);
        assert.equal(saved.request.operator_record_count, 3);
        assert.equal(saveForgeRequest(fixture.db, input).replayed, true);
        assert.throws(
            () => saveForgeRequest(fixture.db, { ...input, operator_record_set_sha256: 'f'.repeat(64) }),
            /forge_request_receipt_conflict/,
        );
        assert.throws(
            () => saveForgeRequest(fixture.db, { ...input, operator_record_count: 2 }),
            /forge_request_receipt_conflict/,
        );
        fixture.db.close();
    });

    it('makes a bootstrap operator reference one-shot', () => {
        const fixture = createFixture();
        insertBead(fixture.db, fixture.repoId, 'bead:test:one');
        insertBead(fixture.db, fixture.repoId, 'bead:test:two');
        const first = requestInput(fixture.repoId, 'bead:test:one');
        const second = requestInput(fixture.repoId, 'bead:test:two', {
            operator_authorization_ref: first.operator_authorization_ref,
        });

        saveForgeRequest(fixture.db, first);
        assert.throws(
            () => saveForgeRequest(fixture.db, second),
            /forge_operator_authorization_already_consumed/,
        );
        fixture.db.close();
    });

    it('reserves once and replays the same idempotency key across connections', () => {
        const fixture = createFixture();
        const beadId = 'bead:test:reserve';
        insertBead(fixture.db, fixture.repoId, beadId);
        const request = requestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, request);
        const secondConnection = new Database(fixture.dbPath);
        secondConnection.pragma('foreign_keys = ON');
        secondConnection.pragma('busy_timeout = 1000');

        const first = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            idempotency_key: 'stable-key',
            execution_receipt_id: 'stable-receipt',
            adapter_ref: request.adapter_ref!,
        });
        const replay = reserveForgeAttempt(secondConnection, {
            request_id: request.request_id,
            idempotency_key: 'stable-key',
            execution_receipt_id: 'ignored-on-replay',
            adapter_ref: request.adapter_ref!,
        });

        assert.equal(first.replayed, false);
        assert.deepEqual(
            getForgeAttemptByIdempotency(secondConnection, request.request_id, 'stable-key'),
            first.attempt,
        );
        assert.equal(
            getForgeAttemptByIdempotency(secondConnection, request.request_id, 'missing-key'),
            null,
        );
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.attempt, first.attempt);
        assert.throws(
            () => reserveForgeAttempt(secondConnection, {
                request_id: request.request_id,
                idempotency_key: 'different-key',
                execution_receipt_id: 'different-receipt',
                adapter_ref: request.adapter_ref!,
            }),
            /forge_request_has_unresolved_attempt/,
        );
        secondConnection.close();
        fixture.db.close();
    });

    it('keeps UNKNOWN unresolved and rejects cross-request retry lineage', () => {
        const fixture = createFixture();
        insertBead(fixture.db, fixture.repoId, 'bead:test:unknown');
        insertBead(fixture.db, fixture.repoId, 'bead:test:other');
        const firstRequest = requestInput(fixture.repoId, 'bead:test:unknown', { max_attempts: 2 });
        const secondRequest = requestInput(fixture.repoId, 'bead:test:other', { max_attempts: 2 });
        saveForgeRequest(fixture.db, firstRequest);
        saveForgeRequest(fixture.db, secondRequest);
        const firstAttempt = reserveForgeAttempt(fixture.db, {
            request_id: firstRequest.request_id,
            idempotency_key: 'first',
            execution_receipt_id: 'first-receipt',
            adapter_ref: firstRequest.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, firstAttempt.attempt_id);
        finalizeForgeAttempt(fixture.db, {
            attempt_id: firstAttempt.attempt_id,
            status: 'UNKNOWN',
            error_code: 'simulated_restart_ambiguity',
        });

        assert.equal(getForgeRequest(fixture.db, firstRequest.request_id)?.status, 'AMBIGUOUS');
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: firstRequest.request_id,
                idempotency_key: 'second',
                execution_receipt_id: 'second-receipt',
                adapter_ref: firstRequest.adapter_ref!,
            }),
            /forge_request_not_authorized:AMBIGUOUS/,
        );
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: secondRequest.request_id,
                idempotency_key: 'cross-request-retry',
                execution_receipt_id: 'cross-request-receipt',
                adapter_ref: secondRequest.adapter_ref!,
                retry_of_attempt_id: firstAttempt.attempt_id,
            }),
            /forge_attempt_retry_parent_invalid/,
        );
        fixture.db.close();
    });

    it('persists a terminal receipt across database close and reopen', () => {
        const fixture = createFixture();
        const beadId = 'bead:test:terminal';
        insertBead(fixture.db, fixture.repoId, beadId);
        const request = requestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, request);
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            idempotency_key: 'terminal',
            execution_receipt_id: 'terminal-receipt',
            adapter_ref: request.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, attempt.attempt_id);
        recordForgeDelivery(fixture.db, {
            attempt_id: attempt.attempt_id,
            external_execution_id: 'hermes-intent-1',
            result_status: 'ok',
            result_artifact_sha256: 'e'.repeat(64),
        });
        fixture.db.close();

        const reopened = new Database(fixture.dbPath);
        reopened.pragma('foreign_keys = ON');
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.status, 'STARTED');
        assert.match(getForgeAttempt(reopened, attempt.attempt_id)?.result_status ?? '', /DELIVERED_PENDING_VALIDATION/);
        finalizeForgeValidation(reopened, {
            execution_receipt_id: attempt.execution_receipt_id,
            bead_id: beadId,
            validation_id: 'val-terminal-reopen',
            verdict: 'SUCCESS',
            notes: 'independent receipt and artifact check passed',
            validation_authority: 'verified',
            validation_evidence_sha256: 'f'.repeat(64),
            validation_artifact_paths: [],
            validation_artifact_hashes: ['e'.repeat(64)],
        });
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.status, 'SUCCEEDED');
        assert.equal(getForgeRequest(reopened, request.request_id)?.status, 'SUCCEEDED');
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.result_artifact_sha256, 'e'.repeat(64));
        reopened.close();
    });

    it('requires verified evidence to correct a legacy unvalidated success', () => {
        const fixture = createFixture();
        const beadId = 'bead:test:legacy-correction';
        insertBead(fixture.db, fixture.repoId, beadId);
        const request = requestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, request);
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            idempotency_key: 'legacy',
            execution_receipt_id: 'legacy-receipt',
            adapter_ref: request.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, attempt.attempt_id);
        finalizeForgeAttempt(fixture.db, { attempt_id: attempt.attempt_id, status: 'SUCCEEDED' });

        assert.throws(() => finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            bead_id: beadId,
            validation_id: 'val-legacy-reported-rejection',
            verdict: 'FAILURE',
            notes: 'unverified caller report',
            validation_authority: 'reported',
        }), /forge_terminal_validation_requires_verified_evidence/);
        assert.equal(getForgeAttempt(fixture.db, attempt.attempt_id)?.status, 'SUCCEEDED');

        const corrected = finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            bead_id: beadId,
            validation_id: 'val-legacy-verified-rejection',
            verdict: 'FAILURE',
            notes: 'adapter claimed five files but delivered one',
            validation_authority: 'verified',
            validation_evidence_sha256: 'f'.repeat(64),
        });

        assert.equal(corrected.accepted, false);
        assert.equal(corrected.attempt.status, 'FAILED_FINAL');
        assert.equal(corrected.request.status, 'FAILED_FINAL');
        fixture.db.close();
    });
});
