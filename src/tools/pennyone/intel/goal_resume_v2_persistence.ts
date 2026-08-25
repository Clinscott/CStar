import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuthorizeForgeRequestInput, HallForgeAuthorizationRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import type { HallCoordinationEventRecord } from '../../../types/hall.js';
import type { VerifiedCodexRequestIdentity } from '../../cstar-kernel-mcp/tools/operator_authorization.js';
import { stableJson } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    buildGoalResumeV2GoalRef,
    buildGoalResumeV2LivenessEvidenceSha256,
    buildGoalResumeV2OperatorAttestationSha256,
    buildGoalResumeV2OperatorResumeRef,
    buildGoalResumeV2ResumeId,
    GOAL_RESUME_V2_RATIONALE,
    GOAL_RESUME_V2_RECEIPT_KEYS,
    GOAL_RESUME_V2_SCHEMA,
    GOAL_RESUME_V2_SUMMARY,
    HOST_GOAL_SNAPSHOT_SCHEMA,
    hashCanonicalGoalProjectionMaterial,
    isGoalResumeV2Id,
    type CanonicalHostGoalProjection,
    type GoalResumeV2ReceiptPayload,
    sha256Text,
} from './goal_resume_v2_contract.js';
import {
    assertGoalResumeV2RequestAndBinding,
    scanCurrentLiveness,
    type ForgeGoalResumeV2AuthorizationProjection,
    type GoalResumeV2Authority,
} from './goal_resume_v2_authority.js';
import type { ForgeRootRepairBinding } from './forge_request_root_repair_binding.js';
import { getForgeRequest } from './forge_receipt_controller.js';
import { database } from './database.js';
import { insertImmutableHallCoordinationEvent, withImmediateHallCoordinationTransaction } from './agent_coordination_controller.js';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HISTORY = 1_000;
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
function requiredHash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`goal_resume_v2_${name}_invalid`);
    return value;
}
function requiredInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`goal_resume_v2_${name}_invalid`);
    }
    return value;
}
function parseStoredJson(value: unknown, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value ?? '')) as unknown;
        if (!isRecord(parsed)) throw new Error(code);
        return parsed;
    } catch {
        throw new Error(code);
    }
}
function mapEvent(row: Record<string, unknown>): HallCoordinationEventRecord {
    return {
        event_id: String(row.event_id), repo_id: String(row.repo_id), thread_id: String(row.thread_id),
        scope_kind: String(row.scope_kind) as HallCoordinationEventRecord['scope_kind'],
        scope_ref: String(row.scope_ref), event_kind: String(row.event_kind) as HallCoordinationEventRecord['event_kind'],
        from_agent_id: String(row.from_agent_id), to_agent_id: row.to_agent_id ? String(row.to_agent_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        trace_id: row.trace_id ? String(row.trace_id) : undefined,
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        rationale: String(row.rationale), summary: String(row.summary),
        payload: parseStoredJson(row.payload_json, 'goal_resume_v2_event_payload_invalid'),
        metadata: parseStoredJson(row.metadata_json, 'goal_resume_v2_event_metadata_invalid'),
        created_at: Number(row.created_at), updated_at: Number(row.updated_at),
    };
}
export function readGoalResumeV2Event(db: Database.Database, resumeId: string): HallCoordinationEventRecord {
    if (!isGoalResumeV2Id(resumeId)) throw new Error('forge_goal_resume_id_invalid');
    const row = db.prepare(`
        SELECT event_id, repo_id, thread_id, scope_kind, scope_ref, event_kind,
               from_agent_id, to_agent_id, session_id, trace_id, bead_id, target_path,
               rationale, summary, payload_json, metadata_json, created_at, updated_at
        FROM hall_coordination_events WHERE event_id = ? LIMIT 1
    `).get(resumeId) as Record<string, unknown> | undefined;
    if (!row) throw new Error('forge_goal_resume_event_not_found');
    return mapEvent(row);
}
function projectionFromPayload(payload: Record<string, unknown>): CanonicalHostGoalProjection {
    const created = requiredInteger(payload.host_goal_created_at, 'created_at');
    const updated = requiredInteger(payload.host_goal_updated_at, 'updated_at');
    if (created > updated) throw new Error('goal_resume_v2_timestamp_order_invalid');
    return {
        host_goal_snapshot_schema: String(payload.host_goal_snapshot_schema) as CanonicalHostGoalProjection['host_goal_snapshot_schema'],
        host_goal_thread_id: String(payload.host_goal_thread_id),
        host_goal_objective_sha256: requiredHash(payload.host_goal_objective_sha256, 'objective_hash'),
        host_goal_snapshot_sha256: requiredHash(payload.host_goal_snapshot_sha256, 'snapshot_hash'),
        host_goal_status: payload.host_goal_status as 'blocked',
        host_goal_created_at: created,
        host_goal_updated_at: updated,
        host_resume_capability: payload.host_resume_capability as 'unavailable',
    };
}
export function validateGoalResumeV2Event(args: {
    event: HallCoordinationEventRecord;
    repo_id: string;
    request: HallForgeRequestRecord;
    binding: ForgeRootRepairBinding;
}): GoalResumeV2ReceiptPayload {
    const payload = args.event.payload ?? {};
    const metadata = args.event.metadata ?? {};
    if (!exactKeys(payload, GOAL_RESUME_V2_RECEIPT_KEYS)
        || !exactKeys(metadata, ['immutable', 'source'])
        || metadata.immutable !== true || metadata.source !== 'cstar-kernel-mcp') {
        throw new Error('goal_resume_v2_event_shape_invalid');
    }
    const typed = payload as unknown as GoalResumeV2ReceiptPayload;
    const projection = projectionFromPayload(payload);
    const projectionMaterial = {
        host_goal_snapshot_schema: projection.host_goal_snapshot_schema,
        host_goal_thread_id: projection.host_goal_thread_id,
        host_goal_objective_sha256: projection.host_goal_objective_sha256,
        host_goal_status: projection.host_goal_status,
        host_goal_created_at: projection.host_goal_created_at,
        host_goal_updated_at: projection.host_goal_updated_at,
        host_resume_capability: projection.host_resume_capability,
    } as Omit<CanonicalHostGoalProjection, 'host_goal_snapshot_sha256'>;
    if (typed.schema !== GOAL_RESUME_V2_SCHEMA || typed.resume_id !== args.event.event_id
        || !isGoalResumeV2Id(typed.resume_id) || typed.repo_id !== args.repo_id
        || typed.request_id !== args.request.request_id || typed.request_sha256 !== args.request.request_sha256
        || typed.request_bead_id !== args.request.bead_id || typed.decision_id !== args.request.decision_id
        || typed.root_repair_binding_schema !== args.binding.schema
        || typed.root_repair_binding_sha256 !== args.binding.binding_sha256
        || typed.root_repair_instruction_sha256 !== args.binding.repair_instruction_sha256
        || typed.root_thread_id !== args.binding.root_thread_id || typed.root_turn_id !== args.binding.root_turn_id
        || typed.root_record_set_sha256 !== args.binding.root_record_set_sha256
        || projection.host_goal_snapshot_schema !== HOST_GOAL_SNAPSHOT_SCHEMA
        || projection.host_goal_status !== 'blocked' || projection.host_resume_capability !== 'unavailable'
        || projection.host_goal_thread_id !== args.binding.root_thread_id
        || hashCanonicalGoalProjectionMaterial(projectionMaterial)
            !== projection.host_goal_snapshot_sha256
        || typed.goal_ref !== buildGoalResumeV2GoalRef({
            request_id: typed.request_id, request_sha256: typed.request_sha256, projection,
        })
        || typed.host_status_mutated !== false || typed.authority_effect !== 'continuity_only'
        || typed.operator_thread_id !== projection.host_goal_thread_id
        || typed.operator_resume_ref !== buildGoalResumeV2OperatorResumeRef(
            typed.operator_thread_id, typed.operator_turn_id, typed.operator_record_set_sha256,
        )
        || typed.operator_attestation_sha256 !== buildGoalResumeV2OperatorAttestationSha256({
            thread_id: typed.operator_thread_id, turn_id: typed.operator_turn_id,
            operator_resume_ref: typed.operator_resume_ref, message_sha256: typed.operator_message_sha256,
            record_sha256: typed.operator_record_sha256, record_set_sha256: typed.operator_record_set_sha256,
            record_count: typed.operator_record_count, record_first_timestamp: typed.operator_record_first_timestamp,
            operator_timestamp: typed.operator_timestamp, liveness_evidence_sha256: typed.liveness_evidence_sha256,
        })
        || typed.liveness_evidence_sha256 !== buildGoalResumeV2LivenessEvidenceSha256({
            thread_id: typed.operator_thread_id, turn_id: typed.operator_turn_id,
            turn_record_sha256: typed.operator_record_sha256,
            turn_record_set_sha256: typed.operator_record_set_sha256,
            turn_record_count: typed.operator_record_count,
            first_timestamp: typed.operator_record_first_timestamp,
            timestamp: typed.operator_timestamp,
            message_sha256: typed.operator_message_sha256,
        })
        || typed.resume_id !== buildGoalResumeV2ResumeId({
            request_id: typed.request_id, request_sha256: typed.request_sha256, goal_ref: typed.goal_ref,
            request_bead_id: typed.request_bead_id, decision_id: typed.decision_id,
            root_repair_binding_sha256: typed.root_repair_binding_sha256,
            root_repair_instruction_sha256: typed.root_repair_instruction_sha256,
            root_thread_id: typed.root_thread_id, root_turn_id: typed.root_turn_id,
            root_record_set_sha256: typed.root_record_set_sha256, projection,
            operator_thread_id: typed.operator_thread_id, operator_turn_id: typed.operator_turn_id,
            operator_record_set_sha256: typed.operator_record_set_sha256,
            operator_attestation_sha256: typed.operator_attestation_sha256,
            liveness_evidence_sha256: typed.liveness_evidence_sha256,
        })
        || !Number.isSafeInteger(typed.resume_generation) || typed.resume_generation < 1
        || (typed.previous_resume_id !== null && !isGoalResumeV2Id(typed.previous_resume_id))
        || !HASH.test(typed.operator_message_sha256) || !HASH.test(typed.operator_record_sha256)
        || !HASH.test(typed.operator_record_set_sha256) || !HASH.test(typed.operator_attestation_sha256)
        || !HASH.test(typed.liveness_evidence_sha256) || !Number.isSafeInteger(typed.operator_record_count)
        || typed.operator_record_count < 1 || !UUID.test(typed.operator_thread_id)
        || !UUID.test(typed.operator_turn_id) || !Number.isFinite(Date.parse(typed.operator_record_first_timestamp))
        || !Number.isFinite(Date.parse(typed.operator_timestamp))
        || Date.parse(typed.operator_record_first_timestamp) > Date.parse(typed.operator_timestamp)
        || args.event.repo_id !== args.repo_id || args.event.thread_id !== typed.operator_thread_id
        || args.event.scope_kind !== 'TARGET' || args.event.scope_ref !== typed.goal_ref
        || args.event.event_kind !== 'DECISION' || args.event.from_agent_id !== `operator:${typed.operator_thread_id}`
        || args.event.to_agent_id !== 'cstar:cos' || args.event.session_id !== typed.operator_thread_id
        || args.event.trace_id !== typed.operator_turn_id || args.event.bead_id !== typed.request_bead_id
        || args.event.target_path !== undefined || args.event.rationale !== GOAL_RESUME_V2_RATIONALE
        || args.event.summary !== GOAL_RESUME_V2_SUMMARY || args.event.created_at !== args.event.updated_at) {
        throw new Error('goal_resume_v2_event_lineage_invalid');
    }
    return typed;
}
function eventSha256(event: HallCoordinationEventRecord): string {
    return sha256(stableJson(event));
}
export function validateGoalResumeV2History(args: {
    db: Database.Database;
    repo_id: string;
    goal_ref: string;
    request: HallForgeRequestRecord;
    binding: ForgeRootRepairBinding;
}): Array<{ event: HallCoordinationEventRecord; payload: GoalResumeV2ReceiptPayload }> {
    const ids = args.db.prepare(`
        SELECT event_id FROM hall_coordination_events
        WHERE repo_id = ? AND scope_kind = 'TARGET' AND scope_ref = ?
          AND event_kind = 'DECISION'
          AND json_extract(payload_json, '$.schema') = ?
        ORDER BY created_at ASC, event_id ASC LIMIT ?
    `).all(args.repo_id, args.goal_ref, GOAL_RESUME_V2_SCHEMA, MAX_HISTORY + 1) as Array<{ event_id: string }>;
    if (ids.length > MAX_HISTORY) throw new Error('goal_resume_v2_history_limit_exceeded');
    const entries = ids.map(({ event_id }) => {
        const event = readGoalResumeV2Event(args.db, event_id);
        return { event, payload: validateGoalResumeV2Event({ ...args, event }) };
    }).sort((left, right) => left.payload.resume_generation - right.payload.resume_generation);
    entries.forEach((entry, index) => {
        if (entry.payload.resume_generation !== index + 1
            || entry.payload.previous_resume_id !== (index === 0 ? null : entries[index - 1]!.event.event_id)) {
            throw new Error('goal_resume_v2_history_chain_invalid');
        }
    });
    return entries;
}
function buildV2AuthorizationProjection(args: {
    request: HallForgeRequestRecord;
    binding: ForgeRootRepairBinding;
    event: HallCoordinationEventRecord;
    payload: GoalResumeV2ReceiptPayload;
    identity: VerifiedCodexRequestIdentity;
}): ForgeGoalResumeV2AuthorizationProjection {
    return {
        schema: 'cstar.forge_goal_resume_authorization_projection.v2',
        action: 'continue',
        requester_lineage_mode: 'explicit_goal_continuation_v2',
        subject: { kind: 'bead', value: args.request.bead_id, repo_id: args.request.repo_id },
        scope_authority: {
            kind: 'request_bound_root_repair', goal_resume_id: args.payload.resume_id,
            request_id: args.request.request_id, request_sha256: args.request.request_sha256,
            root_repair_binding_sha256: args.binding.binding_sha256,
            root_repair_instruction_sha256: args.binding.repair_instruction_sha256,
            root_thread_id: args.binding.root_thread_id, root_turn_id: args.binding.root_turn_id,
            root_record_set_sha256: args.binding.root_record_set_sha256, event_sha256: eventSha256(args.event),
        },
        continuity_evidence: {
            operator_thread_id: args.identity.thread_id, operator_turn_id: args.identity.turn_id,
            operator_message_sha256: sha256Text('goal resume v2 authorization'),
            operator_record_sha256: args.identity.turn_record_sha256,
            operator_record_set_sha256: args.identity.turn_record_set_sha256,
            operator_record_count: args.identity.turn_record_count,
        },
    };
}
export function forgeGoalResumeV2AuthorizationProjectionJson(
    projection: ForgeGoalResumeV2AuthorizationProjection,
): string {
    return JSON.stringify(projection);
}
function parseV2AuthorizationProjection(value: string | undefined): ForgeGoalResumeV2AuthorizationProjection {
    let parsed: unknown;
    try { parsed = JSON.parse(value ?? ''); } catch { throw new Error('forge_goal_resume_v2_projection_invalid'); }
    if (!isRecord(parsed)) throw new Error('forge_goal_resume_v2_projection_invalid');
    const scope = parsed.scope_authority;
    const subject = parsed.subject;
    const evidence = parsed.continuity_evidence;
    if (!isRecord(scope) || !isRecord(subject) || !isRecord(evidence)
        || !exactKeys(parsed, ['schema', 'action', 'requester_lineage_mode', 'subject', 'scope_authority', 'continuity_evidence'])
        || !exactKeys(subject, ['kind', 'value', 'repo_id'])
        || !exactKeys(scope, ['kind', 'goal_resume_id', 'request_id', 'request_sha256', 'root_repair_binding_sha256', 'root_repair_instruction_sha256', 'root_thread_id', 'root_turn_id', 'root_record_set_sha256', 'event_sha256'])
        || !exactKeys(evidence, ['operator_thread_id', 'operator_turn_id', 'operator_message_sha256', 'operator_record_sha256', 'operator_record_set_sha256', 'operator_record_count'])
        || parsed.schema !== 'cstar.forge_goal_resume_authorization_projection.v2'
        || parsed.action !== 'continue' || parsed.requester_lineage_mode !== 'explicit_goal_continuation_v2'
        || subject.kind !== 'bead' || scope.kind !== 'request_bound_root_repair') {
        throw new Error('forge_goal_resume_v2_projection_invalid');
    }
    const projection = parsed as unknown as ForgeGoalResumeV2AuthorizationProjection;
    if (forgeGoalResumeV2AuthorizationProjectionJson(projection) !== value) {
        throw new Error('forge_goal_resume_v2_projection_not_canonical');
    }
    return projection;
}
export function isForgeGoalResumeV2ProjectionJson(value: string | undefined): boolean {
    try { return JSON.parse(value ?? '').schema === 'cstar.forge_goal_resume_authorization_projection.v2'; } catch { return false; }
}
function authorizationBinding(args: {
    request: HallForgeRequestRecord;
    projection: ForgeGoalResumeV2AuthorizationProjection;
}): string {
    return sha256(JSON.stringify({
        schema: 'cstar.forge_goal_resume_authorization_binding.v2',
        request_id: args.request.request_id, request_sha256: args.request.request_sha256,
        bead_id: args.request.bead_id, decision_id: args.request.decision_id,
        projection: JSON.parse(forgeGoalResumeV2AuthorizationProjectionJson(args.projection)),
    }));
}
export function validateForgeGoalResumeV2AuthorizationInput(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    input: AuthorizeForgeRequestInput;
    existingAuthorization: HallForgeAuthorizationRecord | null;
}): { projection: ForgeGoalResumeV2AuthorizationProjection; expected_binding_sha256: string } {
    const projection = parseV2AuthorizationProjection(args.input.operator_intent_json);
    if (args.existingAuthorization || args.request.status !== 'PENDING_AUTH') {
        throw new Error('forge_goal_resume_v2_requires_unspent_pending_request');
    }
    const checked = assertGoalResumeV2RequestAndBinding({
        db: args.db, repo_id: args.request.repo_id, request_id: args.request.request_id,
        request_sha256: args.request.request_sha256, request: args.request,
    });
    const event = readGoalResumeV2Event(args.db, projection.scope_authority.goal_resume_id);
    const payload = validateGoalResumeV2Event({
        event, repo_id: args.request.repo_id, request: checked.request, binding: checked.binding,
    });
    const expected = authorizationBinding({ request: args.request, projection });
    if (projection.subject.value !== args.request.bead_id || projection.subject.repo_id !== args.request.repo_id
        || projection.scope_authority.request_id !== args.request.request_id
        || projection.scope_authority.request_sha256 !== args.request.request_sha256
        || projection.scope_authority.root_repair_binding_sha256 !== checked.binding.binding_sha256
        || projection.scope_authority.root_repair_instruction_sha256 !== checked.binding.repair_instruction_sha256
        || projection.scope_authority.root_thread_id !== checked.binding.root_thread_id
        || projection.scope_authority.root_turn_id !== checked.binding.root_turn_id
        || projection.scope_authority.root_record_set_sha256 !== checked.binding.root_record_set_sha256
        || projection.scope_authority.event_sha256 !== eventSha256(event)
        || payload.resume_id !== projection.scope_authority.goal_resume_id
        || projection.continuity_evidence.operator_thread_id !== args.input.operator_thread_id || projection.continuity_evidence.operator_turn_id !== args.input.operator_turn_id
        || projection.continuity_evidence.operator_thread_id !== checked.binding.root_thread_id || projection.continuity_evidence.operator_turn_id === checked.binding.root_turn_id
        || projection.continuity_evidence.operator_message_sha256 !== args.input.operator_message_sha256
        || projection.continuity_evidence.operator_record_sha256 !== args.input.operator_record_sha256
        || projection.continuity_evidence.operator_record_set_sha256 !== args.input.operator_record_set_sha256
        || projection.continuity_evidence.operator_record_count !== args.input.operator_record_count
        || expected !== args.input.authorization_binding_sha256
        || args.input.operator_authorization_ref !== `cstar-forge-goal-resume-v2:${payload.resume_id}:${args.input.operator_record_set_sha256}`) {
        throw new Error('forge_goal_resume_v2_authorization_projection_invalid');
    }
    return { projection, expected_binding_sha256: expected };
}
export function verifyForgeGoalResumeV2Authority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    goalResumeId: string;
    identity: VerifiedCodexRequestIdentity;
}): {
    operator_intent_json: string;
    authorization_binding_sha256: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    authorized_at: number;
    expires_at: number;
} {
    const checked = assertGoalResumeV2RequestAndBinding({
        db: args.db, repo_id: args.request.repo_id, request_id: args.request.request_id,
        request_sha256: args.request.request_sha256, request: args.request,
    });
    const event = readGoalResumeV2Event(args.db, args.goalResumeId);
    const payload = validateGoalResumeV2Event({
        event, repo_id: args.request.repo_id, request: args.request, binding: checked.binding,
    });
    if (payload.resume_id !== args.goalResumeId || args.identity.thread_id !== checked.binding.root_thread_id) {
        throw new Error('forge_goal_resume_v2_current_root_lineage_invalid');
    }
    validateGoalResumeV2History({
        db: args.db, repo_id: args.request.repo_id, goal_ref: payload.goal_ref,
        request: args.request, binding: checked.binding,
    });
    const liveness = scanCurrentLiveness(args.identity);
    const authorizedAt = Date.parse(args.identity.turn_timestamp);
    if (!Number.isSafeInteger(authorizedAt)) throw new Error('forge_goal_resume_v2_authorization_timestamp_invalid');
    const projection = buildV2AuthorizationProjection({
        request: args.request, binding: checked.binding, event, payload, identity: args.identity,
    });
    const operatorMessageSha256 = liveness.message_sha256;
    projection.continuity_evidence.operator_message_sha256 = operatorMessageSha256;
    const intentJson = forgeGoalResumeV2AuthorizationProjectionJson(projection);
    const binding = authorizationBinding({ request: args.request, projection });
    return {
        operator_intent_json: intentJson,
        authorization_binding_sha256: binding,
        operator_authorization_ref: `cstar-forge-goal-resume-v2:${payload.resume_id}:${args.identity.turn_record_set_sha256}`,
        operator_thread_id: args.identity.thread_id,
        operator_turn_id: args.identity.turn_id,
        operator_message_sha256: operatorMessageSha256,
        operator_record_sha256: args.identity.turn_record_sha256,
        operator_record_set_sha256: args.identity.turn_record_set_sha256,
        operator_record_count: args.identity.turn_record_count,
        authorized_at: authorizedAt,
        expires_at: authorizedAt + 24 * 60 * 60 * 1_000,
    };
}
export function revalidateForgeGoalResumeV2Authority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    goalResumeId: string;
    identity: VerifiedCodexRequestIdentity;
    authority: Awaited<ReturnType<typeof verifyForgeGoalResumeV2Authority>>;
}): void {
    const checked = assertGoalResumeV2RequestAndBinding({
        db: args.db, repo_id: args.request.repo_id, request_id: args.request.request_id,
        request_sha256: args.request.request_sha256, request: args.request,
    });
    const current = verifyForgeGoalResumeV2Authority({
        db: args.db, request: args.request, goalResumeId: args.goalResumeId, identity: args.identity,
    });
    if (JSON.stringify(current) !== JSON.stringify(args.authority)
        || checked.binding.root_thread_id !== args.identity.thread_id) {
        throw new Error('forge_goal_resume_v2_authority_drift');
    }
}
export interface GoalResumeV2RecordResult {
    status: 'recorded' | 'replayed'; resume_id: string; goal_ref: string; resume_generation: number; previous_resume_id: string | null; event: HallCoordinationEventRecord;
}
export function recordGoalResumeV2(
    authority: GoalResumeV2Authority, root: string, repoId: string, now = Date.now(),
): GoalResumeV2RecordResult {
    return withImmediateHallCoordinationTransaction(root, () => {
        const db = database.getWritableDb(root);
        const current = getForgeRequest(db, authority.request.request_id);
        if (!current || stableJson(current) !== stableJson(authority.request)) {
            throw new Error('goal_resume_v2_request_drift_before_insert');
        }
        const checked = assertGoalResumeV2RequestAndBinding({ db, repo_id: repoId, request_id: current.request_id,
            request_sha256: current.request_sha256, request: current });
        if (stableJson(checked.binding) !== stableJson(authority.binding)) {
            throw new Error('goal_resume_v2_root_repair_binding_drift_before_insert');
        }
        const bead = db.prepare('SELECT repo_id, status FROM hall_beads WHERE bead_id = ? LIMIT 1').get(current.bead_id) as { repo_id?: string; status?: string } | undefined;
        if (!bead || bead.repo_id !== repoId || ['RESOLVED', 'ARCHIVED', 'SUPERSEDED'].includes(String(bead.status))) {
            throw new Error('goal_resume_v2_repair_bead_not_active');
        }
        const history = validateGoalResumeV2History({ db, repo_id: repoId, goal_ref: authority.goal_ref, request: current, binding: checked.binding });
        const reused = db.prepare(`SELECT event_id FROM hall_coordination_events WHERE repo_id = ?
            AND json_extract(payload_json, '$.schema') = ? AND json_extract(payload_json, '$.operator_record_set_sha256') = ?`).all(
                repoId, GOAL_RESUME_V2_SCHEMA, authority.identity.turn_record_set_sha256,
            ) as Array<{ event_id: string }>;
        if (reused.some((row) => row.event_id !== authority.resume_id)) throw new Error('goal_resume_v2_replay_conflict');
        const replay = history.find((entry) => entry.event.event_id === authority.resume_id);
        const previous = history.at(-1)?.event.event_id ?? null;
        if (replay) return {
            status: 'replayed', resume_id: authority.resume_id, goal_ref: authority.goal_ref,
            resume_generation: replay.payload.resume_generation,
            previous_resume_id: replay.payload.previous_resume_id, event: replay.event,
        };
        const generation = history.length + 1;
        const payload: GoalResumeV2ReceiptPayload = {
            schema: GOAL_RESUME_V2_SCHEMA, resume_id: authority.resume_id, resume_generation: generation,
            previous_resume_id: previous, goal_ref: authority.goal_ref, request_id: current.request_id,
            request_sha256: current.request_sha256, repo_id: repoId, request_bead_id: current.bead_id,
            decision_id: current.decision_id, root_repair_binding_schema: checked.binding.schema,
            root_repair_binding_sha256: checked.binding.binding_sha256,
            root_repair_instruction_sha256: checked.binding.repair_instruction_sha256,
            root_thread_id: checked.binding.root_thread_id, root_turn_id: checked.binding.root_turn_id,
            root_record_set_sha256: checked.binding.root_record_set_sha256,
            host_goal_snapshot_schema: authority.projection.host_goal_snapshot_schema,
            host_goal_thread_id: authority.projection.host_goal_thread_id,
            host_goal_objective_sha256: authority.projection.host_goal_objective_sha256,
            host_goal_snapshot_sha256: authority.projection.host_goal_snapshot_sha256,
            host_goal_status: authority.projection.host_goal_status,
            host_goal_created_at: authority.projection.host_goal_created_at,
            host_goal_updated_at: authority.projection.host_goal_updated_at,
            host_resume_capability: authority.projection.host_resume_capability,
            host_status_mutated: false, authority_effect: 'continuity_only',
            operator_thread_id: authority.identity.thread_id, operator_turn_id: authority.identity.turn_id,
            operator_resume_ref: authority.operator_resume_ref,
            operator_attestation_sha256: authority.operator_attestation_sha256,
            operator_message_sha256: authority.liveness.message_sha256,
            operator_record_sha256: authority.identity.turn_record_sha256,
            operator_record_set_sha256: authority.identity.turn_record_set_sha256,
            operator_record_count: authority.identity.turn_record_count,
            operator_record_first_timestamp: authority.identity.turn_first_timestamp,
            operator_timestamp: authority.identity.turn_timestamp,
            liveness_evidence_sha256: authority.liveness.liveness_evidence_sha256,
        };
        const event: HallCoordinationEventRecord = {
            event_id: authority.resume_id, repo_id: repoId, thread_id: authority.identity.thread_id,
            scope_kind: 'TARGET', scope_ref: authority.goal_ref, event_kind: 'DECISION',
            from_agent_id: `operator:${authority.identity.thread_id}`, to_agent_id: 'cstar:cos',
            session_id: authority.identity.thread_id, trace_id: authority.identity.turn_id,
            bead_id: current.bead_id, rationale: GOAL_RESUME_V2_RATIONALE, summary: GOAL_RESUME_V2_SUMMARY,
            payload: payload as unknown as Record<string, unknown>,
            metadata: { source: 'cstar-kernel-mcp', immutable: true }, created_at: now, updated_at: now,
        };
        insertImmutableHallCoordinationEvent(event, root);
        return {
            status: 'recorded', resume_id: authority.resume_id, goal_ref: authority.goal_ref,
            resume_generation: generation, previous_resume_id: previous, event,
        };
    });
}
