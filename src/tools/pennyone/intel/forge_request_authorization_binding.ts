import type Database from 'better-sqlite3';

import type {
    AuthorizeForgeRequestInput,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    forgeOperatorIntentProjectionMatchesRequest,
    hashRootUserForgeIntentBinding,
    LEGACY_EXACT_FORGE_CHALLENGE_PROFILE,
    parseForgeOperatorIntentProjection,
    ROOT_USER_FORGE_INTENT_PROFILE,
    validateLegacyExactAuthorizationBinding,
} from './forge_authorization_policy.js';
import {
    isForgeGoalResumeProjectionJson,
    validateForgeGoalResumeAuthorizationInput,
} from './forge_goal_resume_authorization_policy.js';
import {
    isForgeGoalResumeV2ProjectionJson,
    validateForgeGoalResumeV2AuthorizationInput,
} from '../../cstar-kernel-mcp/tools/forge_goal_resume_v2_authority.js';
import {
    assertForgeRootRepairContinuationAuthorization,
    getForgeRootRepairBinding,
    isForgeRootRepairContinuationReference,
} from './forge_request_root_repair_binding.js';

export function parseForgeAuthorizationIntent(input: AuthorizeForgeRequestInput) {
    const goalResumeV2Projection = input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        && isForgeGoalResumeV2ProjectionJson(input.operator_intent_json);
    const goalProjection = input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        && !goalResumeV2Projection
        && isForgeGoalResumeProjectionJson(input.operator_intent_json);
    const naturalProjection = input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        && !goalProjection && !goalResumeV2Projection
        ? parseForgeOperatorIntentProjection(input.operator_intent_json)
        : null;
    return { goalProjection, goalResumeV2Projection, naturalProjection };
}

export function forgeAuthorizationRecordCountIsValid(
    input: AuthorizeForgeRequestInput,
    intent: ReturnType<typeof parseForgeAuthorizationIntent>,
): boolean {
    const multiRecord = intent.goalProjection || intent.goalResumeV2Projection
        || ['explicit_request_receipt_binding', 'explicit_mission_record_binding']
            .includes(intent.naturalProjection?.requester_lineage_mode ?? '');
    return multiRecord
        ? Number.isSafeInteger(input.operator_record_count) && input.operator_record_count >= 1
        : input.operator_record_count === 1;
}

export function resolveForgeRequestAuthorizationBinding(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    input: AuthorizeForgeRequestInput;
    existingAuthorization: HallForgeAuthorizationRecord | null;
    intent: ReturnType<typeof parseForgeAuthorizationIntent>;
}): string {
    const { db, request, input, existingAuthorization, intent } = args;
    const goalAuthorization = intent.goalProjection
        ? validateForgeGoalResumeAuthorizationInput({ request, input, existingAuthorization })
        : null;
    const goalResumeV2Authorization = intent.goalResumeV2Projection
        ? validateForgeGoalResumeV2AuthorizationInput({ db, request, input, existingAuthorization })
        : null;
    const naturalProjection = intent.naturalProjection;
    if (naturalProjection?.requester_lineage_mode === 'same_turn_request') {
        if (
            request.requester_thread_id !== input.operator_thread_id
            || request.requester_turn_id !== input.operator_turn_id
            || request.requester_record_set_sha256 !== input.operator_record_set_sha256
        ) throw new Error('forge_operator_intent_requester_lineage_mismatch');
    } else if (naturalProjection?.requester_lineage_mode === 'explicit_legacy_request_upgrade') {
        const exactPendingUpgrade = request.status === 'PENDING_AUTH'
            && request.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE;
        const exactUpgradeReplay = request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
            && existingAuthorization?.operator_intent_json === input.operator_intent_json;
        if (!exactPendingUpgrade && !exactUpgradeReplay) {
            throw new Error('forge_operator_intent_legacy_upgrade_invalid');
        }
    } else if (naturalProjection && [
        'explicit_request_receipt_binding',
        'explicit_mission_record_binding',
    ].includes(naturalProjection.requester_lineage_mode)) {
        const exactPendingBinding = request.status === 'PENDING_AUTH'
            && request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
            && request.authorization_binding_sha256 === undefined
            && request.requester_thread_id === input.operator_thread_id
            && existingAuthorization === null;
        const exactBindingReplay = request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
            && existingAuthorization?.operator_intent_json === input.operator_intent_json;
        if (!exactPendingBinding && !exactBindingReplay) {
            throw new Error('forge_operator_intent_request_receipt_binding_invalid');
        }
    }
    if (isForgeRootRepairContinuationReference(input.operator_authorization_ref)) {
        const binding = getForgeRootRepairBinding(db, request.request_id);
        if (!binding || !naturalProjection
            || naturalProjection.action !== binding.action
            || naturalProjection.requester_lineage_mode !== 'explicit_request_receipt_binding'
            || naturalProjection.subject.kind !== 'bead'
            || naturalProjection.subject.value !== binding.bead_id
            || naturalProjection.subject.repo_id !== binding.repo_id) {
            throw new Error('forge_root_repair_continuation_projection_invalid');
        }
    }
    assertForgeRootRepairContinuationAuthorization({
        db, request, input, existingAuthorization,
    });
    const expectedBinding = goalAuthorization?.expected_binding_sha256
        ?? goalResumeV2Authorization?.expected_binding_sha256 ?? (naturalProjection
        ? hashRootUserForgeIntentBinding({
            request,
            projection: naturalProjection,
            operator_thread_id: input.operator_thread_id,
            operator_turn_id: input.operator_turn_id,
            operator_message_sha256: input.operator_message_sha256,
            operator_record_sha256: input.operator_record_sha256,
            operator_record_set_sha256: input.operator_record_set_sha256,
            operator_record_count: input.operator_record_count,
        })
        : validateLegacyExactAuthorizationBinding(
            input.authorization_binding_sha256,
            input.challenge_sha256,
        ));
    if (naturalProjection) {
        const targetRef = (db.prepare(
            'SELECT target_ref FROM hall_beads WHERE bead_id = ? AND repo_id = ?',
        ).pluck().get(request.bead_id, request.repo_id) as string | null | undefined) ?? undefined;
        if (!forgeOperatorIntentProjectionMatchesRequest(request, naturalProjection, targetRef)) {
            throw new Error('forge_operator_intent_selected_request_mismatch');
        }
    }
    return expectedBinding;
}
