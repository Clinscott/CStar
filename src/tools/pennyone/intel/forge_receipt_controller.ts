import type Database from 'better-sqlite3';

import type {
    HallForgeAttemptRecord,
    HallForgeAttemptStatus,
    HallForgeRequestRecord,
    HallForgeRequestStatus,
} from '../../../types/forge.js';

export interface SaveForgeRequestInput {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    request_sha256: string;
    request_summary_json: string;
    target_paths_sha256: string;
    live_source_allowed: boolean;
    max_attempts: number;
    operator_authorization_ref?: string;
    operator_thread_id?: string;
    operator_turn_id?: string;
    operator_message_sha256?: string;
    operator_record_sha256?: string;
    operator_record_set_sha256?: string;
    operator_record_count?: number;
    adapter_ref?: string;
    write_capability?: 'response_only' | 'project_files';
    authorized_at?: number;
    expires_at?: number;
    now?: number;
}

export interface ReserveForgeAttemptInput {
    request_id: string;
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

export function getForgeAttempt(db: Database.Database, attemptId: string): HallForgeAttemptRecord | null {
    const row = db.prepare('SELECT * FROM hall_forge_attempts WHERE attempt_id = ?').get(attemptId) as Record<string, unknown> | undefined;
    return row ? mapForgeAttempt(row) : null;
}

function requestIdentityMatches(existing: HallForgeRequestRecord, input: SaveForgeRequestInput): boolean {
    return existing.request_id === input.request_id
        && existing.repo_id === input.repo_id
        && existing.bead_id === input.bead_id
        && existing.decision_id === input.decision_id
        && existing.request_sha256 === input.request_sha256
        && existing.request_summary_json === input.request_summary_json
        && existing.target_paths_sha256 === input.target_paths_sha256
        && existing.operator_authorization_ref === input.operator_authorization_ref
        && existing.operator_thread_id === input.operator_thread_id
        && existing.operator_turn_id === input.operator_turn_id
        && existing.operator_message_sha256 === input.operator_message_sha256
        && existing.operator_record_sha256 === input.operator_record_sha256
        && existing.operator_record_set_sha256 === input.operator_record_set_sha256
        && existing.operator_record_count === input.operator_record_count
        && existing.adapter_ref === input.adapter_ref;
}

export function saveForgeRequest(
    db: Database.Database,
    input: SaveForgeRequestInput,
): { request: HallForgeRequestRecord; replayed: boolean } {
    const now = input.now ?? Date.now();
    const authorized = Boolean(input.operator_authorization_ref);
    if (input.max_attempts < 1 || input.max_attempts > 10) {
        throw new Error('forge_request_max_attempts_invalid');
    }
    if (authorized && (
        !input.adapter_ref
        || !input.write_capability
        || !input.authorized_at
        || !input.expires_at
        || !input.operator_thread_id
        || !input.operator_turn_id
        || !input.operator_message_sha256
        || !input.operator_record_sha256
        || !input.operator_record_set_sha256
        || !Number.isInteger(input.operator_record_count)
        || input.operator_record_count! < 1
    )) {
        throw new Error('forge_request_authorization_fields_incomplete');
    }
    const save = db.transaction(() => {
        const bead = db.prepare('SELECT repo_id, status FROM hall_beads WHERE bead_id = ?').get(input.bead_id) as {
            repo_id?: string;
            status?: string;
        } | undefined;
        if (!bead || bead.repo_id !== input.repo_id) {
            throw new Error('forge_request_bead_not_found_in_repository');
        }
        if (['RESOLVED', 'ARCHIVED', 'SUPERSEDED'].includes(bead.status ?? '')) {
            throw new Error('forge_request_bead_is_terminal');
        }
        const existingById = getForgeRequest(db, input.request_id);
        if (existingById) {
            if (!requestIdentityMatches(existingById, input)) {
                throw new Error('forge_request_receipt_conflict');
            }
            return { request: existingById, replayed: true };
        }
        if (input.operator_authorization_ref) {
            const consumed = db.prepare(
                'SELECT request_id FROM hall_forge_requests WHERE operator_authorization_ref = ?',
            ).get(input.operator_authorization_ref) as { request_id?: string } | undefined;
            if (consumed) {
                throw new Error(`forge_operator_authorization_already_consumed:${consumed.request_id}`);
            }
        }
        const decisionConflict = db.prepare(
            'SELECT request_id FROM hall_forge_requests WHERE bead_id = ? AND decision_id = ?',
        ).get(input.bead_id, input.decision_id) as { request_id?: string } | undefined;
        if (decisionConflict) {
            throw new Error(`forge_request_decision_conflict:${decisionConflict.request_id}`);
        }
        db.prepare(`
            INSERT INTO hall_forge_requests (
                request_id, repo_id, bead_id, decision_id,
                operator_authorization_ref, operator_thread_id, operator_turn_id,
                operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                request_sha256, request_summary_json, adapter_ref, write_capability,
                target_paths_sha256, live_source_allowed, max_attempts, status,
                active_attempt_id, authorized_at, expires_at, created_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)
        `).run(
            input.request_id,
            input.repo_id,
            input.bead_id,
            input.decision_id,
            input.operator_authorization_ref ?? null,
            input.operator_thread_id ?? null,
            input.operator_turn_id ?? null,
            input.operator_message_sha256 ?? null,
            input.operator_record_sha256 ?? null,
            input.operator_record_set_sha256 ?? null,
            input.operator_record_count ?? null,
            input.request_sha256,
            input.request_summary_json,
            input.adapter_ref ?? null,
            input.write_capability ?? null,
            input.target_paths_sha256,
            input.live_source_allowed ? 1 : 0,
            input.max_attempts,
            authorized ? 'AUTHORIZED' : 'PENDING_AUTH',
            input.authorized_at ?? null,
            input.expires_at ?? null,
            now,
            now,
        );
        return { request: getForgeRequest(db, input.request_id)!, replayed: false };
    });
    return save.immediate();
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
            return { attempt: mapForgeAttempt(existing), request, replayed: true };
        }
        const request = getForgeRequest(db, input.request_id);
        if (!request) throw new Error('forge_request_not_found');
        if (request.status !== 'AUTHORIZED') {
            throw new Error(`forge_request_not_authorized:${request.status}`);
        }
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
