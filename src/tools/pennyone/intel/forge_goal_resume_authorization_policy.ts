import { createHash } from 'node:crypto';

import type {
    AuthorizeForgeRequestInput,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import type { HistoricalForgeChallengeAuthorization } from '../../cstar-kernel-mcp/tools/forge_authorization_challenge.js';

const SHA256 = /^[a-f0-9]{64}$/;
const GOAL_RESUME_ID = /^goal-resume:[a-f0-9]{64}$/;
const BOUNDED = /^[^\u0000-\u001f\u007f]{1,320}$/u;

export interface ForgeGoalResumeAuthorizationProjection {
    schema: 'cstar.forge_goal_resume_authorization_projection.v1';
    action: 'continue';
    requester_lineage_mode: 'explicit_goal_continuation';
    subject: { kind: 'bead'; value: string; repo_id: string };
    scope_authority: {
        kind: 'historical_exact_challenge';
        challenge_sha256: string;
        operator_authorization_ref: string;
        operator_thread_id: string;
        operator_turn_id: string;
        operator_message_sha256: string;
        operator_record_sha256: string;
        operator_record_set_sha256: string;
        operator_record_count: 1;
        authorized_at: number;
    };
    continuity_evidence: {
        goal_resume_id: string;
        event_sha256: string;
        operator_attestation_sha256: string;
        operator_thread_id: string;
        operator_turn_id: string;
        operator_record_set_sha256: string;
    };
}

export interface ForgeGoalResumeBindingInput {
    request: Pick<HallForgeRequestRecord,
        | 'request_id' | 'request_sha256' | 'repo_id' | 'bead_id' | 'decision_id'
        | 'requester_thread_id' | 'requester_turn_id' | 'requester_record_set_sha256'>;
    projection: ForgeGoalResumeAuthorizationProjection;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function bounded(value: unknown, name: string): string {
    if (typeof value !== 'string' || value !== value.trim() || !BOUNDED.test(value)) {
        throw new Error(`forge_goal_resume_${name}_invalid`);
    }
    return value;
}

function digest(value: unknown, name: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`forge_goal_resume_${name}_invalid`);
    }
    return value;
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

export function buildForgeGoalResumeAuthorizationProjection(input: {
    request: HallForgeRequestRecord;
    historical: HistoricalForgeChallengeAuthorization;
    goal_resume_id: string;
    event_sha256: string;
    operator_attestation_sha256: string;
    current_thread_id: string;
    current_turn_id: string;
    current_record_set_sha256: string;
    challenge_sha256: string;
}): ForgeGoalResumeAuthorizationProjection {
    if (!GOAL_RESUME_ID.test(input.goal_resume_id)) {
        throw new Error('forge_goal_resume_id_invalid');
    }
    if (input.historical.session_record_count !== 1
        || !Number.isSafeInteger(input.historical.authorized_at)) {
        throw new Error('forge_goal_resume_scope_authority_invalid');
    }
    return {
        schema: 'cstar.forge_goal_resume_authorization_projection.v1',
        action: 'continue',
        requester_lineage_mode: 'explicit_goal_continuation',
        subject: {
            kind: 'bead',
            value: bounded(input.request.bead_id, 'bead_id'),
            repo_id: bounded(input.request.repo_id, 'repo_id'),
        },
        scope_authority: {
            kind: 'historical_exact_challenge',
            challenge_sha256: digest(input.challenge_sha256, 'challenge_sha256'),
            operator_authorization_ref: bounded(input.historical.reference, 'historical_ref'),
            operator_thread_id: bounded(input.historical.thread_id, 'historical_thread_id'),
            operator_turn_id: bounded(input.historical.turn_id, 'historical_turn_id'),
            operator_message_sha256: digest(input.historical.message_sha256, 'historical_message_sha256'),
            operator_record_sha256: digest(input.historical.session_record_sha256, 'historical_record_sha256'),
            operator_record_set_sha256: digest(input.historical.session_record_set_sha256, 'historical_record_set_sha256'),
            operator_record_count: 1,
            authorized_at: input.historical.authorized_at,
        },
        continuity_evidence: {
            goal_resume_id: input.goal_resume_id,
            event_sha256: digest(input.event_sha256, 'event_sha256'),
            operator_attestation_sha256: digest(
                input.operator_attestation_sha256,
                'operator_attestation_sha256',
            ),
            operator_thread_id: bounded(input.current_thread_id, 'current_thread_id'),
            operator_turn_id: bounded(input.current_turn_id, 'current_turn_id'),
            operator_record_set_sha256: digest(
                input.current_record_set_sha256,
                'current_record_set_sha256',
            ),
        },
    };
}

export function forgeGoalResumeAuthorizationProjectionJson(
    projection: ForgeGoalResumeAuthorizationProjection,
): string {
    return JSON.stringify(buildForgeGoalResumeAuthorizationProjection({
        request: {
            bead_id: projection.subject.value,
            repo_id: projection.subject.repo_id,
        } as HallForgeRequestRecord,
        historical: {
            scope_authority: 'historical_exact_challenge',
            reference: projection.scope_authority.operator_authorization_ref,
            thread_id: projection.scope_authority.operator_thread_id,
            turn_id: projection.scope_authority.operator_turn_id,
            message_sha256: projection.scope_authority.operator_message_sha256,
            session_record_sha256: projection.scope_authority.operator_record_sha256,
            session_record_set_sha256: projection.scope_authority.operator_record_set_sha256,
            session_record_count: 1,
            authorized_at: projection.scope_authority.authorized_at,
        },
        goal_resume_id: projection.continuity_evidence.goal_resume_id,
        event_sha256: projection.continuity_evidence.event_sha256,
        operator_attestation_sha256: projection.continuity_evidence.operator_attestation_sha256,
        current_thread_id: projection.continuity_evidence.operator_thread_id,
        current_turn_id: projection.continuity_evidence.operator_turn_id,
        current_record_set_sha256: projection.continuity_evidence.operator_record_set_sha256,
        challenge_sha256: projection.scope_authority.challenge_sha256,
    }));
}

export function parseForgeGoalResumeAuthorizationProjection(
    value: string | undefined,
): ForgeGoalResumeAuthorizationProjection {
    let parsed: unknown;
    try { parsed = JSON.parse(value ?? ''); } catch {
        throw new Error('forge_goal_resume_projection_invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('forge_goal_resume_projection_invalid');
    }
    const record = parsed as Record<string, unknown>;
    const subject = record.subject as Record<string, unknown> | undefined;
    const scope = record.scope_authority as Record<string, unknown> | undefined;
    const continuity = record.continuity_evidence as Record<string, unknown> | undefined;
    if (!exactKeys(record, [
        'schema', 'action', 'requester_lineage_mode', 'subject',
        'scope_authority', 'continuity_evidence',
    ]) || record.schema !== 'cstar.forge_goal_resume_authorization_projection.v1'
        || record.action !== 'continue'
        || record.requester_lineage_mode !== 'explicit_goal_continuation'
        || !subject || !scope || !continuity
        || !exactKeys(subject, ['kind', 'value', 'repo_id']) || subject.kind !== 'bead'
        || !exactKeys(scope, [
            'kind', 'challenge_sha256', 'operator_authorization_ref',
            'operator_thread_id', 'operator_turn_id', 'operator_message_sha256',
            'operator_record_sha256', 'operator_record_set_sha256',
            'operator_record_count', 'authorized_at',
        ]) || scope.kind !== 'historical_exact_challenge'
        || !exactKeys(continuity, [
            'goal_resume_id', 'event_sha256', 'operator_attestation_sha256',
            'operator_thread_id', 'operator_turn_id', 'operator_record_set_sha256',
        ])) {
        throw new Error('forge_goal_resume_projection_invalid');
    }
    const projection = buildForgeGoalResumeAuthorizationProjection({
        request: { bead_id: subject.value, repo_id: subject.repo_id } as HallForgeRequestRecord,
        historical: {
            scope_authority: 'historical_exact_challenge',
            reference: scope.operator_authorization_ref,
            thread_id: scope.operator_thread_id,
            turn_id: scope.operator_turn_id,
            message_sha256: scope.operator_message_sha256,
            session_record_sha256: scope.operator_record_sha256,
            session_record_set_sha256: scope.operator_record_set_sha256,
            session_record_count: scope.operator_record_count,
            authorized_at: scope.authorized_at,
        } as HistoricalForgeChallengeAuthorization,
        goal_resume_id: String(continuity.goal_resume_id ?? ''),
        event_sha256: String(continuity.event_sha256 ?? ''),
        operator_attestation_sha256: String(continuity.operator_attestation_sha256 ?? ''),
        current_thread_id: String(continuity.operator_thread_id ?? ''),
        current_turn_id: String(continuity.operator_turn_id ?? ''),
        current_record_set_sha256: String(continuity.operator_record_set_sha256 ?? ''),
        challenge_sha256: String(scope.challenge_sha256 ?? ''),
    });
    if (forgeGoalResumeAuthorizationProjectionJson(projection) !== value) {
        throw new Error('forge_goal_resume_projection_not_canonical');
    }
    return projection;
}

export function hashForgeGoalResumeAuthorizationBinding(
    input: ForgeGoalResumeBindingInput,
): string {
    if (!Number.isSafeInteger(input.operator_record_count)
        || input.operator_record_count < 1
        || input.projection.subject.repo_id !== input.request.repo_id
        || input.projection.subject.value !== input.request.bead_id
        || input.projection.continuity_evidence.operator_thread_id !== input.operator_thread_id
        || input.projection.continuity_evidence.operator_turn_id !== input.operator_turn_id
        || input.projection.continuity_evidence.operator_record_set_sha256
            !== input.operator_record_set_sha256) {
        throw new Error('forge_goal_resume_binding_lineage_invalid');
    }
    for (const [name, value] of [
        ['request_sha256', input.request.request_sha256],
        ['operator_message_sha256', input.operator_message_sha256],
        ['operator_record_sha256', input.operator_record_sha256],
        ['operator_record_set_sha256', input.operator_record_set_sha256],
    ] as const) digest(value, name);
    return sha256(JSON.stringify({
        schema: 'cstar.forge_goal_resume_authorization_binding.v1',
        profile: 'root_user_forge_intent_v1',
        intent: 'forge_execute',
        projection: JSON.parse(forgeGoalResumeAuthorizationProjectionJson(input.projection)),
        request_id: bounded(input.request.request_id, 'request_id'),
        request_sha256: input.request.request_sha256,
        bead_id: bounded(input.request.bead_id, 'bead_id'),
        decision_id: bounded(input.request.decision_id, 'decision_id'),
        requester_thread_id: input.request.requester_thread_id ?? null,
        requester_turn_id: input.request.requester_turn_id ?? null,
        requester_record_set_sha256: input.request.requester_record_set_sha256 ?? null,
        operator_thread_id: bounded(input.operator_thread_id, 'thread_id'),
        operator_turn_id: bounded(input.operator_turn_id, 'turn_id'),
        operator_record_set_sha256: input.operator_record_set_sha256,
        operator_record_sha256: input.operator_record_sha256,
        operator_record_count: input.operator_record_count,
        operator_message_sha256: input.operator_message_sha256,
    }));
}

export function isForgeGoalResumeProjectionJson(value: string | undefined): boolean {
    try {
        return (JSON.parse(value ?? '') as Record<string, unknown>).schema
            === 'cstar.forge_goal_resume_authorization_projection.v1';
    } catch { return false; }
}

export function validateForgeGoalResumeAuthorizationInput({
    request,
    input,
    existingAuthorization,
}: {
    request: HallForgeRequestRecord;
    input: AuthorizeForgeRequestInput;
    existingAuthorization: HallForgeAuthorizationRecord | null;
}): {
    projection: ForgeGoalResumeAuthorizationProjection;
    expected_binding_sha256: string;
} {
    const projection = parseForgeGoalResumeAuthorizationProjection(input.operator_intent_json);
    const firstMint = request.status === 'PENDING_AUTH'
        && request.authorization_profile === 'exact_request_challenge_v1'
        && request.authorization_challenge_sha256 === projection.scope_authority.challenge_sha256
        && request.authorization_binding_sha256 === projection.scope_authority.challenge_sha256
        && existingAuthorization === null;
    const exactReplay = request.status === 'AUTHORIZED'
        && request.authorization_profile === 'root_user_forge_intent_v1'
        && existingAuthorization?.operator_intent_json === input.operator_intent_json;
    if (!firstMint && !exactReplay) {
        throw new Error('forge_goal_resume_authorization_transition_invalid');
    }
    if (projection.subject.repo_id !== request.repo_id
        || projection.subject.value !== request.bead_id
        || projection.continuity_evidence.operator_thread_id !== input.operator_thread_id
        || projection.continuity_evidence.operator_turn_id !== input.operator_turn_id
        || projection.continuity_evidence.operator_record_set_sha256
            !== input.operator_record_set_sha256) {
        throw new Error('forge_goal_resume_authorization_request_mismatch');
    }
    return {
        projection,
        expected_binding_sha256: hashForgeGoalResumeAuthorizationBinding({
            request,
            projection,
            operator_thread_id: input.operator_thread_id,
            operator_turn_id: input.operator_turn_id,
            operator_message_sha256: input.operator_message_sha256,
            operator_record_sha256: input.operator_record_sha256,
            operator_record_set_sha256: input.operator_record_set_sha256,
            operator_record_count: input.operator_record_count,
        }),
    };
}
