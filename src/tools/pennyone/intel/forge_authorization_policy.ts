import { createHash } from 'node:crypto';

import type {
    AuthorizeForgeRequestInput,
    HallForgeAuthorizationProfile,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
import { forgeRequesterLineageMatchesRequest } from './forge_requester_lineage.js';
import {
    hashForgeGoalResumeAuthorizationBinding,
    isForgeGoalResumeProjectionJson,
    parseForgeGoalResumeAuthorizationProjection,
} from './forge_goal_resume_authorization_policy.js';

export const ROOT_USER_FORGE_INTENT_PROFILE = 'root_user_forge_intent_v1' as const;
export const LEGACY_EXACT_FORGE_CHALLENGE_PROFILE = 'exact_request_challenge_v1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const BOUNDED_REFERENCE = /^[^\u0000-\u001f\u007f]{1,240}$/u;
const ACTIONS = new Set<ForgeOperatorIntentAction>([
    'build',
    'implement',
    'repair',
    'fix',
    'route_to_forge',
]);
const SUBJECT_KINDS = new Set<ForgeOperatorIntentSubjectKind>([
    'bead',
    'decision',
    'target_ref',
]);

export type ForgeOperatorIntentAction =
    | 'build'
    | 'implement'
    | 'repair'
    | 'fix'
    | 'route_to_forge';

export type ForgeOperatorIntentSubjectKind = 'bead' | 'decision' | 'target_ref';
export type ForgeOperatorIntentLineageMode =
    | 'same_turn_request'
    | 'explicit_legacy_request_upgrade'
    | 'explicit_request_receipt_binding'
    | 'explicit_mission_record_binding';

export interface ForgeOperatorIntentProjection {
    schema: 'cstar.forge_operator_intent_projection.v1';
    action: ForgeOperatorIntentAction;
    requester_lineage_mode: ForgeOperatorIntentLineageMode;
    subject: {
        kind: ForgeOperatorIntentSubjectKind;
        value: string;
        repo_id: string;
    };
}

export interface RootUserForgeIntentBindingInput {
    request: Pick<HallForgeRequestRecord,
        | 'request_id' | 'request_sha256' | 'repo_id' | 'bead_id' | 'decision_id'
        | 'requester_thread_id' | 'requester_turn_id' | 'requester_record_set_sha256'>;
    projection: ForgeOperatorIntentProjection;
    compatibility_manifest_sha256?: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
}

export interface ForgeRequestAuthorizationExtension {
    profile?: HallForgeAuthorizationProfile;
    binding?: string;
    challenge?: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function boundedReference(value: unknown, name: string): string {
    if (typeof value !== 'string' || !BOUNDED_REFERENCE.test(value) || value !== value.trim()) {
        throw new Error(`forge_operator_intent_${name}_invalid`);
    }
    return value;
}

function requiredHash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`forge_authorization_${name}_invalid`);
    }
    return value;
}

export function isForgeAuthorizationProfile(
    value: unknown,
): value is HallForgeAuthorizationProfile {
    return value === ROOT_USER_FORGE_INTENT_PROFILE
        || value === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE;
}

export function buildForgeOperatorIntentProjection(input: {
    action: ForgeOperatorIntentAction;
    requester_lineage_mode: ForgeOperatorIntentLineageMode;
    kind: ForgeOperatorIntentSubjectKind;
    value: string;
    repo_id: string;
}): ForgeOperatorIntentProjection {
    if (!ACTIONS.has(input.action)) throw new Error('forge_operator_intent_action_invalid');
    if (!SUBJECT_KINDS.has(input.kind)) throw new Error('forge_operator_intent_subject_kind_invalid');
    if (![
        'same_turn_request',
        'explicit_legacy_request_upgrade',
        'explicit_request_receipt_binding',
        'explicit_mission_record_binding',
    ]
        .includes(input.requester_lineage_mode)) {
        throw new Error('forge_operator_intent_requester_lineage_mode_invalid');
    }
    return {
        schema: 'cstar.forge_operator_intent_projection.v1',
        action: input.action,
        requester_lineage_mode: input.requester_lineage_mode,
        subject: {
            kind: input.kind,
            value: boundedReference(input.value, 'subject_value'),
            repo_id: boundedReference(input.repo_id, 'subject_repo_id'),
        },
    };
}

export function forgeOperatorIntentProjectionJson(
    projection: ForgeOperatorIntentProjection,
): string {
    return JSON.stringify(buildForgeOperatorIntentProjection({
        action: projection.action,
        requester_lineage_mode: projection.requester_lineage_mode,
        kind: projection.subject.kind,
        value: projection.subject.value,
        repo_id: projection.subject.repo_id,
    }));
}

export function forgeOperatorIntentProjectionMatchesRequest(
    request: Pick<HallForgeRequestRecord, 'repo_id' | 'bead_id' | 'decision_id'>,
    projection: ForgeOperatorIntentProjection,
    targetRef: string | undefined,
): boolean {
    if (projection.subject.repo_id !== request.repo_id) return false;
    if (projection.subject.kind === 'bead') {
        return projection.subject.value === request.bead_id;
    }
    if (projection.subject.kind === 'decision') {
        return projection.subject.value === request.decision_id;
    }
    return targetRef !== undefined && projection.subject.value === targetRef;
}

export function parseForgeOperatorIntentProjection(
    value: string | undefined,
): ForgeOperatorIntentProjection {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value ?? '');
    } catch {
        throw new Error('forge_operator_intent_projection_invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('forge_operator_intent_projection_invalid');
    }
    const record = parsed as Record<string, unknown>;
    const subject = record.subject;
    if (
        !exactKeys(record, ['schema', 'action', 'requester_lineage_mode', 'subject'])
        || record.schema !== 'cstar.forge_operator_intent_projection.v1'
        || !subject || typeof subject !== 'object' || Array.isArray(subject)
        || !exactKeys(subject as Record<string, unknown>, ['kind', 'value', 'repo_id'])
    ) {
        throw new Error('forge_operator_intent_projection_invalid');
    }
    const projection = buildForgeOperatorIntentProjection({
        action: record.action as ForgeOperatorIntentAction,
        requester_lineage_mode: record.requester_lineage_mode as ForgeOperatorIntentLineageMode,
        kind: (subject as Record<string, unknown>).kind as ForgeOperatorIntentSubjectKind,
        value: String((subject as Record<string, unknown>).value ?? ''),
        repo_id: String((subject as Record<string, unknown>).repo_id ?? ''),
    });
    if (forgeOperatorIntentProjectionJson(projection) !== value) {
        throw new Error('forge_operator_intent_projection_not_canonical');
    }
    return projection;
}

export function hashRootUserForgeIntentBinding(
    input: RootUserForgeIntentBindingInput,
): string {
    if (input.projection.subject.repo_id !== input.request.repo_id) {
        throw new Error('forge_operator_intent_repository_mismatch');
    }
    if (!Number.isSafeInteger(input.operator_record_count)
        || input.operator_record_count < 1
        || (![
            'explicit_request_receipt_binding',
            'explicit_mission_record_binding',
        ].includes(input.projection.requester_lineage_mode)
            && input.operator_record_count !== 1)) {
        throw new Error('forge_operator_intent_record_count_invalid');
    }
    for (const [name, value] of [
        ['request_sha256', input.request.request_sha256],
        ['operator_message_sha256', input.operator_message_sha256],
        ['operator_record_sha256', input.operator_record_sha256],
        ['operator_record_set_sha256', input.operator_record_set_sha256],
    ] as const) requiredHash(value, name);
    if (input.compatibility_manifest_sha256 !== undefined) {
        requiredHash(input.compatibility_manifest_sha256, 'compatibility_manifest_sha256');
    }
    return sha256(JSON.stringify({
        schema: 'cstar.forge_root_user_intent_binding.v2',
        profile: ROOT_USER_FORGE_INTENT_PROFILE,
        intent: 'forge_execute',
        projection: JSON.parse(forgeOperatorIntentProjectionJson(input.projection)),
        request_id: boundedReference(input.request.request_id, 'request_id'),
        request_sha256: input.request.request_sha256,
        bead_id: boundedReference(input.request.bead_id, 'bead_id'),
        decision_id: boundedReference(input.request.decision_id, 'decision_id'),
        requester_thread_id: input.request.requester_thread_id ?? null,
        requester_turn_id: input.request.requester_turn_id ?? null,
        requester_record_set_sha256: input.request.requester_record_set_sha256 ?? null,
        compatibility_manifest_sha256: input.compatibility_manifest_sha256 ?? null,
        operator_thread_id: boundedReference(input.operator_thread_id, 'thread_id'),
        operator_turn_id: boundedReference(input.operator_turn_id, 'turn_id'),
        operator_record_set_sha256: input.operator_record_set_sha256,
        operator_record_sha256: input.operator_record_sha256,
        operator_record_count: input.operator_record_count,
        operator_message_sha256: input.operator_message_sha256,
    }));
}

export function validateLegacyExactAuthorizationBinding(
    bindingSha256: string | undefined,
    challengeSha256: string | undefined,
): string {
    const challenge = requiredHash(challengeSha256, 'challenge_sha256');
    if (bindingSha256 !== undefined && bindingSha256 !== challenge) {
        throw new Error('forge_authorization_exact_binding_mismatch');
    }
    return challenge;
}

export function forgeRequestContentMatches(
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
): boolean {
    const immutable = existing.request_id === input.request_id
        && existing.repo_id === input.repo_id
        && existing.bead_id === input.bead_id
        && existing.decision_id === input.decision_id
        && existing.request_sha256 === input.request_sha256
        && existing.request_summary_json === input.request_summary_json
        && existing.target_paths_sha256 === input.target_paths_sha256
        && existing.adapter_ref === input.adapter_ref
        && existing.write_capability === input.write_capability
        && existing.live_source_allowed === (input.live_source_allowed ? 1 : 0)
        && existing.max_attempts === input.max_attempts;
    const requester = existing.requester_thread_id === input.requester_thread_id
        && existing.requester_turn_id === input.requester_turn_id
        && existing.requester_record_set_sha256 === input.requester_record_set_sha256;
    const authorityAlreadyBound = existing.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        && existing.authorization_binding_sha256 !== undefined;
    return immutable && (existing.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        || authorityAlreadyBound || requester);
}

export function normalizeForgeRequestAuthorizationExtension(
    input: SaveForgeRequestInput,
): ForgeRequestAuthorizationExtension {
    const fields = [input.authorization_profile, input.authorization_binding_sha256,
        input.authorization_challenge_sha256];
    if (fields.every((value) => value === undefined)) return {};
    if (!isForgeAuthorizationProfile(input.authorization_profile)) {
        throw new Error('forge_request_authorization_profile_invalid');
    }
    if (input.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE) {
        const binding = validateLegacyExactAuthorizationBinding(
            input.authorization_binding_sha256,
            input.authorization_challenge_sha256,
        );
        return { profile: input.authorization_profile, binding, challenge: binding };
    }
    if (input.authorization_binding_sha256 !== undefined
        || input.authorization_challenge_sha256 !== undefined) {
        throw new Error('forge_request_natural_authorization_must_begin_unbound');
    }
    return { profile: ROOT_USER_FORGE_INTENT_PROFILE };
}

export function forgeRequestAuthorizationMatches(
    request: HallForgeRequestRecord,
    input: AuthorizeForgeRequestInput,
): boolean {
    return request.request_sha256 === input.request_sha256
        && request.authorization_profile === input.authorization_profile
        && request.authorization_binding_sha256 === input.authorization_binding_sha256
        && request.authorization_challenge_sha256 === input.challenge_sha256
        && request.operator_authorization_ref === input.operator_authorization_ref
        && request.operator_thread_id === input.operator_thread_id
        && request.operator_turn_id === input.operator_turn_id
        && request.operator_message_sha256 === input.operator_message_sha256
        && request.operator_record_sha256 === input.operator_record_sha256
        && request.operator_record_set_sha256 === input.operator_record_set_sha256
        && request.operator_record_count === input.operator_record_count
        && request.authorized_at === input.authorized_at
        && request.expires_at === input.expires_at;
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function validateForgeExecutionGrant(
    input: AuthorizeForgeRequestInput,
): Record<string, unknown> | null {
    const fields = [input.execution_grant_schema, input.execution_grant_sha256,
        input.execution_grant_json];
    const present = fields.filter((value) => value !== undefined).length;
    if (present === 0) return null;
    if (present !== fields.length
        || input.execution_grant_schema !== 'cstar.forge_legacy_v2_execution_grant.v1'
        || !SHA256.test(input.execution_grant_sha256 ?? '')) {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    let grant: unknown;
    try {
        grant = JSON.parse(input.execution_grant_json!);
    } catch {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)
        || JSON.stringify(stableValue(grant)) !== input.execution_grant_json
        || sha256(input.execution_grant_json!) !== input.execution_grant_sha256) {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    const record = grant as Record<string, unknown>;
    if (record.schema !== input.execution_grant_schema
        || record.legacy_request_id !== input.request_id
        || record.legacy_request_sha256 !== input.request_sha256) {
        throw new Error('forge_authorization_execution_grant_binding_invalid');
    }
    return record;
}

export function forgeAuthorizationRecordMatches(
    authorization: HallForgeAuthorizationRecord,
    input: AuthorizeForgeRequestInput,
): boolean {
    return authorization.request_id === input.request_id
        && authorization.request_sha256 === input.request_sha256
        && authorization.authorization_profile === input.authorization_profile
        && authorization.authorization_binding_sha256 === input.authorization_binding_sha256
        && authorization.challenge_sha256 === input.challenge_sha256
        && authorization.operator_intent_json === input.operator_intent_json
        && authorization.operator_authorization_ref === input.operator_authorization_ref
        && authorization.operator_thread_id === input.operator_thread_id
        && authorization.operator_turn_id === input.operator_turn_id
        && authorization.operator_message_sha256 === input.operator_message_sha256
        && authorization.operator_record_sha256 === input.operator_record_sha256
        && authorization.operator_record_set_sha256 === input.operator_record_set_sha256
        && authorization.operator_record_count === input.operator_record_count
        && authorization.execution_grant_schema === input.execution_grant_schema
        && authorization.execution_grant_sha256 === input.execution_grant_sha256
        && authorization.execution_grant_json === input.execution_grant_json
        && authorization.authorized_at === input.authorized_at
        && authorization.expires_at === input.expires_at;
}

function forgeAuthorizationProfileMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
): boolean {
    if (authorization.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE) {
        return authorization.operator_intent_json === undefined
            && request.authorization_challenge_sha256 === authorization.challenge_sha256
            && authorization.authorization_binding_sha256 === authorization.challenge_sha256;
    }
    if (authorization.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || request.authorization_challenge_sha256 !== undefined
        || authorization.challenge_sha256 !== undefined) return false;
    try {
        if (isForgeGoalResumeProjectionJson(authorization.operator_intent_json)) {
            const projection = parseForgeGoalResumeAuthorizationProjection(
                authorization.operator_intent_json,
            );
            return authorization.authorization_binding_sha256
                === hashForgeGoalResumeAuthorizationBinding({
                    request,
                    projection,
                    operator_thread_id: authorization.operator_thread_id,
                    operator_turn_id: authorization.operator_turn_id,
                    operator_message_sha256: authorization.operator_message_sha256,
                    operator_record_sha256: authorization.operator_record_sha256,
                    operator_record_set_sha256: authorization.operator_record_set_sha256,
                    operator_record_count: authorization.operator_record_count,
                });
        }
        const projection = parseForgeOperatorIntentProjection(authorization.operator_intent_json);
        return authorization.authorization_binding_sha256 === hashRootUserForgeIntentBinding({
            request,
            projection,
            operator_thread_id: authorization.operator_thread_id,
            operator_turn_id: authorization.operator_turn_id,
            operator_message_sha256: authorization.operator_message_sha256,
            operator_record_sha256: authorization.operator_record_sha256,
            operator_record_set_sha256: authorization.operator_record_set_sha256,
            operator_record_count: authorization.operator_record_count,
        });
    } catch {
        return false;
    }
}

function forgeAuthorizationExecutionGrantMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
): boolean {
    let requestSchema: unknown;
    try {
        requestSchema = (JSON.parse(request.request_summary_json) as Record<string, unknown>).schema;
    } catch {
        return false;
    }
    const fields = [authorization.execution_grant_schema, authorization.execution_grant_sha256,
        authorization.execution_grant_json];
    if (requestSchema === 'cstar.forge_request.v3') return fields.every((value) => value === undefined);
    if (requestSchema !== 'cstar.forge_request.v2'
        || fields.some((value) => value === undefined)
        || authorization.execution_grant_schema !== 'cstar.forge_legacy_v2_execution_grant.v1'
        || !SHA256.test(authorization.execution_grant_sha256 ?? '')) return false;
    let grant: Record<string, unknown>;
    try {
        grant = JSON.parse(authorization.execution_grant_json!) as Record<string, unknown>;
    } catch {
        return false;
    }
    const lineage = grant.legacy_requester_lineage as Record<string, unknown> | undefined;
    return sha256(authorization.execution_grant_json!) === authorization.execution_grant_sha256
        && grant.schema === authorization.execution_grant_schema
        && grant.legacy_repo_id === request.repo_id
        && grant.legacy_request_id === request.request_id
        && grant.legacy_request_sha256 === request.request_sha256
        && grant.legacy_request_created_at === request.created_at
        && forgeRequesterLineageMatchesRequest(request, lineage);
}

export function forgeAuthorizationLineageMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord | null,
): authorization is HallForgeAuthorizationRecord {
    return Boolean(authorization
        && request.authorization_profile === authorization.authorization_profile
        && request.authorization_binding_sha256 === authorization.authorization_binding_sha256
        && forgeAuthorizationProfileMatchesRequest(request, authorization)
        && request.request_sha256 === authorization.request_sha256
        && request.operator_authorization_ref === authorization.operator_authorization_ref
        && request.operator_thread_id === authorization.operator_thread_id
        && request.operator_turn_id === authorization.operator_turn_id
        && request.operator_message_sha256 === authorization.operator_message_sha256
        && request.operator_record_sha256 === authorization.operator_record_sha256
        && request.operator_record_set_sha256 === authorization.operator_record_set_sha256
        && request.operator_record_count === authorization.operator_record_count
        && request.authorized_at === authorization.authorized_at
        && request.expires_at === authorization.expires_at
        && forgeAuthorizationExecutionGrantMatchesRequest(request, authorization));
}
