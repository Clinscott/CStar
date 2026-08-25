import { createHash } from 'node:crypto';

import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOAL_RESUME_ID = /^goal-resume-v2:[a-f0-9]{64}$/;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

export function forgeGoalResumeV2AuthorizationMatchesRequest(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
): boolean {
    let parsed: unknown;
    try { parsed = JSON.parse(authorization.operator_intent_json ?? ''); } catch { return false; }
    if (!isRecord(parsed)) return false;
    const subject = parsed.subject;
    const scope = parsed.scope_authority;
    const continuity = parsed.continuity_evidence;
    if (!isRecord(subject) || !isRecord(scope) || !isRecord(continuity)
        || !exactKeys(parsed, ['schema', 'action', 'requester_lineage_mode', 'subject', 'scope_authority', 'continuity_evidence'])
        || !exactKeys(subject, ['kind', 'value', 'repo_id'])
        || !exactKeys(scope, ['kind', 'goal_resume_id', 'request_id', 'request_sha256', 'root_repair_binding_sha256', 'root_repair_instruction_sha256', 'root_thread_id', 'root_turn_id', 'root_record_set_sha256', 'event_sha256'])
        || !exactKeys(continuity, ['operator_thread_id', 'operator_turn_id', 'operator_message_sha256', 'operator_record_sha256', 'operator_record_set_sha256', 'operator_record_count'])
        || parsed.schema !== 'cstar.forge_goal_resume_authorization_projection.v2'
        || parsed.action !== 'continue'
        || parsed.requester_lineage_mode !== 'explicit_goal_continuation_v2'
        || subject.kind !== 'bead' || subject.value !== request.bead_id || subject.repo_id !== request.repo_id
        || scope.kind !== 'request_bound_root_repair' || !GOAL_RESUME_ID.test(String(scope.goal_resume_id))
        || scope.request_id !== request.request_id || scope.request_sha256 !== request.request_sha256
        || scope.root_thread_id !== request.requester_thread_id
        || scope.root_turn_id !== request.requester_turn_id
        || scope.root_record_set_sha256 !== request.requester_record_set_sha256
        || continuity.operator_thread_id !== scope.root_thread_id
        || continuity.operator_turn_id === scope.root_turn_id
        || !UUID.test(String(scope.root_thread_id)) || !UUID.test(String(scope.root_turn_id))
        || ![scope.request_sha256, scope.root_repair_binding_sha256, scope.root_repair_instruction_sha256,
            scope.root_record_set_sha256, scope.event_sha256].every((value) => HASH.test(String(value)))
        || continuity.operator_thread_id !== authorization.operator_thread_id
        || continuity.operator_turn_id !== authorization.operator_turn_id
        || continuity.operator_message_sha256 !== authorization.operator_message_sha256
        || continuity.operator_record_sha256 !== authorization.operator_record_sha256
        || continuity.operator_record_set_sha256 !== authorization.operator_record_set_sha256
        || continuity.operator_record_count !== authorization.operator_record_count
        || !UUID.test(authorization.operator_thread_id) || !UUID.test(authorization.operator_turn_id)
        || ![authorization.operator_message_sha256, authorization.operator_record_sha256,
            authorization.operator_record_set_sha256].every((value) => HASH.test(value))
        || !Number.isSafeInteger(authorization.operator_record_count) || authorization.operator_record_count < 1
        || authorization.operator_authorization_ref
            !== `cstar-forge-goal-resume-v2:${scope.goal_resume_id}:${authorization.operator_record_set_sha256}`
        || JSON.stringify(parsed) !== authorization.operator_intent_json) return false;
    const binding = sha256(JSON.stringify({
        schema: 'cstar.forge_goal_resume_authorization_binding.v2',
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        bead_id: request.bead_id,
        decision_id: request.decision_id,
        projection: parsed,
    }));
    return authorization.authorization_binding_sha256 === binding;
}
