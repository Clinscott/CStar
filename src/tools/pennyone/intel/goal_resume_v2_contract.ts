import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^dispatch-forge-[a-f0-9]{32}$/;
const GOAL_RESUME_V2_ID = /^goal-resume-v2:[a-f0-9]{64}$/;
const MAX_REFERENCE_LENGTH = 240;
const MAX_OBJECTIVE_BYTES = 64 * 1024;

export const GOAL_RESUME_V2_SCHEMA = 'cstar.host_goal_resume.v2' as const;
export const HOST_GOAL_PROJECTION_SCHEMA = 'cstar.host_get_goal_projection.v1' as const;
export const HOST_GOAL_SNAPSHOT_SCHEMA = 'cstar.host_goal_snapshot.v1' as const;
export const GOAL_RESUME_V2_RATIONALE = 'Operator resumed the unchanged Forge request while the host goal remains blocked.';
export const GOAL_RESUME_V2_SUMMARY = 'Continuity-only host goal resume v2 receipt; host goal status remains blocked.';

export interface HostGoalProjectionInput {
    schema: typeof HOST_GOAL_PROJECTION_SCHEMA;
    threadId: string;
    /** Hashing uses these exact UTF-8 bytes; no trim or Unicode normalization is applied. */
    objective: string;
    status: 'blocked';
    tokensUsed: number;
    timeUsedSeconds: number;
    createdAt: number;
    updatedAt: number;
    hostResumeCapability: 'unavailable';
}

/** Canonical receipt material excludes raw objective and transient counters. */
export interface CanonicalHostGoalProjection {
    host_goal_snapshot_schema: typeof HOST_GOAL_SNAPSHOT_SCHEMA;
    host_goal_thread_id: string;
    host_goal_objective_sha256: string;
    host_goal_snapshot_sha256: string;
    host_goal_status: 'blocked';
    host_goal_created_at: number;
    host_goal_updated_at: number;
    host_resume_capability: 'unavailable';
}

export interface GoalResumeV2Args {
    forge_request_receipt_id: string;
    request_sha256: string;
    host_goal_projection: HostGoalProjectionInput;
}

export interface GoalResumeV2ReceiptPayload {
    schema: typeof GOAL_RESUME_V2_SCHEMA;
    resume_id: string;
    resume_generation: number;
    previous_resume_id: string | null;
    goal_ref: string;
    request_id: string;
    request_sha256: string;
    repo_id: string;
    request_bead_id: string;
    decision_id: string;
    root_repair_binding_schema: string;
    root_repair_binding_sha256: string;
    root_repair_instruction_sha256: string;
    root_thread_id: string;
    root_turn_id: string;
    root_record_set_sha256: string;
    host_goal_snapshot_schema: typeof HOST_GOAL_SNAPSHOT_SCHEMA;
    host_goal_thread_id: string;
    host_goal_objective_sha256: string;
    host_goal_snapshot_sha256: string;
    host_goal_status: 'blocked';
    host_goal_created_at: number;
    host_goal_updated_at: number;
    host_resume_capability: 'unavailable';
    host_status_mutated: false;
    authority_effect: 'continuity_only';
    operator_thread_id: string;
    operator_turn_id: string;
    operator_resume_ref: string;
    operator_attestation_sha256: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    operator_record_first_timestamp: string;
    operator_timestamp: string;
    liveness_evidence_sha256: string;
}

export const GOAL_RESUME_V2_RECEIPT_KEYS = [
    'authority_effect', 'decision_id', 'goal_ref', 'host_goal_created_at',
    'host_goal_objective_sha256', 'host_goal_snapshot_schema',
    'host_goal_snapshot_sha256', 'host_goal_status', 'host_goal_thread_id',
    'host_goal_updated_at', 'host_resume_capability', 'host_status_mutated',
    'liveness_evidence_sha256', 'operator_attestation_sha256',
    'operator_message_sha256', 'operator_record_count', 'operator_record_first_timestamp',
    'operator_record_set_sha256', 'operator_record_sha256', 'operator_resume_ref',
    'operator_thread_id', 'operator_timestamp', 'operator_turn_id', 'previous_resume_id',
    'repo_id', 'request_bead_id', 'request_id', 'request_sha256', 'resume_generation',
    'resume_id', 'root_repair_binding_schema', 'root_repair_binding_sha256',
    'root_repair_instruction_sha256', 'root_record_set_sha256', 'root_thread_id',
    'root_turn_id', 'schema',
].sort();

function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const actual = Object.keys(value).sort();
    const canonicalExpected = [...expected].sort();
    return actual.length === canonicalExpected.length
        && actual.every((key, index) => key === canonicalExpected[index]);
}

function reference(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REFERENCE_LENGTH
        || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error(`goal_resume_v2_${name}_invalid`);
    }
    return value;
}

function hash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`goal_resume_v2_${name}_invalid`);
    }
    return value;
}

function integer(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`goal_resume_v2_${name}_invalid`);
    }
    return value;
}

function timestampPair(createdAt: unknown, updatedAt: unknown): [number, number] {
    const created = integer(createdAt, 'created_at');
    const updated = integer(updatedAt, 'updated_at');
    if (created > updated) throw new Error('goal_resume_v2_timestamp_order_invalid');
    return [created, updated];
}

function materialJson(projection: Omit<CanonicalHostGoalProjection, 'host_goal_snapshot_sha256'>): string {
    // This explicit order is the v2 snapshot hash boundary. Counters are transient and excluded.
    return JSON.stringify({
        schema: projection.host_goal_snapshot_schema,
        host_goal_thread_id: projection.host_goal_thread_id,
        host_goal_objective_sha256: projection.host_goal_objective_sha256,
        host_goal_status: projection.host_goal_status,
        host_goal_created_at: projection.host_goal_created_at,
        host_goal_updated_at: projection.host_goal_updated_at,
        host_resume_capability: projection.host_resume_capability,
    });
}

export function canonicalizeGoalResumeV2Args(value: unknown): {
    request_id: string;
    request_sha256: string;
    projection: CanonicalHostGoalProjection;
} {
    if (!isRecord(value) || !exactKeys(value, [
        'forge_request_receipt_id', 'request_sha256', 'host_goal_projection',
    ])) throw new Error('goal_resume_v2_input_shape_invalid');
    if (typeof value.forge_request_receipt_id !== 'string'
        || !REQUEST_ID.test(value.forge_request_receipt_id)) {
        throw new Error('goal_resume_v2_request_id_invalid');
    }
    if (typeof value.request_sha256 !== 'string' || !SHA256.test(value.request_sha256)) {
        throw new Error('goal_resume_v2_request_sha256_invalid');
    }
    const input = value.host_goal_projection;
    if (!isRecord(input) || !exactKeys(input, [
        'schema', 'threadId', 'objective', 'status', 'tokensUsed', 'timeUsedSeconds',
        'createdAt', 'updatedAt', 'hostResumeCapability',
    ])) throw new Error('goal_resume_v2_projection_shape_invalid');
    if (input.schema !== HOST_GOAL_PROJECTION_SCHEMA) {
        throw new Error('goal_resume_v2_projection_schema_invalid');
    }
    const threadId = reference(input.threadId, 'projection_thread_id');
    if (typeof input.objective !== 'string' || input.objective.length === 0
        || Buffer.byteLength(input.objective, 'utf8') > MAX_OBJECTIVE_BYTES) {
        throw new Error('goal_resume_v2_objective_invalid');
    }
    if (input.status !== 'blocked') throw new Error('goal_resume_v2_status_invalid');
    if (input.hostResumeCapability !== 'unavailable') {
        throw new Error('goal_resume_v2_capability_invalid');
    }
    integer(input.tokensUsed, 'tokens_used');
    integer(input.timeUsedSeconds, 'time_used_seconds');
    const [createdAt, updatedAt] = timestampPair(input.createdAt, input.updatedAt);
    const objectiveSha256 = sha256(Buffer.from(input.objective, 'utf8'));
    const withoutSnapshotHash = {
        host_goal_snapshot_schema: HOST_GOAL_SNAPSHOT_SCHEMA,
        host_goal_thread_id: threadId,
        host_goal_objective_sha256: objectiveSha256,
        host_goal_status: 'blocked' as const,
        host_goal_created_at: createdAt,
        host_goal_updated_at: updatedAt,
        host_resume_capability: 'unavailable' as const,
    };
    return {
        request_id: value.forge_request_receipt_id,
        request_sha256: value.request_sha256,
        projection: {
            ...withoutSnapshotHash,
            host_goal_snapshot_sha256: sha256(materialJson(withoutSnapshotHash)),
        },
    };
}

export function buildGoalResumeV2GoalRef(values: {
    request_id: string;
    request_sha256: string;
    projection: CanonicalHostGoalProjection;
}): string {
    return `codex-goal-v2:${sha256(JSON.stringify({
        schema: 'cstar.host_goal_ref.v2',
        request_id: values.request_id,
        request_sha256: values.request_sha256,
        host_goal_thread_id: values.projection.host_goal_thread_id,
        host_goal_objective_sha256: values.projection.host_goal_objective_sha256,
    }))}`;
}

export function hashCanonicalGoalProjectionMaterial(
    projection: Omit<CanonicalHostGoalProjection, 'host_goal_snapshot_sha256'>,
): string {
    return sha256(materialJson(projection));
}

export function buildGoalResumeV2OperatorResumeRef(
    threadId: string,
    turnId: string,
    recordSetSha256: string,
): string {
    return `codex-thread:${threadId}:turn:${turnId}:record-set-sha256:${recordSetSha256}`;
}

export function buildGoalResumeV2LivenessEvidenceSha256(values: {
    thread_id: string;
    turn_id: string;
    turn_record_sha256: string;
    turn_record_set_sha256: string;
    turn_record_count: number;
    first_timestamp: string;
    timestamp: string;
    message_sha256: string;
}): string {
    return sha256(JSON.stringify({
        schema: 'cstar.host_goal_resume_liveness.v2',
        decision: 'clear',
        thread_id: values.thread_id,
        turn_id: values.turn_id,
        turn_record_sha256: values.turn_record_sha256,
        turn_record_set_sha256: values.turn_record_set_sha256,
        turn_record_count: values.turn_record_count,
        first_timestamp: values.first_timestamp,
        timestamp: values.timestamp,
        message_sha256: values.message_sha256,
    }));
}

export function buildGoalResumeV2OperatorAttestationSha256(values: {
    thread_id: string;
    turn_id: string;
    operator_resume_ref: string;
    message_sha256: string;
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
    record_first_timestamp: string;
    operator_timestamp: string;
    liveness_evidence_sha256: string;
}): string {
    return sha256(JSON.stringify({
        schema: 'cstar.host_goal_resume_operator_attestation.v2',
        intent: 'goal_resume_v2',
        thread_id: values.thread_id,
        turn_id: values.turn_id,
        operator_resume_ref: values.operator_resume_ref,
        message_sha256: values.message_sha256,
        record_sha256: values.record_sha256,
        record_set_sha256: values.record_set_sha256,
        record_count: values.record_count,
        record_first_timestamp: values.record_first_timestamp,
        operator_timestamp: values.operator_timestamp,
        liveness_evidence_sha256: values.liveness_evidence_sha256,
    }));
}

export function buildGoalResumeV2ResumeId(values: {
    request_id: string;
    request_sha256: string;
    goal_ref: string;
    request_bead_id: string;
    decision_id: string;
    root_repair_binding_sha256: string;
    root_repair_instruction_sha256: string;
    root_thread_id: string;
    root_turn_id: string;
    root_record_set_sha256: string;
    projection: CanonicalHostGoalProjection;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_record_set_sha256: string;
    operator_attestation_sha256: string;
    liveness_evidence_sha256: string;
}): string {
    return `goal-resume-v2:${sha256(JSON.stringify({
        schema: 'cstar.host_goal_resume_id.v2',
        request_id: values.request_id,
        request_sha256: values.request_sha256,
        goal_ref: values.goal_ref,
        request_bead_id: values.request_bead_id,
        decision_id: values.decision_id,
        root_repair_binding_sha256: values.root_repair_binding_sha256,
        root_repair_instruction_sha256: values.root_repair_instruction_sha256,
        root_thread_id: values.root_thread_id,
        root_turn_id: values.root_turn_id,
        root_record_set_sha256: values.root_record_set_sha256,
        host_goal_snapshot_sha256: values.projection.host_goal_snapshot_sha256,
        operator_thread_id: values.operator_thread_id,
        operator_turn_id: values.operator_turn_id,
        operator_record_set_sha256: values.operator_record_set_sha256,
        operator_attestation_sha256: values.operator_attestation_sha256,
        liveness_evidence_sha256: values.liveness_evidence_sha256,
    }))}`;
}

export function isGoalResumeV2Id(value: string): boolean {
    return GOAL_RESUME_V2_ID.test(value);
}

export function isGoalResumeV1Id(value: string): boolean {
    return /^goal-resume:[a-f0-9]{64}$/.test(value);
}

export function sha256Text(value: string): string {
    return sha256(Buffer.from(value, 'utf8'));
}
