import type Database from 'better-sqlite3';

import type {
    HallForgeAttemptRecord,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeAttemptByIdempotency,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../pennyone/intel/forge_receipt_controller.js';
import {
    getForgeMissionGrantByRequest,
    revokeForgeMissionGrant,
} from '../../pennyone/intel/forge_mission_grant_controller.js';
import type {
    ForgeMissionGrantReservationGuard,
    ForgeMissionGrantReservationSnapshot,
} from '../../pennyone/intel/forge_mission_grant_reservation_guard.js';
import { revalidateForgeMissionGrantReservation }
    from '../../pennyone/intel/forge_mission_grant_reservation_guard.js';
import { forgeAuthorizationMatches } from './forge_execution_authority.js';
import { AUTONOMOUS_DISPATCH_POLICY_PROFILE } from
    '../../pennyone/intel/forge_authorization_policy.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { forgeRequestAuthorityMatches } from './forge_execute_request_authority.js';
import { assertAutonomousDispatchPolicyGrantLineage } from './forge_autonomous_policy_contract.js';
import { readForgeAutonomousPolicySignal } from './forge_autonomous_policy_signal.js';
import {
    hashForgeRuntimeBinding,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import { readPersistedForgeSetSignal } from './forge_set_manifest_signal.js';

export type ForgeExecutionReservation = {
    db: Database.Database;
    current_request: HallForgeRequestRecord;
    current_authorization: HallForgeAuthorizationRecord;
} & ({
    kind: 'replay';
    attempt: HallForgeAttemptRecord;
} | {
    kind: 'reserved';
    attempt: HallForgeAttemptRecord;
});

function missionGrantReservationGuard(
    db: Database.Database,
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
): ForgeMissionGrantReservationGuard | null {
    const grant = getForgeMissionGrantByRequest(db, request.request_id);
    if (!grant) return null;
    if (authorization.operator_thread_id !== grant.root_thread_id
        || authorization.operator_turn_id !== grant.set_turn_id
        || authorization.operator_record_sha256 !== grant.set_record_sha256
        || authorization.operator_record_set_sha256 !== grant.set_record_set_sha256
        || authorization.operator_record_count !== grant.set_record_count) {
        throw new Error('forge_mission_grant_reservation_authority_invalid');
    }
    const snapshot = (): ForgeMissionGrantReservationSnapshot => {
        const verifiedAt = Date.now();
        let rootSession: {
            root_session_record_set_sha256: string;
            root_session_record_count: number;
            root_session_file_bytes: number;
        };
        if (authorization.authorization_profile === AUTONOMOUS_DISPATCH_POLICY_PROFILE) {
            const binding = assertAutonomousDispatchPolicyGrantLineage(db, grant, request);
            if (!binding) throw new Error('forge_autonomous_policy_grant_missing');
            const signal = readForgeAutonomousPolicySignal(binding, verifiedAt);
            if (grant.set_record_sha256 !== signal.record_sha256
                || grant.set_record_set_sha256 !== signal.record_set_sha256
                || grant.set_record_count !== signal.record_count
                || authorization.authorization_profile !== AUTONOMOUS_DISPATCH_POLICY_PROFILE
                || authorization.operator_thread_id !== signal.thread_id
                || authorization.operator_turn_id !== signal.turn_id
                || authorization.operator_record_sha256 !== signal.record_sha256
                || authorization.operator_record_set_sha256 !== signal.record_set_sha256
                || authorization.operator_record_count !== signal.record_count
                || authorization.authorized_at !== signal.authorized_at
                || authorization.expires_at !== signal.expires_at) {
                throw new Error('forge_autonomous_policy_persisted_authority_invalid');
            }
            rootSession = signal;
        } else {
            const persisted = readPersistedForgeSetSignal({
                thread_id: grant.root_thread_id,
                turn_id: grant.set_turn_id,
                record_sha256: grant.set_record_sha256,
                record_set_sha256: grant.set_record_set_sha256,
                record_count: grant.set_record_count,
            }, verifiedAt);
            rootSession = persisted.signal;
        }
        return {
            schema: 'cstar.forge_mission_grant_reservation_snapshot.v1',
            mission_grant_id: grant.mission_grant_id,
            request_id: request.request_id,
            root_thread_id: grant.root_thread_id,
            set_turn_id: grant.set_turn_id,
            set_record_set_sha256: grant.set_record_set_sha256,
            root_session_record_set_sha256: rootSession.root_session_record_set_sha256,
            root_session_record_count: rootSession.root_session_record_count,
            root_session_file_bytes: rootSession.root_session_file_bytes,
            verified_at: verifiedAt,
        };
    };
    try {
        return { expected: snapshot(), revalidate: snapshot };
    } catch (error) {
        if ((error as Error).message === 'forge_set_manifest_operator_signal_revoked'
            || (error as Error).message === 'forge_autonomous_policy_revoked') {
            revokeForgeMissionGrant(
                db, grant.mission_grant_id, (error as Error).message, Date.now(),
            );
        }
        throw error;
    }
}

/** Revalidate immutable Hall authority and atomically reserve before local
 * no-provider readiness gates. No adapter or provider process runs here. */
export function reserveVerifiedForgeExecution({
    root,
    request,
    authorization,
    args,
    executionReceiptId,
    adapterRef,
    canonical,
    beforeReservation,
}: {
    root: string;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    args: ForgeExecutionArgs;
    executionReceiptId: string;
    adapterRef: string;
    canonical: CanonicalForgeRequest;
    /** Deterministic adversarial-test seam; production callers omit it. */
    beforeReservation?: () => void;
}): ForgeExecutionReservation {
    const db = getForgeWritableDb(root);
    const currentRequest = getForgeRequest(db, request.request_id);
    if (!currentRequest || !forgeRequestAuthorityMatches(request, currentRequest)) {
        throw new Error('forge_request_authority_drift_before_reservation');
    }
    const currentAuthorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!currentAuthorization || !forgeAuthorizationMatches(authorization, currentAuthorization)) {
        throw new Error('forge_authorization_drift_before_reservation');
    }
    const missionGuard = missionGrantReservationGuard(
        db, currentRequest, currentAuthorization,
    );
    beforeReservation?.();
    const idempotencyKey = args.idempotency_key.trim();
    const racedAttempt = getForgeAttemptByIdempotency(db, currentRequest.request_id, idempotencyKey);
    if (racedAttempt) {
        try {
            if (missionGuard) revalidateForgeMissionGrantReservation(missionGuard);
        } catch (error) {
            if (missionGuard && [
                'forge_set_manifest_operator_signal_revoked',
                'forge_autonomous_policy_revoked',
            ].includes((error as Error).message)) {
                revokeForgeMissionGrant(
                    db, missionGuard.expected.mission_grant_id,
                    (error as Error).message, Date.now(),
                );
            }
            throw error;
        }
        return {
            kind: 'replay',
            db,
            current_request: currentRequest,
            current_authorization: currentAuthorization,
            attempt: racedAttempt,
        };
    }
    let reservation;
    try {
        reservation = reserveForgeAttempt(db, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: idempotencyKey,
            execution_receipt_id: executionReceiptId,
            adapter_ref: adapterRef,
            provider: 'minimax-oauth',
            requested_model: 'MiniMax-M3',
            model_source: 'unreported',
            reasoning_profile: 'forge-private',
            adapter_version: adapterRef,
            retry_of_attempt_id: args.retry_of_attempt_id?.trim() || undefined,
            continuation_runtime_sha256: args.retry_of_attempt_id?.trim()
                ? hashForgeRuntimeBinding(canonical) : undefined,
            mission_grant_reservation: missionGuard ?? undefined,
        });
    } catch (error) {
        if (missionGuard && [
            'forge_set_manifest_operator_signal_revoked',
            'forge_autonomous_policy_revoked',
        ].includes((error as Error).message)) {
            revokeForgeMissionGrant(
                db, missionGuard.expected.mission_grant_id,
                (error as Error).message, Date.now(),
            );
        }
        throw error;
    }
    return {
        kind: 'reserved',
        db,
        current_request: reservation.request,
        current_authorization: currentAuthorization,
        attempt: reservation.attempt,
    };
}
