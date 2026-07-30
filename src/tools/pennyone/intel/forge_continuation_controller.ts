import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
    FORGE_PRE_PROVIDER_RECOVERABLE_FAILURE_CODES,
    type HallForgeContinuationRecord,
} from '../../../types/forge.js';

const DIGEST = /^[a-f0-9]{64}$/;
const RECOVERABLE_FAILURES = new Set<string>(FORGE_PRE_PROVIDER_RECOVERABLE_FAILURE_CODES);
export const FORGE_PREPROVIDER_CONTINUATION_LIMIT = 10;
const ATTEMPT_COLUMNS = [
    ['attempt_budget_class', "TEXT NOT NULL DEFAULT 'provider_or_unknown'"],
    ['provider_evidence_valid', 'INTEGER NOT NULL DEFAULT 0'],
    ['provider_requests_started', 'INTEGER'],
    ['provider_requests_completed', 'INTEGER'],
    ['provider_requests_ambiguous', 'INTEGER'],
    ['live_spend', 'INTEGER'],
    ['live_spend_unknown', 'INTEGER NOT NULL DEFAULT 1'],
    ['known_spend_observed', 'INTEGER NOT NULL DEFAULT 0'],
    ['live_source_collection', 'INTEGER'],
    ['workspace_commit_present', 'INTEGER'],
    ['failure_evidence_sha256', 'TEXT'],
    ['failure_signature_sha256', 'TEXT'],
] as const;

export interface FinalizeForgePreProviderContinuationInput {
    attempt_id: string;
    failure_code: string;
    execution_trace_sha256: string;
    zero_provider_proof: Record<string, unknown>;
    continuation_authority_sha256: string;
    prior_runtime_sha256: string;
    reconcile_failed_final?: boolean;
    now?: number;
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function ensureColumn(
    db: Database.Database,
    table: string,
    column: string,
    declaration: string,
): void {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    if (!columns.some((entry) => entry.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
}

export function ensureForgeContinuationSchema(db: Database.Database): void {
    for (const [column, declaration] of ATTEMPT_COLUMNS) {
        ensureColumn(db, 'hall_forge_attempts', column, declaration);
    }
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_forge_attempts_one_retry_child
        ON hall_forge_attempts(request_id, retry_of_attempt_id)
        WHERE retry_of_attempt_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS hall_forge_preprovider_continuations (
            continuation_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            attempt_id TEXT NOT NULL UNIQUE,
            cycle_ordinal INTEGER NOT NULL CHECK(cycle_ordinal >= 1 AND cycle_ordinal <= 10),
            failure_code TEXT NOT NULL,
            failure_fingerprint_sha256 TEXT NOT NULL,
            execution_trace_sha256 TEXT NOT NULL,
            zero_provider_proof_sha256 TEXT NOT NULL,
            zero_provider_proof_json TEXT NOT NULL,
            continuation_authority_sha256 TEXT NOT NULL,
            prior_runtime_sha256 TEXT NOT NULL,
            next_runtime_sha256 TEXT,
            repair_validation_id TEXT,
            repair_evidence_sha256 TEXT,
            reconciled_from_status TEXT CHECK(reconciled_from_status IS NULL OR reconciled_from_status = 'FAILED_FINAL'),
            block_reason TEXT CHECK(block_reason IS NULL OR block_reason IN ('repeated_failure_no_progress', 'mechanical_cycle_budget_exhausted')),
            provider_attempted INTEGER NOT NULL DEFAULT 0 CHECK(provider_attempted = 0),
            proof_valid INTEGER NOT NULL DEFAULT 1 CHECK(proof_valid = 1),
            status TEXT NOT NULL CHECK(status IN ('PENDING_REPAIR', 'RESUMED', 'BLOCKED')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            resumed_at INTEGER,
            UNIQUE(request_id, cycle_ordinal),
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id),
            FOREIGN KEY(request_id, attempt_id) REFERENCES hall_forge_attempts(request_id, attempt_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_forge_preprovider_continuations_pending
        ON hall_forge_preprovider_continuations(request_id, status, cycle_ordinal);
    `);
    ensureColumn(db, 'hall_forge_preprovider_continuations', 'block_reason',
        "TEXT CHECK(block_reason IS NULL OR block_reason IN ('repeated_failure_no_progress', 'mechanical_cycle_budget_exhausted'))");
}

function mapContinuation(row: Record<string, unknown>): HallForgeContinuationRecord {
    return {
        continuation_id: String(row.continuation_id),
        request_id: String(row.request_id),
        attempt_id: String(row.attempt_id),
        cycle_ordinal: Number(row.cycle_ordinal),
        failure_code: String(row.failure_code),
        failure_fingerprint_sha256: String(row.failure_fingerprint_sha256),
        execution_trace_sha256: String(row.execution_trace_sha256),
        zero_provider_proof_sha256: String(row.zero_provider_proof_sha256),
        zero_provider_proof_json: String(row.zero_provider_proof_json),
        continuation_authority_sha256: String(row.continuation_authority_sha256),
        prior_runtime_sha256: String(row.prior_runtime_sha256),
        next_runtime_sha256: optionalString(row.next_runtime_sha256),
        repair_validation_id: optionalString(row.repair_validation_id),
        repair_evidence_sha256: optionalString(row.repair_evidence_sha256),
        reconciled_from_status: optionalString(row.reconciled_from_status) as 'FAILED_FINAL' | undefined,
        block_reason: optionalString(row.block_reason) as HallForgeContinuationRecord['block_reason'],
        provider_attempted: 0,
        proof_valid: 1,
        status: String(row.status) as HallForgeContinuationRecord['status'],
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
        resumed_at: typeof row.resumed_at === 'number' ? row.resumed_at : undefined,
    };
}

export function getForgeContinuationByAttempt(
    db: Database.Database,
    attemptId: string,
): HallForgeContinuationRecord | null {
    const row = db.prepare(
        'SELECT * FROM hall_forge_preprovider_continuations WHERE attempt_id = ?',
    ).get(attemptId) as Record<string, unknown> | undefined;
    return row ? mapContinuation(row) : null;
}

export function getPendingForgeContinuation(
    db: Database.Database,
    requestId: string,
): HallForgeContinuationRecord | null {
    const row = db.prepare(`
        SELECT * FROM hall_forge_preprovider_continuations
        WHERE request_id = ? AND status = 'PENDING_REPAIR'
        ORDER BY cycle_ordinal DESC LIMIT 1
    `).get(requestId) as Record<string, unknown> | undefined;
    return row ? mapContinuation(row) : null;
}

export function countForgeProviderAttempts(db: Database.Database, requestId: string): number {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM hall_forge_attempts a
        WHERE a.request_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM hall_forge_preprovider_continuations c
              WHERE c.attempt_id = a.attempt_id
                AND c.provider_attempted = 0 AND c.proof_valid = 1
          )
    `).get(requestId) as { count?: number };
    return Number(row.count ?? 0);
}

export function isForgePreProviderRetryParent(
    db: Database.Database,
    requestId: string,
    attemptId: string,
): boolean {
    const row = db.prepare(`
        SELECT a.attempt_id
        FROM hall_forge_attempts a
        JOIN hall_forge_preprovider_continuations c ON c.attempt_id = a.attempt_id
        WHERE a.request_id = ? AND a.attempt_id = ? AND a.status = 'FAILED_RETRYABLE'
          AND c.request_id = a.request_id AND c.status = 'PENDING_REPAIR'
          AND c.provider_attempted = 0 AND c.proof_valid = 1
          AND a.ordinal = (SELECT MAX(ordinal) FROM hall_forge_attempts WHERE request_id = ?)
    `).get(requestId, attemptId, requestId) as { attempt_id?: string } | undefined;
    return Boolean(row?.attempt_id);
}

export function finalizeForgePreProviderContinuation(
    db: Database.Database,
    input: FinalizeForgePreProviderContinuationInput,
): HallForgeContinuationRecord {
    const now = input.now ?? Date.now();
    if (!RECOVERABLE_FAILURES.has(input.failure_code)) {
        throw new Error('forge_preprovider_failure_not_recoverable');
    }
    for (const digest of [
        input.execution_trace_sha256,
        input.continuation_authority_sha256,
        input.prior_runtime_sha256,
    ]) if (!DIGEST.test(digest)) throw new Error('forge_preprovider_continuation_digest_invalid');
    const proofJson = stableJson(input.zero_provider_proof);
    const proofSha256 = sha256(proofJson);
    const finish = db.transaction(() => {
        const attempt = db.prepare(
            'SELECT * FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(input.attempt_id) as Record<string, unknown> | undefined;
        if (!attempt) throw new Error('forge_attempt_not_found');
        const requestId = String(attempt.request_id);
        const request = db.prepare(
            'SELECT * FROM hall_forge_requests WHERE request_id = ?',
        ).get(requestId) as Record<string, unknown> | undefined;
        if (!request) throw new Error('forge_request_not_found');
        const existing = getForgeContinuationByAttempt(db, input.attempt_id);
        const reconcile = input.reconcile_failed_final === true;
        if (existing) {
            if (existing.failure_code === input.failure_code
                && existing.execution_trace_sha256 === input.execution_trace_sha256
                && existing.zero_provider_proof_sha256 === proofSha256
                && existing.continuation_authority_sha256 === input.continuation_authority_sha256
                && existing.prior_runtime_sha256 === input.prior_runtime_sha256
                && Boolean(existing.reconciled_from_status) === reconcile) return existing;
            throw new Error('forge_preprovider_continuation_replay_conflict');
        }
        if (attempt.status !== (reconcile ? 'FAILED_FINAL' : 'STARTED')
            && attempt.status !== (reconcile ? 'FAILED_FINAL' : 'RESERVED')) {
            throw new Error(`forge_preprovider_attempt_transition_invalid:${String(attempt.status)}`);
        }
        if (request.status !== (reconcile ? 'FAILED_FINAL' : 'AUTHORIZED')) {
            throw new Error(`forge_preprovider_request_transition_invalid:${String(request.status)}`);
        }
        if (reconcile && (attempt.validation_id || attempt.validation_evidence_sha256)) {
            throw new Error('forge_preprovider_reconciliation_already_validated');
        }
        const cycle = Number((db.prepare(`
            SELECT COUNT(*) AS count FROM hall_forge_preprovider_continuations
            WHERE request_id = ?
        `).get(requestId) as { count?: number }).count ?? 0) + 1;
        const fingerprint = sha256(stableJson({
            schema: 'cstar.forge_pre_provider_continuation.v1',
            request_id: requestId,
            failure_code: input.failure_code,
            zero_provider_proof_sha256: proofSha256,
            continuation_authority_sha256: input.continuation_authority_sha256,
            prior_runtime_sha256: input.prior_runtime_sha256,
        }));
        const previous = db.prepare(`
            SELECT failure_fingerprint_sha256, prior_runtime_sha256
            FROM hall_forge_preprovider_continuations WHERE request_id = ?
            ORDER BY cycle_ordinal DESC LIMIT 2
        `).all(requestId) as Array<Record<string, unknown>>;
        const repeatedFailure = previous.length === 2 && previous.every((item) =>
            item.failure_fingerprint_sha256 === fingerprint
            && item.prior_runtime_sha256 === input.prior_runtime_sha256);
        const blockReason = repeatedFailure
            ? 'repeated_failure_no_progress'
            : cycle >= FORGE_PREPROVIDER_CONTINUATION_LIMIT
                ? 'mechanical_cycle_budget_exhausted' : null;
        const continuationStatus = blockReason ? 'BLOCKED' : 'PENDING_REPAIR';
        const continuationId = `forge-continuation-${sha256(`${requestId}:${input.attempt_id}:${fingerprint}`).slice(0, 32)}`;
        db.prepare(`
            INSERT INTO hall_forge_preprovider_continuations (
                continuation_id, request_id, attempt_id, cycle_ordinal,
                failure_code, failure_fingerprint_sha256, execution_trace_sha256,
                zero_provider_proof_sha256, zero_provider_proof_json,
                continuation_authority_sha256, prior_runtime_sha256,
                reconciled_from_status, block_reason, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            continuationId, requestId, input.attempt_id, cycle,
            input.failure_code, fingerprint, input.execution_trace_sha256,
            proofSha256, proofJson, input.continuation_authority_sha256,
            input.prior_runtime_sha256, reconcile ? 'FAILED_FINAL' : null,
            blockReason, continuationStatus, now, now,
        );
        db.prepare(`
            UPDATE hall_forge_attempts
            SET status = 'FAILED_RETRYABLE', error_code = ?,
                attempt_budget_class = 'mechanical_no_provider',
                provider_evidence_valid = 1,
                provider_requests_started = 0, provider_requests_completed = 0,
                provider_requests_ambiguous = 0, live_spend = 0,
                live_spend_unknown = 0, known_spend_observed = 0,
                live_source_collection = 0, workspace_commit_present = 0,
                failure_evidence_sha256 = ?, failure_signature_sha256 = ?,
                completed_at = COALESCE(completed_at, ?), updated_at = ?
            WHERE attempt_id = ?
        `).run(
            input.failure_code, input.execution_trace_sha256, fingerprint,
            now, now, input.attempt_id,
        );
        db.prepare(`
            UPDATE hall_forge_requests
            SET status = ?, active_attempt_id = NULL, completed_at = ?, updated_at = ?
            WHERE request_id = ?
        `).run(blockReason ? 'EXHAUSTED' : 'AUTHORIZED', blockReason ? now : null, now, requestId);
        return getForgeContinuationByAttempt(db, input.attempt_id)!;
    });
    return finish.immediate();
}

export function bindForgeContinuationRepairValidation(
    db: Database.Database,
    attemptId: string,
    validationId: string,
    evidenceSha256: string,
    now = Date.now(),
): HallForgeContinuationRecord {
    if (!validationId.trim() || !DIGEST.test(evidenceSha256)) {
        throw new Error('forge_continuation_repair_validation_invalid');
    }
    const existing = getForgeContinuationByAttempt(db, attemptId);
    if (!existing || existing.status !== 'PENDING_REPAIR') {
        throw new Error('forge_continuation_repair_validation_parent_invalid');
    }
    if (existing.repair_validation_id || existing.repair_evidence_sha256) {
        if (existing.repair_validation_id === validationId
            && existing.repair_evidence_sha256 === evidenceSha256) return existing;
        throw new Error('forge_continuation_repair_validation_conflict');
    }
    const changed = db.prepare(`
        UPDATE hall_forge_preprovider_continuations
        SET repair_validation_id = ?, repair_evidence_sha256 = ?, updated_at = ?
        WHERE attempt_id = ? AND status = 'PENDING_REPAIR'
          AND repair_validation_id IS NULL AND repair_evidence_sha256 IS NULL
    `).run(validationId, evidenceSha256, now, attemptId);
    if (Number(changed.changes) !== 1) {
        throw new Error('forge_continuation_repair_validation_race');
    }
    return getForgeContinuationByAttempt(db, attemptId)!;
}

export function markForgeContinuationResumed(
    db: Database.Database,
    requestId: string,
    attemptId: string,
    nextRuntimeSha256: string,
    now = Date.now(),
): HallForgeContinuationRecord {
    if (!DIGEST.test(nextRuntimeSha256)) throw new Error('forge_continuation_runtime_digest_invalid');
    const continuation = getForgeContinuationByAttempt(db, attemptId);
    if (!continuation?.repair_validation_id || !continuation.repair_evidence_sha256) {
        throw new Error('forge_continuation_repair_validation_required');
    }
    const changed = db.prepare(`
        UPDATE hall_forge_preprovider_continuations
        SET status = 'RESUMED', next_runtime_sha256 = ?, resumed_at = ?, updated_at = ?
        WHERE request_id = ? AND attempt_id = ? AND status = 'PENDING_REPAIR'
          AND repair_validation_id IS NOT NULL AND repair_evidence_sha256 IS NOT NULL
    `).run(nextRuntimeSha256, now, now, requestId, attemptId);
    if (Number(changed.changes) !== 1) throw new Error('forge_continuation_runtime_lineage_invalid');
    return getForgeContinuationByAttempt(db, attemptId)!;
}
