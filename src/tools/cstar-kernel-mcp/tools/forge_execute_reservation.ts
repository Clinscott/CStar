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
}: {
    root: string;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    args: ForgeExecutionArgs;
    executionReceiptId: string;
    adapterRef: string;
    canonical: CanonicalForgeRequest;
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
    const racedAttempt = getForgeAttemptByIdempotency(db, currentRequest.request_id, idempotencyKey);
    if (racedAttempt) {
        return {
            kind: 'replay',
            db,
            current_request: currentRequest,
            current_authorization: currentAuthorization,
            attempt: racedAttempt,
        };
    }
    const reservation = reserveForgeAttempt(db, {
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
    });
    return {
        kind: 'reserved',
        db,
        current_request: reservation.request,
        current_authorization: currentAuthorization,
        attempt: reservation.attempt,
    };
}
