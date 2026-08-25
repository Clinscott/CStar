import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    forgeAuthorizationLineageMatchesRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import {
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from '../../pennyone/intel/forge_authorization_policy.js';
import {
    readForgeSetSignalFromMutationIdentity,
    readPersistedForgeSetSignal,
} from './forge_set_manifest_signal.js';
import { resolveForgeOperatorWorkItem } from './forge_operator_work_item_resolution.js';
import type { VerifiedForgeOperatorIntent } from './forge_operator_intent_attestation.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import { stableJson } from './forge_request_contract.js';

export const FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX = 'cstar-forge-set-request:';

export interface VerifiedForgeSetRequestAuthority {
    intent: VerifiedForgeOperatorIntent;
    authority_manifest_sha256: string;
    original_identity: VerifiedCodexRequestIdentity;
    binding: string;
    operator_projection: ReturnType<typeof resolveForgeOperatorWorkItem>;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requestIdentityFields(request: HallForgeRequestRecord) {
    if (!request.requester_thread_id || !request.requester_turn_id
        || !request.requester_record_set_sha256) {
        throw new Error('forge_set_request_requester_lineage_missing');
    }
    return {
        thread_id: request.requester_thread_id,
        turn_id: request.requester_turn_id,
        record_set_sha256: request.requester_record_set_sha256,
    };
}

function assertSinglePendingRequest(
    db: Database.Database,
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    allowReplay: boolean,
): void {
    const rows = db.prepare(`
        SELECT request_id, status FROM hall_forge_requests
        WHERE requester_thread_id = ? AND requester_turn_id = ?
          AND requester_record_set_sha256 = ?
        ORDER BY request_id
    `).all(identity.thread_id, identity.turn_id, identity.turn_record_set_sha256) as Array<{
        request_id: string; status: string;
    }>;
    if (rows.length !== 1 || rows[0]?.request_id !== request.request_id) {
        throw new Error('forge_set_request_candidate_ambiguous');
    }
    const allowedStatuses = allowReplay
        ? new Set(['AUTHORIZED', 'SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS'])
        : new Set(['PENDING_AUTH']);
    if (!allowedStatuses.has(rows[0].status)) {
        throw new Error('forge_set_request_consumed');
    }
}

function authorityManifest(
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
): string {
    return sha256(stableJson({
        schema: 'cstar.forge_set_request_authority.v1',
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        bead_id: request.bead_id,
        decision_id: request.decision_id,
        target_paths_sha256: request.target_paths_sha256,
        root_thread_id: identity.thread_id,
        set_turn_id: identity.turn_id,
        set_record_sha256: identity.turn_record_sha256,
        set_record_set_sha256: identity.turn_record_set_sha256,
        set_record_count: identity.turn_record_count,
        max_attempts: request.max_attempts,
        live_source_allowed: request.live_source_allowed,
        authorization_profile: request.authorization_profile,
    }));
}

function buildIntent(
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    signal: { record_sha256: string; content: Array<{ type: 'input_text'; text: string }> },
    authorityManifestSha256: string,
): VerifiedForgeOperatorIntent {
    const authorizedAt = Date.parse(identity.turn_timestamp);
    if (!Number.isSafeInteger(authorizedAt)) {
        throw new Error('forge_set_request_authorization_time_invalid');
    }
    const expiresAt = authorizedAt + 24 * 60 * 60 * 1_000;
    const messageSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_request_message.v1',
        instruction: 'SET',
        authority_manifest_sha256: authorityManifestSha256,
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        record_sha256: signal.record_sha256,
        record_set_sha256: identity.turn_record_set_sha256,
        content: signal.content,
    }));
    const referenceSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_request_reference.v1',
        authority_manifest_sha256: authorityManifestSha256,
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        record_set_sha256: identity.turn_record_set_sha256,
    }));
    return {
        intent: 'forge_execute', action: 'implement', normalized_text: 'SET',
        work_reference_text: request.bead_id,
        operator_authorization_ref: `${FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX}${referenceSha256}`,
        thread_id: identity.thread_id, turn_id: identity.turn_id,
        message_sha256: messageSha256, session_record_sha256: signal.record_sha256,
        session_record_set_sha256: identity.turn_record_set_sha256,
        session_record_count: identity.turn_record_count, binding_mode: 'ordinary_language',
        authorized_at: authorizedAt, expires_at: expiresAt,
    };
}

function buildAuthority(
    db: Database.Database,
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    signal: { record_sha256: string; content: Array<{ type: 'input_text'; text: string }> },
): VerifiedForgeSetRequestAuthority {
    const authorityManifestSha256 = authorityManifest(request, identity);
    const intent = buildIntent(request, identity, signal, authorityManifestSha256);
    const operatorProjection = resolveForgeOperatorWorkItem(
        db, request, intent, { allowStoredSetManifest: true },
    );
    const binding = hashRootUserForgeIntentBinding({
        request, projection: operatorProjection,
        operator_thread_id: intent.thread_id,
        operator_turn_id: intent.turn_id,
        operator_message_sha256: intent.message_sha256,
        operator_record_sha256: intent.session_record_sha256,
        operator_record_set_sha256: intent.session_record_set_sha256,
        operator_record_count: intent.session_record_count,
    });
    return {
        intent, authority_manifest_sha256: authorityManifestSha256,
        original_identity: identity, binding, operator_projection: operatorProjection,
    };
}

export function verifyPendingForgeSetRequestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    caller: VerifiedCodexRequestIdentity;
    now?: number;
}): VerifiedForgeSetRequestAuthority {
    if (args.request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || args.request.status !== 'PENDING_AUTH' || args.request.max_attempts !== 1
        || args.request.live_source_allowed !== 0) {
        throw new Error('forge_set_request_policy_invalid');
    }
    const fields = requestIdentityFields(args.request);
    if (args.caller.thread_id !== fields.thread_id || args.caller.turn_id === fields.turn_id) {
        throw new Error('forge_set_request_later_turn_required');
    }
    let persisted;
    try {
        persisted = readForgeSetSignalFromMutationIdentity(fields, args.now);
    } catch (error) {
        if (error instanceof Error && error.message === 'forge_set_manifest_operator_signal_missing') {
            throw new Error('forge_set_request_set_signal_missing');
        }
        throw error;
    }
    assertSinglePendingRequest(args.db, args.request, persisted.identity, false);
    return buildAuthority(args.db, args.request, persisted.identity, persisted.signal);
}

export function verifyPersistedForgeSetRequestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    caller: { thread_id: string; turn_id: string };
    now?: number;
}): VerifiedForgeSetRequestAuthority {
    const authorization = args.authorization;
    if (authorization.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || !authorization.operator_authorization_ref.startsWith(FORGE_SET_REQUEST_AUTHORITY_REF_PREFIX)
        || args.request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || !forgeAuthorizationLineageMatchesRequest(args.request, authorization)
        || args.caller.thread_id !== authorization.operator_thread_id
        || args.caller.turn_id === authorization.operator_turn_id) {
        throw new Error('forge_set_request_persisted_authority_invalid');
    }
    const persisted = readPersistedForgeSetSignal({
        thread_id: authorization.operator_thread_id,
        turn_id: authorization.operator_turn_id,
        record_sha256: authorization.operator_record_sha256,
        record_set_sha256: authorization.operator_record_set_sha256,
        record_count: authorization.operator_record_count,
    }, args.now);
    assertSinglePendingRequest(args.db, args.request, persisted.identity, true);
    const built = buildAuthority(args.db, args.request, persisted.identity, persisted.signal);
    const projectionJson = forgeOperatorIntentProjectionJson(built.operator_projection);
    if (authorization.operator_authorization_ref !== built.intent.operator_authorization_ref
        || authorization.operator_message_sha256 !== built.intent.message_sha256
        || authorization.operator_record_sha256 !== built.intent.session_record_sha256
        || authorization.operator_record_set_sha256 !== built.intent.session_record_set_sha256
        || authorization.operator_record_count !== built.intent.session_record_count
        || authorization.authorization_binding_sha256 !== built.binding
        || authorization.operator_intent_json !== projectionJson
        || authorization.authorized_at !== built.intent.authorized_at
        || authorization.expires_at !== built.intent.expires_at) {
        throw new Error('forge_set_request_persisted_authority_invalid');
    }
    return built;
}
