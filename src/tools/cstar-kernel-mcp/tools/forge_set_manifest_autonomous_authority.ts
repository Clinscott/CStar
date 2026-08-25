import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import {
    forgeAuthorizationLineageMatchesRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import {
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from '../../pennyone/intel/forge_authorization_policy.js';
import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    readForgeSetSignalFromMutationIdentity,
    readPersistedForgeSetSignal,
    type ForgeSetMutationIdentityFields,
    type PersistedForgeSetAuthorityFields,
} from './forge_set_manifest_signal.js';
import { resolveForgeSetManifestAuthorityProjection } from './forge_set_manifest_authority.js';
import { resolveForgeOperatorWorkItem } from './forge_operator_work_item_resolution.js';
import type { VerifiedForgeOperatorIntent } from './forge_operator_intent_attestation.js';
import {
    parseCodexTurnMetadata,
    type ParsedCodexTurnMetadata,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { stableJson } from './forge_request_contract.js';

export const FORGE_SET_AUTONOMOUS_AUTHORITY_MODE = 'autonomous_set_manifest_v1' as const;

export interface ForgeStructuralCaller extends ParsedCodexTurnMetadata {
    kind: 'same_root_structural';
}

export type ForgeCaller = VerifiedCodexRequestIdentity | ForgeStructuralCaller;

export function parseForgeStructuralCaller(
    context: McpRequestContext | undefined,
): ForgeStructuralCaller {
    return { ...parseCodexTurnMetadata(context), kind: 'same_root_structural' };
}

export interface VerifiedPersistedForgeSetManifestAuthority {
    intent: VerifiedForgeOperatorIntent;
    authority_manifest_sha256: string;
    original_identity: VerifiedCodexRequestIdentity;
    binding: string;
    operator_projection: ReturnType<typeof resolveForgeOperatorWorkItem>;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function failIfDifferent(actual: unknown, expected: unknown, code: string): void {
    if (actual !== expected) throw new Error(code);
}

function requestReplayStatus(status: HallForgeRequestRecord['status']): boolean {
    return [
        'PENDING_AUTH', 'AUTHORIZED', 'SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS',
    ].includes(status);
}

function buildSetIntent(
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    signal: { record_sha256: string; content: Array<{ type: 'input_text'; text: string }> },
    authorityManifestSha256: string,
): VerifiedForgeOperatorIntent {
    const authorizedAt = Date.parse(identity.turn_timestamp);
    const expiresAt = authorizedAt + 24 * 60 * 60 * 1_000;
    const messageSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_manifest_message.v1', instruction: 'SET',
        authority_manifest_sha256: authorityManifestSha256,
        thread_id: identity.thread_id, turn_id: identity.turn_id,
        record_sha256: signal.record_sha256,
        record_set_sha256: identity.turn_record_set_sha256, content: signal.content,
    }));
    const referenceSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_manifest_reference.v1',
        authority_manifest_sha256: authorityManifestSha256,
        request_id: request.request_id, request_sha256: request.request_sha256,
        thread_id: identity.thread_id, turn_id: identity.turn_id,
        record_set_sha256: identity.turn_record_set_sha256,
    }));
    return {
        intent: 'forge_execute', action: 'implement', normalized_text: 'SET',
        work_reference_text: request.bead_id,
        operator_authorization_ref: `cstar-forge-set-manifest:${referenceSha256}`,
        thread_id: identity.thread_id, turn_id: identity.turn_id,
        message_sha256: messageSha256, session_record_sha256: signal.record_sha256,
        session_record_set_sha256: identity.turn_record_set_sha256,
        session_record_count: identity.turn_record_count, binding_mode: 'ordinary_language',
        authorized_at: authorizedAt, expires_at: expiresAt,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mutationIdentity(value: unknown, code: string): ForgeSetMutationIdentityFields {
    if (!isRecord(value) || value.source !== 'codex_request_meta'
        || typeof value.thread_id !== 'string' || typeof value.turn_id !== 'string'
        || typeof value.turn_record_set_sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.turn_record_set_sha256)) {
        throw new Error(code);
    }
    return {
        thread_id: value.thread_id,
        turn_id: value.turn_id,
        record_set_sha256: value.turn_record_set_sha256,
    };
}

function pendingMutationIdentity(
    db: Database.Database,
    request: HallForgeRequestRecord,
): ForgeSetMutationIdentityFields {
    const child = db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ? LIMIT 1',
    ).get(request.bead_id) as { metadata_json?: unknown } | undefined;
    if (typeof child?.metadata_json !== 'string') {
        throw new Error('forge_set_manifest_child_metadata_invalid');
    }
    let childMetadata: Record<string, unknown>;
    try { childMetadata = JSON.parse(child.metadata_json) as Record<string, unknown>; } catch {
        throw new Error('forge_set_manifest_child_metadata_invalid');
    }
    const parentBeadId = childMetadata.parent_bead_id;
    if (typeof parentBeadId !== 'string') {
        throw new Error('forge_set_manifest_parent_reference_invalid');
    }
    const parent = db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ? LIMIT 1',
    ).get(parentBeadId) as { metadata_json?: unknown } | undefined;
    if (typeof parent?.metadata_json !== 'string') {
        throw new Error('forge_set_manifest_parent_metadata_invalid');
    }
    let parentMetadata: Record<string, unknown>;
    try { parentMetadata = JSON.parse(parent.metadata_json) as Record<string, unknown>; } catch {
        throw new Error('forge_set_manifest_parent_metadata_invalid');
    }
    const childIdentity = mutationIdentity(
        childMetadata.mutation_request_identity, 'forge_set_manifest_child_identity_invalid',
    );
    const parentIdentity = mutationIdentity(
        parentMetadata.mutation_request_identity, 'forge_set_manifest_parent_identity_invalid',
    );
    if (JSON.stringify(childIdentity) !== JSON.stringify(parentIdentity)) {
        throw new Error('forge_set_manifest_mutation_identity_mismatch');
    }
    return childIdentity;
}

function verifyStoredRequestFields(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
    now: number,
): void {
    if (authorization.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || !authorization.operator_authorization_ref.startsWith('cstar-forge-set-manifest:')
        || !forgeAuthorizationLineageMatchesRequest(request, authorization)
        || authorization.request_sha256 !== request.request_sha256
        || request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || !requestReplayStatus(request.status) || request.status === 'PENDING_AUTH'
        || authorization.expires_at <= now || request.expires_at !== authorization.expires_at
        || request.operator_authorization_ref !== authorization.operator_authorization_ref
        || request.operator_thread_id !== authorization.operator_thread_id
        || request.operator_turn_id !== authorization.operator_turn_id
        || request.operator_message_sha256 !== authorization.operator_message_sha256
        || request.operator_record_sha256 !== authorization.operator_record_sha256
        || request.operator_record_set_sha256 !== authorization.operator_record_set_sha256
        || request.operator_record_count !== authorization.operator_record_count) {
        throw new Error('forge_set_manifest_persisted_authority_invalid');
    }
}

function buildSetAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: VerifiedCodexRequestIdentity;
    signal: { record_sha256: string; content: Array<{ type: 'input_text'; text: string }> };
    allowReplay: boolean;
}): VerifiedPersistedForgeSetManifestAuthority & {
    binding: string;
    operator_projection: ReturnType<typeof resolveForgeOperatorWorkItem>;
} {
    const projection = resolveForgeSetManifestAuthorityProjection(
        args.db, args.request, args.identity, args.allowReplay,
    );
    const authorityManifestSha256 = sha256(stableJson(projection));
    const intent = buildSetIntent(
        args.request, args.identity, args.signal, authorityManifestSha256,
    );
    const operatorProjection = resolveForgeOperatorWorkItem(args.db, args.request, intent);
    const binding = hashRootUserForgeIntentBinding({
        request: args.request, projection: operatorProjection,
        operator_thread_id: intent.thread_id, operator_turn_id: intent.turn_id,
        operator_message_sha256: intent.message_sha256,
        operator_record_sha256: intent.session_record_sha256,
        operator_record_set_sha256: intent.session_record_set_sha256,
        operator_record_count: intent.session_record_count,
    });
    return {
        intent, authority_manifest_sha256: authorityManifestSha256,
        original_identity: args.identity, binding, operator_projection: operatorProjection,
    };
}

export function verifyPendingForgeSetManifestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    caller: ForgeCaller;
    now?: number;
}): VerifiedPersistedForgeSetManifestAuthority {
    const now = args.now ?? Date.now();
    const fields = pendingMutationIdentity(args.db, args.request);
    const persisted = readForgeSetSignalFromMutationIdentity(fields, now);
    if (args.caller.thread_id !== persisted.identity.thread_id) {
        throw new Error('forge_set_manifest_autonomous_caller_thread_mismatch');
    }
    return buildSetAuthority({
        db: args.db, request: args.request, identity: persisted.identity,
        signal: persisted.signal, allowReplay: false,
    });
}

export function verifyPersistedForgeSetManifestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    caller: ForgeCaller;
    now?: number;
}): VerifiedPersistedForgeSetManifestAuthority {
    const now = args.now ?? Date.now();
    verifyStoredRequestFields(args.request, args.authorization, now);
    if (args.caller.thread_id !== args.authorization.operator_thread_id) {
        throw new Error('forge_set_manifest_autonomous_caller_thread_mismatch');
    }
    const stored: PersistedForgeSetAuthorityFields = {
        thread_id: args.authorization.operator_thread_id,
        turn_id: args.authorization.operator_turn_id,
        record_sha256: args.authorization.operator_record_sha256,
        record_set_sha256: args.authorization.operator_record_set_sha256,
        record_count: args.authorization.operator_record_count,
    };
    const persisted = readPersistedForgeSetSignal(stored, now);
    if (args.caller.turn_id === persisted.identity.turn_id
        && 'turn_record_sha256' in args.caller
        && args.caller.turn_record_sha256 === persisted.identity.turn_record_sha256
        && args.caller.turn_record_set_sha256 === persisted.identity.turn_record_set_sha256) {
        throw new Error('forge_set_manifest_autonomous_later_turn_required');
    }
    const built = buildSetAuthority({
        db: args.db, request: args.request, identity: persisted.identity,
        signal: persisted.signal, allowReplay: true,
    });
    failIfDifferent(args.authorization.operator_authorization_ref,
        built.intent.operator_authorization_ref, 'forge_set_manifest_persisted_reference_drift');
    failIfDifferent(args.authorization.operator_message_sha256,
        built.intent.message_sha256, 'forge_set_manifest_persisted_message_drift');
    failIfDifferent(args.authorization.operator_record_sha256,
        built.intent.session_record_sha256, 'forge_set_manifest_persisted_record_drift');
    failIfDifferent(args.authorization.operator_record_set_sha256,
        built.intent.session_record_set_sha256, 'forge_set_manifest_persisted_record_set_drift');
    failIfDifferent(args.authorization.operator_record_count,
        built.intent.session_record_count, 'forge_set_manifest_persisted_record_count_drift');
    failIfDifferent(args.authorization.operator_intent_json,
        forgeOperatorIntentProjectionJson(built.operator_projection),
        'forge_set_manifest_persisted_intent_drift');
    failIfDifferent(args.authorization.authorization_binding_sha256,
        built.binding, 'forge_set_manifest_persisted_binding_drift');
    failIfDifferent(args.authorization.authorized_at,
        built.intent.authorized_at, 'forge_set_manifest_persisted_time_drift');
    failIfDifferent(args.authorization.expires_at,
        built.intent.expires_at, 'forge_set_manifest_persisted_time_drift');
    return {
        intent: built.intent,
        authority_manifest_sha256: built.authority_manifest_sha256,
        original_identity: built.original_identity,
        binding: built.binding,
        operator_projection: built.operator_projection,
    };
}
