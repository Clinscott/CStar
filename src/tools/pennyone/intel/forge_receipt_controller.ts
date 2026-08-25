import type Database from 'better-sqlite3';

import type {
    HallForgeAttemptRecord,
    HallForgeAttemptStatus,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
    HallForgeRequestStatus,
} from '../../../types/forge.js';
import {
    forgeAuthorizationLineageMatchesRequest,
    isForgeAuthorizationProfile,
    LEGACY_EXACT_FORGE_CHALLENGE_PROFILE,
} from './forge_authorization_policy.js';

export { forgeAuthorizationLineageMatchesRequest };

export interface ReserveForgeAttemptInput {
    request_id: string;
    authorization_id: string;
    idempotency_key: string;
    execution_receipt_id: string;
    adapter_ref: string;
    provider?: string;
    requested_model?: string;
    actual_model?: string;
    model_source?: string;
    reasoning_profile?: string;
    adapter_version?: string;
    retry_of_attempt_id?: string;
    now?: number;
}

export interface FinalizeForgeAttemptInput {
    attempt_id: string;
    status: Extract<HallForgeAttemptStatus, 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'UNKNOWN'>;
    external_execution_id?: string;
    result_status?: string;
    result_artifact_sha256?: string;
    error_code?: string;
    provider?: string;
    requested_model?: string;
    actual_model?: string;
    model_source?: string;
    reasoning_profile?: string;
    adapter_version?: string;
    now?: number;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalAuthorizationProfile(value: unknown): HallForgeRequestRecord['authorization_profile'] {
    if (value === null || value === undefined || value === '') return undefined;
    if (!isForgeAuthorizationProfile(value)) throw new Error('forge_authorization_profile_invalid');
    return value;
}

function mapForgeRequest(row: Record<string, unknown>): HallForgeRequestRecord {
    return {
        request_id: String(row.request_id),
        repo_id: String(row.repo_id),
        bead_id: String(row.bead_id),
        decision_id: String(row.decision_id),
        operator_authorization_ref: optionalString(row.operator_authorization_ref),
        operator_thread_id: optionalString(row.operator_thread_id),
        operator_turn_id: optionalString(row.operator_turn_id),
        operator_message_sha256: optionalString(row.operator_message_sha256),
        operator_record_sha256: optionalString(row.operator_record_sha256),
        operator_record_set_sha256: optionalString(row.operator_record_set_sha256),
        operator_record_count: optionalNumber(row.operator_record_count),
        requester_thread_id: optionalString(row.requester_thread_id),
        requester_turn_id: optionalString(row.requester_turn_id),
        requester_record_set_sha256: optionalString(row.requester_record_set_sha256),
        authorization_profile: optionalAuthorizationProfile(row.authorization_profile),
        authorization_binding_sha256: optionalString(row.authorization_binding_sha256),
        authorization_challenge_sha256: optionalString(row.authorization_challenge_sha256),
        request_sha256: String(row.request_sha256),
        request_summary_json: String(row.request_summary_json),
        adapter_ref: optionalString(row.adapter_ref),
        write_capability: optionalString(row.write_capability) as HallForgeRequestRecord['write_capability'],
        target_paths_sha256: String(row.target_paths_sha256),
        live_source_allowed: Number(row.live_source_allowed) === 1 ? 1 : 0,
        max_attempts: Number(row.max_attempts),
        status: String(row.status) as HallForgeRequestStatus,
        active_attempt_id: optionalString(row.active_attempt_id),
        authorized_at: optionalNumber(row.authorized_at),
        expires_at: optionalNumber(row.expires_at),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
        completed_at: optionalNumber(row.completed_at),
    };
}

function mapForgeAuthorization(row: Record<string, unknown>): HallForgeAuthorizationRecord {
    if (!isForgeAuthorizationProfile(row.authorization_profile)) {
        throw new Error('forge_authorization_profile_invalid');
    }
    return {
        authorization_id: String(row.authorization_id),
        request_id: String(row.request_id),
        request_sha256: String(row.request_sha256),
        authorization_profile: row.authorization_profile,
        authorization_binding_sha256: String(row.authorization_binding_sha256),
        challenge_sha256: optionalString(row.challenge_sha256),
        operator_intent_json: optionalString(row.operator_intent_json),
        operator_authorization_ref: String(row.operator_authorization_ref),
        operator_thread_id: String(row.operator_thread_id),
        operator_turn_id: String(row.operator_turn_id),
        operator_message_sha256: String(row.operator_message_sha256),
        operator_record_sha256: String(row.operator_record_sha256),
        operator_record_set_sha256: String(row.operator_record_set_sha256),
        operator_record_count: Number(row.operator_record_count),
        execution_grant_schema: optionalString(row.execution_grant_schema) as
            HallForgeAuthorizationRecord['execution_grant_schema'],
        execution_grant_sha256: optionalString(row.execution_grant_sha256),
        execution_grant_json: optionalString(row.execution_grant_json),
        authorized_at: Number(row.authorized_at),
        expires_at: Number(row.expires_at),
        created_at: Number(row.created_at),
    };
}

function mapForgeAttempt(row: Record<string, unknown>): HallForgeAttemptRecord {
    return {
        attempt_id: String(row.attempt_id),
        request_id: String(row.request_id),
        ordinal: Number(row.ordinal),
        idempotency_key: String(row.idempotency_key),
        execution_receipt_id: String(row.execution_receipt_id),
        adapter_ref: String(row.adapter_ref),
        provider: optionalString(row.provider),
        requested_model: optionalString(row.requested_model),
        actual_model: optionalString(row.actual_model),
        model_source: optionalString(row.model_source),
        reasoning_profile: optionalString(row.reasoning_profile),
        adapter_version: optionalString(row.adapter_version),
        status: String(row.status) as HallForgeAttemptStatus,
        retry_of_attempt_id: optionalString(row.retry_of_attempt_id),
        external_execution_id: optionalString(row.external_execution_id),
        result_status: optionalString(row.result_status),
        result_artifact_sha256: optionalString(row.result_artifact_sha256),
        error_code: optionalString(row.error_code),
        validation_id: optionalString(row.validation_id),
        validation_verdict: optionalString(row.validation_verdict),
        validation_notes_sha256: optionalString(row.validation_notes_sha256),
        validation_authority: optionalString(row.validation_authority),
        validation_evidence_sha256: optionalString(row.validation_evidence_sha256),
        reserved_at: Number(row.reserved_at),
        spawn_started_at: optionalNumber(row.spawn_started_at),
        completed_at: optionalNumber(row.completed_at),
        updated_at: Number(row.updated_at),
    };
}

export function getForgeRequest(db: Database.Database, requestId: string): HallForgeRequestRecord | null {
    const row = db.prepare('SELECT * FROM hall_forge_requests WHERE request_id = ?').get(requestId) as Record<string, unknown> | undefined;
    return row ? mapForgeRequest(row) : null;
}

export function getForgeRequestByDecision(
    db: Database.Database,
    beadId: string,
    decisionId: string,
): HallForgeRequestRecord | null {
    const row = db.prepare(
        'SELECT * FROM hall_forge_requests WHERE bead_id = ? AND decision_id = ?',
    ).get(beadId, decisionId) as Record<string, unknown> | undefined;
    return row ? mapForgeRequest(row) : null;
}

export function getForgeAttempt(db: Database.Database, attemptId: string): HallForgeAttemptRecord | null {
    const row = db.prepare('SELECT * FROM hall_forge_attempts WHERE attempt_id = ?').get(attemptId) as Record<string, unknown> | undefined;
    return row ? mapForgeAttempt(row) : null;
}

export function getForgeAttemptByExecutionReceipt(
    db: Database.Database,
    executionReceiptId: string,
): HallForgeAttemptRecord | null {
    const row = db.prepare(
        'SELECT * FROM hall_forge_attempts WHERE execution_receipt_id = ?',
    ).get(executionReceiptId) as Record<string, unknown> | undefined;
    return row ? mapForgeAttempt(row) : null;
}

export function getForgeAuthorizationByRequest(
    db: Database.Database,
    requestId: string,
): HallForgeAuthorizationRecord | null {
    const row = db.prepare(
        'SELECT * FROM hall_forge_authorizations WHERE request_id = ?',
    ).get(requestId) as Record<string, unknown> | undefined;
    return row ? mapForgeAuthorization(row) : null;
}

export function getForgeAttemptByIdempotency(
    db: Database.Database,
    requestId: string,
    idempotencyKey: string,
): HallForgeAttemptRecord | null {
    const row = db.prepare(
        'SELECT * FROM hall_forge_attempts WHERE request_id = ? AND idempotency_key = ?',
    ).get(requestId, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? mapForgeAttempt(row) : null;
}

export function exactForgeAuthorizationMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord | null,
): authorization is HallForgeAuthorizationRecord {
    return request.status === 'AUTHORIZED'
        && authorization?.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        && forgeAuthorizationLineageMatchesRequest(request, authorization);
}

export function activeForgeAuthorizationMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord | null,
): authorization is HallForgeAuthorizationRecord {
    return request.status === 'AUTHORIZED'
        && forgeAuthorizationLineageMatchesRequest(request, authorization);
}

function assertExactForgeAuthorization(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord | null,
    expectedAuthorizationId: string,
): void {
    if (
        !activeForgeAuthorizationMatchesRequest(request, authorization)
        || authorization.authorization_id !== expectedAuthorizationId
    ) {
        throw new Error('forge_exact_authorization_receipt_required');
    }
}

function forgeAttemptReplayInputMatches(
    attempt: HallForgeAttemptRecord,
    input: ReserveForgeAttemptInput,
): boolean {
    return attempt.request_id === input.request_id
        && attempt.idempotency_key === input.idempotency_key
        && attempt.execution_receipt_id === input.execution_receipt_id
        && attempt.adapter_ref === input.adapter_ref
        && attempt.provider === input.provider
        && attempt.requested_model === input.requested_model
        && attempt.reasoning_profile === input.reasoning_profile
        && attempt.adapter_version === input.adapter_version
        && attempt.retry_of_attempt_id === input.retry_of_attempt_id;
}

export function reserveForgeAttempt(
    db: Database.Database,
    input: ReserveForgeAttemptInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord; replayed: boolean } {
    const now = input.now ?? Date.now();
    if (!input.idempotency_key.trim()) {
        throw new Error('forge_attempt_idempotency_key_required');
    }
    const reserve = db.transaction(() => {
        const existing = db.prepare(
            'SELECT * FROM hall_forge_attempts WHERE request_id = ? AND idempotency_key = ?',
        ).get(input.request_id, input.idempotency_key) as Record<string, unknown> | undefined;
        if (existing) {
            const request = getForgeRequest(db, input.request_id);
            if (!request) throw new Error('forge_request_not_found');
            const authorization = getForgeAuthorizationByRequest(db, request.request_id);
            if (!forgeAuthorizationLineageMatchesRequest(request, authorization)
                || authorization.authorization_id !== input.authorization_id) {
                throw new Error('forge_exact_authorization_receipt_required');
            }
            const attempt = mapForgeAttempt(existing);
            if (!forgeAttemptReplayInputMatches(attempt, input)) {
                throw new Error('forge_attempt_idempotency_replay_conflict');
            }
            return { attempt, request, replayed: true };
        }
        const request = getForgeRequest(db, input.request_id);
        if (!request) throw new Error('forge_request_not_found');
        if (request.status !== 'AUTHORIZED') {
            throw new Error(`forge_request_not_authorized:${request.status}`);
        }
        assertExactForgeAuthorization(
            request,
            getForgeAuthorizationByRequest(db, request.request_id),
            input.authorization_id,
        );
        if (!request.expires_at || request.expires_at <= now) {
            db.prepare(`
                UPDATE hall_forge_attempts
                SET status = 'UNKNOWN', error_code = 'authorization_expired_with_nonterminal_attempt',
                    completed_at = ?, updated_at = ?
                WHERE request_id = ? AND status IN ('RESERVED', 'STARTED')
            `).run(now, now, request.request_id);
            db.prepare(`
                UPDATE hall_forge_requests
                SET status = 'EXHAUSTED', updated_at = ?, completed_at = ?
                WHERE request_id = ?
            `).run(now, now, request.request_id);
            throw new Error('forge_request_authorization_expired');
        }
        if (request.adapter_ref !== input.adapter_ref) {
            throw new Error('forge_attempt_adapter_mismatch');
        }
        const active = db.prepare(`
            SELECT attempt_id FROM hall_forge_attempts
            WHERE request_id = ? AND status IN ('RESERVED', 'STARTED', 'UNKNOWN')
            LIMIT 1
        `).get(input.request_id) as { attempt_id?: string } | undefined;
        if (active) throw new Error(`forge_request_has_unresolved_attempt:${active.attempt_id}`);
        const count = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(input.request_id) as { count?: number }).count ?? 0);
        if (count >= request.max_attempts) {
            db.prepare(`
                UPDATE hall_forge_requests
                SET status = 'EXHAUSTED', updated_at = ?, completed_at = ?
                WHERE request_id = ?
            `).run(now, now, request.request_id);
            throw new Error('forge_request_attempt_budget_exhausted');
        }
        if (input.retry_of_attempt_id) {
            const parent = db.prepare(`
                SELECT status FROM hall_forge_attempts
                WHERE request_id = ? AND attempt_id = ?
            `).get(input.request_id, input.retry_of_attempt_id) as { status?: string } | undefined;
            if (parent?.status !== 'FAILED_RETRYABLE') {
                throw new Error('forge_attempt_retry_parent_invalid');
            }
        } else if (count > 0) {
            throw new Error('forge_attempt_retry_parent_required');
        }
        const ordinal = count + 1;
        const attemptId = `forge-attempt-${input.request_id.replace(/^dispatch-forge-/, '')}-${ordinal}`;
        db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key, execution_receipt_id,
                adapter_ref, provider, requested_model, actual_model, model_source,
                reasoning_profile, adapter_version, status, retry_of_attempt_id, reserved_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESERVED', ?, ?, ?)
        `).run(
            attemptId,
            request.request_id,
            ordinal,
            input.idempotency_key,
            input.execution_receipt_id,
            input.adapter_ref,
            input.provider ?? null,
            input.requested_model ?? null,
            input.actual_model ?? null,
            input.model_source ?? 'unreported',
            input.reasoning_profile ?? null,
            input.adapter_version ?? null,
            input.retry_of_attempt_id ?? null,
            now,
            now,
        );
        const claimed = db.prepare(`
            UPDATE hall_forge_requests
            SET active_attempt_id = ?, updated_at = ?
            WHERE request_id = ? AND status = 'AUTHORIZED' AND active_attempt_id IS NULL
        `).run(attemptId, now, request.request_id);
        if (Number(claimed.changes) !== 1) {
            throw new Error('forge_request_attempt_reservation_race');
        }
        return {
            attempt: getForgeAttempt(db, attemptId)!,
            request: getForgeRequest(db, request.request_id)!,
            replayed: false,
        };
    });
    return reserve.immediate();
}

export function markForgeAttemptStarted(
    db: Database.Database,
    attemptId: string,
    now = Date.now(),
): HallForgeAttemptRecord {
    const changed = db.prepare(`
        UPDATE hall_forge_attempts
        SET status = 'STARTED', spawn_started_at = ?, updated_at = ?
        WHERE attempt_id = ? AND status = 'RESERVED'
    `).run(now, now, attemptId);
    if (Number(changed.changes) !== 1) {
        throw new Error('forge_attempt_start_transition_invalid');
    }
    return getForgeAttempt(db, attemptId)!;
}

export function finalizeForgeAttempt(
    db: Database.Database,
    input: FinalizeForgeAttemptInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord } {
    const now = input.now ?? Date.now();
    const finish = db.transaction(() => {
        const attempt = getForgeAttempt(db, input.attempt_id);
        if (!attempt) throw new Error('forge_attempt_not_found');
        if (!['RESERVED', 'STARTED'].includes(attempt.status)) {
            if (attempt.status === input.status) {
                return { attempt, request: getForgeRequest(db, attempt.request_id)! };
            }
            throw new Error(`forge_attempt_finalize_transition_invalid:${attempt.status}`);
        }
        db.prepare(`
            UPDATE hall_forge_attempts
            SET status = ?, external_execution_id = ?, result_status = ?,
                result_artifact_sha256 = ?, error_code = ?, provider = ?, requested_model = ?,
                actual_model = ?, model_source = ?, reasoning_profile = ?, adapter_version = ?,
                completed_at = ?, updated_at = ?
            WHERE attempt_id = ?
        `).run(
            input.status,
            input.external_execution_id ?? null,
            input.result_status ?? null,
            input.result_artifact_sha256 ?? null,
            input.error_code ?? null,
            input.provider ?? attempt.provider ?? null,
            input.requested_model ?? attempt.requested_model ?? null,
            input.actual_model ?? attempt.actual_model ?? null,
            input.model_source ?? attempt.model_source ?? 'unreported',
            input.reasoning_profile ?? attempt.reasoning_profile ?? null,
            input.adapter_version ?? attempt.adapter_version ?? null,
            now,
            now,
            attempt.attempt_id,
        );
        const request = getForgeRequest(db, attempt.request_id)!;
        const attemptCount = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        const requestStatus: HallForgeRequestStatus = input.status === 'SUCCEEDED'
            ? 'SUCCEEDED'
            : input.status === 'FAILED_FINAL'
                ? 'FAILED_FINAL'
                : input.status === 'UNKNOWN'
                    ? 'AMBIGUOUS'
                    : attemptCount >= request.max_attempts
                        ? 'EXHAUSTED'
                        : 'AUTHORIZED';
        const completedAt = requestStatus === 'AUTHORIZED' ? null : now;
        db.prepare(`
            UPDATE hall_forge_requests
            SET status = ?, active_attempt_id = ?, completed_at = ?, updated_at = ?
            WHERE request_id = ? AND active_attempt_id = ?
        `).run(
            requestStatus,
            input.status === 'UNKNOWN' ? attempt.attempt_id : null,
            completedAt,
            now,
            request.request_id,
            attempt.attempt_id,
        );
        return {
            attempt: getForgeAttempt(db, attempt.attempt_id)!,
            request: getForgeRequest(db, request.request_id)!,
        };
    });
    return finish.immediate();
}
