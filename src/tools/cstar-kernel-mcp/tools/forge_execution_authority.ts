import type Database from 'better-sqlite3';

import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAuthorizationByRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    verifyCodexRequestIdentity,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';

export function forgeAuthorizationMatches(
    expected: HallForgeAuthorizationRecord,
    current: HallForgeAuthorizationRecord,
): boolean {
    return JSON.stringify(expected) === JSON.stringify(current);
}

export function forgeExecutionAuthorityMatches(
    expected: Awaited<ReturnType<typeof verifyForgeExecutionAuthorization>>,
    current: Awaited<ReturnType<typeof verifyForgeExecutionAuthorization>>,
): boolean {
    return forgeAuthorizationMatches(expected.authorization, current.authorization)
        && JSON.stringify(expected.executor) === JSON.stringify(current.executor);
}

export async function verifyForgeReplayAuthorization(
    db: Database.Database,
    request: HallForgeRequestRecord,
    suppliedAuthorizationRef: string | undefined,
    requestContext: McpRequestContext | undefined,
): Promise<{
    authorization: HallForgeAuthorizationRecord;
    caller: VerifiedCodexRequestIdentity;
}> {
    const caller = await verifyCodexRequestIdentity(requestContext);
    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!authorization) throw new Error('forge_replay_authorization_receipt_missing');
    if (
        !forgeAuthorizationLineageMatchesRequest(request, authorization)
        || suppliedAuthorizationRef?.trim() !== authorization.operator_authorization_ref
    ) {
        throw new Error('forge_replay_authorization_receipt_mismatch');
    }
    return { authorization, caller };
}

export async function verifyForgeExecutionAuthorization(
    db: Database.Database,
    request: HallForgeRequestRecord,
    suppliedAuthorizationRef: string | undefined,
    requestContext: McpRequestContext | undefined,
    now = Date.now(),
): Promise<{
    authorization: HallForgeAuthorizationRecord;
    executor: VerifiedCodexRequestIdentity;
}> {
    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!authorization) throw new Error('forge_exact_authorization_receipt_missing');
    if (
        request.status !== 'AUTHORIZED'
        || !forgeAuthorizationLineageMatchesRequest(request, authorization)
        || suppliedAuthorizationRef?.trim() !== authorization.operator_authorization_ref
    ) {
        throw new Error('forge_exact_authorization_receipt_mismatch');
    }
    const executor = await verifyCodexRequestIdentity(requestContext, now);
    if (
        executor.thread_id !== authorization.operator_thread_id
        || executor.turn_id !== authorization.operator_turn_id
        || executor.turn_record_sha256 !== authorization.operator_record_sha256
        || executor.turn_record_set_sha256 !== authorization.operator_record_set_sha256
        || executor.turn_record_count !== authorization.operator_record_count
    ) {
        throw new Error('forge_execute_requires_current_authorizing_turn');
    }
    if (authorization.expires_at <= now) {
        throw new Error('forge_exact_authorization_expired');
    }
    return { authorization, executor };
}
