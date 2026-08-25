import type Database from 'better-sqlite3';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { handleForgeAuthorize } from './forge_authorize.js';
import { verifyCurrentForgeOperatorIntent } from './forge_operator_intent_attestation.js';

interface AutoAuthorizationResult {
    attempted: boolean;
    authorized: boolean;
}

const EXPECTED_PENDING_AUTHORIZATION_ERRORS = new Set([
    'forge_operator_authorization_required',
    'forge_operator_turn_already_consumed',
]);

function responseErrorCode(response: { content: Array<{ type: 'text'; text: string }> }): string {
    try {
        const payload = JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
        return typeof payload.error_code === 'string' ? payload.error_code : 'forge_operator_authorization_required';
    } catch {
        return 'forge_operator_authorization_required';
    }
}

/**
 * The default request surface owns the compatibility-first request/authorize
 * transition. It still delegates to the canonical authorizer, so exact root
 * intent, replay, lineage, and runtime checks remain one implementation.
 * Verified ordinary-language mission intent is the normal operator path;
 * missing current intent is deliberately a pending request, not a failure or
 * an implicit grant.
 */
export async function autoAuthorizePendingForgeRequest(
    db: Database.Database,
    requestId: string,
    requestSha256: string,
    requestContext: McpRequestContext | undefined,
): Promise<AutoAuthorizationResult> {
    const request = getForgeRequest(db, requestId);
    if (!request) return { attempted: false, authorized: false };
    let intent: Awaited<ReturnType<typeof verifyCurrentForgeOperatorIntent>>;
    try {
        intent = await verifyCurrentForgeOperatorIntent(requestContext, Date.now(), {
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            bead_id: request.bead_id,
            decision_id: request.decision_id,
        });
    } catch {
        // Ordinary v1 language remains available through explicit compatibility
        // discovery. The default request surface auto-binds only strict v2
        // receipt/mission directives, and otherwise keeps the request pending.
        return { attempted: false, authorized: false };
    }
    const response = await handleForgeAuthorize({
        forge_request_receipt_id: requestId,
        request_sha256: requestSha256,
    }, requestContext);
    const currentRequest = getForgeRequest(db, requestId);
    const authorization = getForgeAuthorizationByRequest(db, requestId);
    if (currentRequest?.status === 'AUTHORIZED' && authorization) {
        return { attempted: true, authorized: true };
    }
    const errorCode = responseErrorCode(response);
    if (response.isError && !EXPECTED_PENDING_AUTHORIZATION_ERRORS.has(errorCode)) {
        throw new Error(`forge_request_auto_authorization_failed:${errorCode}`);
    }
    return { attempted: true, authorized: false };
}
