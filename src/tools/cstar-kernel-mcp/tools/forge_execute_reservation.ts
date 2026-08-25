import type Database from 'better-sqlite3';

import type {
    HallForgeAttemptRecord,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { forgeAuthorizationMatches } from './forge_execution_authority.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { forgeRequestAuthorityMatches } from './forge_execute_request_authority.js';
import {
    hashForgeRuntimeBinding,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';

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

export type ForgeReservationMode = 'legacy-hermes' | 'codex-host';

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
    mode = 'legacy-hermes',
}: {
    root: string;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    args: ForgeExecutionArgs;
    executionReceiptId: string;
    adapterRef: string;
    canonical: CanonicalForgeRequest;
    mode?: ForgeReservationMode;
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
    const idempotencyKey = args.idempotency_key.trim();
    const hostOwned = mode === 'codex-host';
    const reservation = reserveForgeAttempt(db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: idempotencyKey,
        execution_receipt_id: executionReceiptId,
        adapter_ref: adapterRef,
        provider: hostOwned ? 'codex-host' : 'minimax-oauth',
        requested_model: hostOwned ? 'gpt-5.6-luna' : 'MiniMax-M3',
        model_source: 'unreported',
        reasoning_profile: hostOwned ? 'max' : 'forge-private',
        adapter_version: hostOwned
            ? 'cstar.codex_host_worker_job.v2'
            : adapterRef,
        retry_of_attempt_id: args.retry_of_attempt_id?.trim() || undefined,
        continuation_runtime_sha256: args.retry_of_attempt_id?.trim()
            ? hashForgeRuntimeBinding(canonical) : undefined,
    });
    return {
        kind: reservation.replayed ? 'replay' : 'reserved',
        db,
        current_request: reservation.request,
        current_authorization: currentAuthorization,
        attempt: reservation.attempt,
    };
}
