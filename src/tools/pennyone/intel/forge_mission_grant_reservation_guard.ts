import type Database from 'better-sqlite3';

import { AUTONOMOUS_DISPATCH_POLICY_PROFILE } from './forge_authorization_policy.js';
import { readPersistedForgeSetSignal } from
    '../../cstar-kernel-mcp/tools/forge_set_manifest_signal.js';
import { readCodexRootSessionSnapshot } from
    '../../cstar-kernel-mcp/tools/forge_autonomous_policy_signal.js';

export interface ForgeMissionGrantReservationSnapshot {
    schema: 'cstar.forge_mission_grant_reservation_snapshot.v1';
    mission_grant_id: string;
    request_id: string;
    root_thread_id: string;
    set_turn_id: string;
    set_record_set_sha256: string;
    root_session_record_set_sha256: string;
    root_session_record_count: number;
    root_session_file_bytes: number;
    verified_at: number;
}

export interface ForgeMissionGrantReservationGuard {
    expected: ForgeMissionGrantReservationSnapshot;
    revalidate: () => ForgeMissionGrantReservationSnapshot;
}

function snapshotIdentity(
    value: ForgeMissionGrantReservationSnapshot,
): Omit<ForgeMissionGrantReservationSnapshot, 'verified_at'> {
    const { verified_at: _verifiedAt, ...identity } = value;
    return identity;
}

export function revalidateForgeMissionGrantReservation(
    guard: ForgeMissionGrantReservationGuard,
): ForgeMissionGrantReservationSnapshot {
    const current = guard.revalidate();
    if (JSON.stringify(snapshotIdentity(current))
        !== JSON.stringify(snapshotIdentity(guard.expected))) {
        throw new Error('forge_mission_grant_root_session_drift_before_reservation');
    }
    return current;
}

export function persistForgeMissionGrantReservation(
    db: Database.Database,
    attemptId: string,
    snapshot: ForgeMissionGrantReservationSnapshot,
    createdAt: number,
): void {
    db.prepare(`
        INSERT INTO hall_forge_mission_grant_reservations (
            attempt_id, mission_grant_id, request_id, root_thread_id,
            set_turn_id, set_record_set_sha256,
            root_session_record_set_sha256, root_session_record_count,
            root_session_file_bytes, verified_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        attemptId, snapshot.mission_grant_id, snapshot.request_id,
        snapshot.root_thread_id, snapshot.set_turn_id,
        snapshot.set_record_set_sha256,
        snapshot.root_session_record_set_sha256,
        snapshot.root_session_record_count, snapshot.root_session_file_bytes,
        snapshot.verified_at, createdAt,
    );
}

export function assertForgeMissionGrantProviderEligibility(
    db: Database.Database,
    attemptId: string,
    now: number,
): void {
    if (db.prepare(`
        SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = 'hall_forge_mission_grants'
    `).pluck().get() !== 1) return;
    const row = db.prepare(`
        SELECT grant.mission_grant_id, grant.status, grant.revocation_state,
               grant.expires_at, grant.total_provider_attempt_ceiling,
               grant.paid_attempt_ceiling, grant.root_thread_id,
               grant.set_turn_id, grant.set_record_sha256,
               grant.set_record_set_sha256, grant.set_record_count,
               reservation.attempt_id AS reservation_attempt_id,
               authorization.authorization_profile,
               reservation.root_thread_id AS reservation_root_thread_id,
               reservation.set_turn_id AS reservation_set_turn_id,
               reservation.set_record_set_sha256 AS reservation_set_record_set_sha256,
               reservation.root_session_record_set_sha256,
               reservation.root_session_record_count,
               reservation.root_session_file_bytes
        FROM hall_forge_attempts AS attempt
        JOIN hall_forge_mission_grant_requests AS link
          ON link.request_id = attempt.request_id
        JOIN hall_forge_mission_grants AS grant
          ON grant.mission_grant_id = link.mission_grant_id
        JOIN hall_forge_authorizations AS authorization
          ON authorization.authorization_id = link.authorization_id
        LEFT JOIN hall_forge_mission_grant_reservations AS reservation
          ON reservation.attempt_id = attempt.attempt_id
         AND reservation.request_id = attempt.request_id
         AND reservation.mission_grant_id = grant.mission_grant_id
        WHERE attempt.attempt_id = ?
    `).get(attemptId) as Record<string, unknown> | undefined;
    if (!row) return;
    if (!row.reservation_attempt_id) {
        throw new Error('forge_mission_grant_reservation_fact_required');
    }
    if (row.root_thread_id !== row.reservation_root_thread_id
        || row.set_turn_id !== row.reservation_set_turn_id
        || row.set_record_set_sha256 !== row.reservation_set_record_set_sha256) {
        throw new Error('forge_mission_grant_provider_start_reservation_invalid');
    }
    if (row.status !== 'ACTIVE' || row.revocation_state !== 'ACTIVE'
        || Number(row.expires_at) <= now) {
        throw new Error('forge_mission_grant_provider_eligibility_revoked');
    }
    const refreshed = row.authorization_profile === AUTONOMOUS_DISPATCH_POLICY_PROFILE
        ? readCodexRootSessionSnapshot(String(row.root_thread_id))
        : readPersistedForgeSetSignal({
            thread_id: String(row.root_thread_id),
            turn_id: String(row.set_turn_id),
            record_sha256: String(row.set_record_sha256),
            record_set_sha256: String(row.set_record_set_sha256),
            record_count: Number(row.set_record_count),
        }, now).signal;
    if (refreshed.root_session_record_set_sha256
            !== row.root_session_record_set_sha256
        || refreshed.root_session_record_count
            !== Number(row.root_session_record_count)
        || refreshed.root_session_file_bytes
            !== Number(row.root_session_file_bytes)) {
        throw new Error('forge_mission_grant_root_session_drift_before_provider_start');
    }
    const attempts = Number((db.prepare(`
        SELECT COUNT(*)
        FROM hall_forge_attempts AS attempt
        JOIN hall_forge_mission_grant_requests AS link
          ON link.request_id = attempt.request_id
        WHERE link.mission_grant_id = ?
          AND attempt.attempt_budget_class <> 'mechanical_no_provider'
    `).pluck().get(row.mission_grant_id) as number | undefined) ?? 0);
    if (attempts > Number(row.total_provider_attempt_ceiling)
        || attempts > Number(row.paid_attempt_ceiling)) {
        throw new Error('forge_mission_grant_provider_capacity_exhausted');
    }
}

export function failCloseForgeMissionGrantProviderStart(
    db: Database.Database,
    attemptId: string,
    error: Error,
    now: number,
): void {
    if (!error.message.startsWith('forge_mission_grant_')
        && !error.message.startsWith('forge_set_manifest_')) return;
    const row = db.prepare(`
        SELECT grant.mission_grant_id, grant.expires_at
        FROM hall_forge_attempts AS attempt
        JOIN hall_forge_mission_grant_requests AS link
          ON link.request_id = attempt.request_id
        JOIN hall_forge_mission_grants AS grant
          ON grant.mission_grant_id = link.mission_grant_id
        WHERE attempt.attempt_id = ?
    `).get(attemptId) as Record<string, unknown> | undefined;
    if (!row) return;
    const revoked = error.message === 'forge_set_manifest_operator_signal_revoked';
    const exhausted = error.message === 'forge_mission_grant_provider_capacity_exhausted';
    const expired = Number(row.expires_at) <= now;
    const status = revoked ? 'REVOKED' : exhausted ? 'EXHAUSTED'
        : expired ? 'EXPIRED' : 'BLOCKED';
    db.prepare(`
        UPDATE hall_forge_mission_grants
        SET status = ?, revocation_state = CASE WHEN ? THEN 'REVOKED'
                ELSE revocation_state END,
            blocked_reason = CASE WHEN ? THEN blocked_reason ELSE ? END,
            revoked_at = CASE WHEN ? THEN COALESCE(revoked_at, ?) ELSE revoked_at END,
            revocation_reason = CASE WHEN ? THEN COALESCE(revocation_reason, ?)
                ELSE revocation_reason END,
            updated_at = ?
        WHERE mission_grant_id = ? AND status = 'ACTIVE'
    `).run(
        status, revoked ? 1 : 0, revoked ? 1 : 0, error.message,
        revoked ? 1 : 0, now, revoked ? 1 : 0, error.message,
        now, row.mission_grant_id,
    );
    db.prepare(`
        UPDATE hall_forge_requests
        SET status = 'REVOKED', completed_at = COALESCE(completed_at, ?),
            updated_at = ?
        WHERE request_id = (
            SELECT request_id FROM hall_forge_attempts WHERE attempt_id = ?
        ) AND status = 'AUTHORIZED'
    `).run(now, now, attemptId);
}
