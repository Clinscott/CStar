import type Database from 'better-sqlite3';

import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAuthorizationByRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { getPendingForgeContinuation } from '../../pennyone/intel/forge_continuation_controller.js';
import { getForgeMissionGrantByRequest }
    from '../../pennyone/intel/forge_mission_grant_controller.js';
import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    verifyCodexRequestIdentity,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';
import { verifyForgeContinuationCaller } from './forge_continuation_authority.js';
import {
    parseForgeStructuralCaller,
    verifyPersistedForgeMissionGrantAuthority,
    verifyPersistedForgeSetManifestAuthority,
    type ForgeStructuralCaller,
} from './forge_set_manifest_autonomous_authority.js';
import {
    FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX,
    verifyPersistedForgeSetRequestAuthority,
} from './forge_set_request_authority.js';
import {
    isForgeAutonomousPolicyCandidate,
    verifyPersistedForgeAutonomousPolicyAuthority,
} from './forge_autonomous_policy_authority.js';

type ForgeReplayAuthority =
    | { authorization: HallForgeAuthorizationRecord; caller: VerifiedCodexRequestIdentity; mode: 'full' }
    | { authorization: HallForgeAuthorizationRecord; caller: ForgeStructuralCaller;
        mode: 'autonomous_set_manifest_v1' | 'autonomous_dispatch_policy_v1' };

type ForgeExecutionCaller = VerifiedCodexRequestIdentity | ForgeStructuralCaller;

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
        && JSON.stringify(expected.executor) === JSON.stringify(current.executor)
        && expected.mode === current.mode
        && expected.continuation_fingerprint === current.continuation_fingerprint;
}

function isSetAuthorization(authorization: HallForgeAuthorizationRecord): boolean {
    return authorization.authorization_profile === 'root_user_forge_intent_v1'
        && (authorization.operator_authorization_ref.startsWith('cstar-forge-set-manifest:')
            || authorization.operator_authorization_ref.startsWith(
                FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX,
            ));
}

function verifyPersistedSetAuthority(
    db: Database.Database,
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
    caller: ForgeStructuralCaller,
): void {
    if (authorization.operator_authorization_ref.startsWith(FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX)) {
        verifyPersistedForgeSetRequestAuthority({ db, request, authorization, caller });
        return;
    }
    verifyPersistedForgeSetManifestAuthority({ db, request, authorization, caller });
}

export async function verifyForgeReplayAuthorization(
    db: Database.Database,
    request: HallForgeRequestRecord,
    suppliedAuthorizationRef: string | undefined,
    requestContext: McpRequestContext | undefined,
): Promise<ForgeReplayAuthority> {
    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!authorization) throw new Error('forge_replay_authorization_receipt_missing');
    if (
        !forgeAuthorizationLineageMatchesRequest(request, authorization)
        || suppliedAuthorizationRef?.trim() !== authorization.operator_authorization_ref
    ) {
        throw new Error('forge_replay_authorization_receipt_mismatch');
    }
    const structuralCaller = parseForgeStructuralCaller(requestContext);
    const missionGrant = getForgeMissionGrantByRequest(db, request.request_id);
    if (missionGrant) {
        if (isForgeAutonomousPolicyCandidate(db, request)) {
            verifyPersistedForgeAutonomousPolicyAuthority({
                db, request, authorization, grant: missionGrant, caller: structuralCaller,
            });
            return { authorization, caller: structuralCaller, mode: 'autonomous_dispatch_policy_v1' };
        }
        verifyPersistedForgeMissionGrantAuthority({
            db, request, authorization, caller: structuralCaller,
        });
        return { authorization, caller: structuralCaller, mode: 'autonomous_set_manifest_v1' };
    }
    const continuation = getPendingForgeContinuation(db, request.request_id);
    if (isSetAuthorization(authorization) && !continuation
        && structuralCaller.turn_id !== authorization.operator_turn_id) {
        verifyPersistedSetAuthority(db, request, authorization, structuralCaller);
        return { authorization, caller: structuralCaller, mode: 'autonomous_set_manifest_v1' };
    }
    const caller = await verifyCodexRequestIdentity(requestContext);
    return { authorization, caller, mode: 'full' };
}

export async function verifyForgeExecutionAuthorization(
    db: Database.Database,
    request: HallForgeRequestRecord,
    suppliedAuthorizationRef: string | undefined,
    requestContext: McpRequestContext | undefined,
    now = Date.now(),
): Promise<{
    authorization: HallForgeAuthorizationRecord;
    executor: ForgeExecutionCaller;
    mode: 'authorizing_turn' | 'autonomous_set_manifest_v1' | 'autonomous_dispatch_policy_v1'
        | 'pre_provider_continuation';
    continuation_fingerprint: string | null;
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
    if (authorization.expires_at <= now) throw new Error('forge_exact_authorization_expired');

    const structuralCaller = parseForgeStructuralCaller(requestContext);
    const continuation = getPendingForgeContinuation(db, request.request_id);
    const missionGrant = getForgeMissionGrantByRequest(db, request.request_id);
    if (missionGrant) {
        if (isForgeAutonomousPolicyCandidate(db, request)) {
            if (continuation) throw new Error('forge_autonomous_policy_continuation_forbidden');
            verifyPersistedForgeAutonomousPolicyAuthority({
                db, request, authorization, grant: missionGrant, caller: structuralCaller, now,
            });
            return {
                authorization,
                executor: structuralCaller,
                mode: 'autonomous_dispatch_policy_v1',
                continuation_fingerprint: null,
            };
        }
        verifyPersistedForgeMissionGrantAuthority({
            db, request, authorization, caller: structuralCaller, now,
        });
        if (!continuation) {
            return {
                authorization,
                executor: structuralCaller,
                mode: 'autonomous_set_manifest_v1',
                continuation_fingerprint: null,
            };
        }
    }
    if (isSetAuthorization(authorization) && !continuation
        && structuralCaller.turn_id !== authorization.operator_turn_id) {
        if (authorization.operator_authorization_ref.startsWith(FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX)) {
            verifyPersistedForgeSetRequestAuthority({ db, request, authorization, caller: structuralCaller, now });
        } else {
            verifyPersistedForgeSetManifestAuthority({
                db, request, authorization, caller: structuralCaller, now,
            });
        }
        return {
            authorization,
            executor: structuralCaller,
            mode: 'autonomous_set_manifest_v1',
            continuation_fingerprint: null,
        };
    }

    // Ordinary authorizing turns and every pre-provider continuation require a
    // complete current root-user turn, including its immutable record hashes.
    const executor = await verifyCodexRequestIdentity(requestContext, now);
    const exactAuthorizingTurn = executor.thread_id === authorization.operator_thread_id
        && executor.turn_id === authorization.operator_turn_id
        && executor.turn_record_sha256 === authorization.operator_record_sha256
        && executor.turn_record_set_sha256 === authorization.operator_record_set_sha256
        && executor.turn_record_count === authorization.operator_record_count;
    if (continuation) {
        verifyForgeContinuationCaller({ authorization, continuation, caller: executor, now });
        return {
            authorization, executor, mode: 'pre_provider_continuation',
            continuation_fingerprint: continuation.failure_fingerprint_sha256,
        };
    }
    if (exactAuthorizingTurn) {
        return { authorization, executor, mode: 'authorizing_turn', continuation_fingerprint: null };
    }
    throw new Error('forge_execute_requires_current_authorizing_turn');
}
