import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REFERENCE_LENGTH = 240;
const MAX_OBJECTIVE_BYTES = 64 * 1024;

/** Versioned host projection. The raw objective is input-only and is never returned. */
export const HOST_GOAL_SNAPSHOT_SCHEMA = 'cstar.host_goal_snapshot.v1' as const;

/** Host timestamps are stable nonnegative integer seconds, not milliseconds. */
export type HostGoalSnapshotTimestamp = number;

export interface HostGoalSnapshotInput {
    schema: typeof HOST_GOAL_SNAPSHOT_SCHEMA;
    threadId: string;
    /** Hashing uses these exact UTF-8 bytes; no trim or Unicode normalization is applied. */
    objective: string;
    status: 'blocked';
    hostResumeCapability: 'unavailable';
    createdAt: HostGoalSnapshotTimestamp;
    updatedAt: HostGoalSnapshotTimestamp;
}

/** Canonical material contains the objective digest, never the raw objective. */
export interface CanonicalHostGoalSnapshotMaterial {
    schema: typeof HOST_GOAL_SNAPSHOT_SCHEMA;
    host_goal_thread_id: string;
    objective_sha256: string;
    status: 'blocked';
    created_at: HostGoalSnapshotTimestamp;
    updated_at: HostGoalSnapshotTimestamp;
    host_resume_capability: 'unavailable';
}

export interface CanonicalHostGoalSnapshot {
    material: CanonicalHostGoalSnapshotMaterial;
    objectiveSha256: string;
    snapshotSha256: string;
    serialized: string;
}

const INPUT_KEYS = [
    'createdAt',
    'hostResumeCapability',
    'objective',
    'schema',
    'status',
    'threadId',
    'updatedAt',
].sort();
const MATERIAL_KEYS = [
    'created_at',
    'host_goal_thread_id',
    'host_resume_capability',
    'objective_sha256',
    'schema',
    'status',
    'updated_at',
].sort();

function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function requireReference(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0
        || value.length > MAX_REFERENCE_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error(`goal_resume_snapshot_${name}_invalid`);
    }
    return value;
}

function requireTimestamp(value: unknown, name: string): HostGoalSnapshotTimestamp {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`goal_resume_snapshot_${name}_invalid`);
    }
    return value;
}

function requireTimestampPair(createdAt: unknown, updatedAt: unknown): [number, number] {
    const created = requireTimestamp(createdAt, 'created_at');
    const updated = requireTimestamp(updatedAt, 'updated_at');
    if (created > updated) throw new Error('goal_resume_snapshot_timestamp_order_invalid');
    return [created, updated];
}

function requireHash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`goal_resume_snapshot_${name}_invalid`);
    }
    return value;
}

/**
 * This object literal is the canonical field order. Volatile host counters
 * `tokensUsed` and `timeUsedSeconds` are intentionally not part of this schema.
 */
export function serializeHostGoalSnapshotMaterial(
    material: CanonicalHostGoalSnapshotMaterial,
): string {
    return JSON.stringify({
        schema: material.schema,
        host_goal_thread_id: material.host_goal_thread_id,
        objective_sha256: material.objective_sha256,
        status: material.status,
        created_at: material.created_at,
        updated_at: material.updated_at,
        host_resume_capability: material.host_resume_capability,
    });
}

export function hashHostGoalSnapshotMaterial(
    material: CanonicalHostGoalSnapshotMaterial,
): string {
    return sha256(serializeHostGoalSnapshotMaterial(material));
}

function parseCanonicalMaterial(value: unknown): CanonicalHostGoalSnapshotMaterial {
    if (!isRecord(value) || !hasExactKeys(value, MATERIAL_KEYS)) {
        throw new Error('goal_resume_snapshot_material_shape_invalid');
    }
    if (value.schema !== HOST_GOAL_SNAPSHOT_SCHEMA) {
        throw new Error('goal_resume_snapshot_schema_invalid');
    }
    const [createdAt, updatedAt] = requireTimestampPair(value.created_at, value.updated_at);
    const material: CanonicalHostGoalSnapshotMaterial = {
        schema: HOST_GOAL_SNAPSHOT_SCHEMA,
        host_goal_thread_id: requireReference(value.host_goal_thread_id, 'thread_id'),
        objective_sha256: requireHash(value.objective_sha256, 'objective_hash'),
        status: value.status === 'blocked'
            ? 'blocked'
            : (() => { throw new Error('goal_resume_snapshot_status_invalid'); })(),
        created_at: createdAt,
        updated_at: updatedAt,
        host_resume_capability: value.host_resume_capability === 'unavailable'
            ? 'unavailable'
            : (() => { throw new Error('goal_resume_snapshot_capability_invalid'); })(),
    };
    return material;
}

export function verifyCanonicalHostGoalSnapshotMaterial(
    value: unknown,
    expectedSnapshotSha256: string,
    expectedObjectiveSha256?: string,
): CanonicalHostGoalSnapshotMaterial {
    const material = parseCanonicalMaterial(value);
    const snapshotSha256 = requireHash(expectedSnapshotSha256, 'snapshot_hash');
    if (expectedObjectiveSha256 !== undefined
        && requireHash(expectedObjectiveSha256, 'objective_hash') !== material.objective_sha256) {
        throw new Error('goal_resume_snapshot_objective_hash_mismatch');
    }
    if (hashHostGoalSnapshotMaterial(material) !== snapshotSha256) {
        throw new Error('goal_resume_snapshot_hash_mismatch');
    }
    return material;
}

export function canonicalizeHostGoalSnapshot(
    value: unknown,
    suppliedObjectiveSha256?: string,
    suppliedSnapshotSha256?: string,
): CanonicalHostGoalSnapshot {
    if (!isRecord(value) || !hasExactKeys(value, INPUT_KEYS)) {
        throw new Error('goal_resume_host_goal_snapshot_required');
    }
    if (value.schema !== HOST_GOAL_SNAPSHOT_SCHEMA) {
        throw new Error('goal_resume_snapshot_schema_invalid');
    }
    if (value.status !== 'blocked') {
        throw new Error('goal_resume_host_status_must_remain_blocked');
    }
    if (value.hostResumeCapability !== 'unavailable') {
        throw new Error('goal_resume_host_capability_must_be_unavailable');
    }
    if (typeof value.objective !== 'string' || value.objective.length === 0
        || Buffer.byteLength(value.objective, 'utf8') > MAX_OBJECTIVE_BYTES) {
        throw new Error('goal_resume_snapshot_objective_invalid');
    }
    const objectiveSha256 = sha256(Buffer.from(value.objective, 'utf8'));
    const [createdAt, updatedAt] = requireTimestampPair(value.createdAt, value.updatedAt);
    const material: CanonicalHostGoalSnapshotMaterial = {
        schema: HOST_GOAL_SNAPSHOT_SCHEMA,
        host_goal_thread_id: requireReference(value.threadId, 'thread_id'),
        objective_sha256: objectiveSha256,
        status: 'blocked',
        created_at: createdAt,
        updated_at: updatedAt,
        host_resume_capability: 'unavailable',
    };
    const serialized = serializeHostGoalSnapshotMaterial(material);
    const snapshotSha256 = sha256(serialized);
    if (suppliedObjectiveSha256 !== undefined
        && requireHash(suppliedObjectiveSha256, 'objective_hash') !== objectiveSha256) {
        throw new Error('goal_resume_snapshot_objective_hash_mismatch');
    }
    if (suppliedSnapshotSha256 !== undefined
        && requireHash(suppliedSnapshotSha256, 'snapshot_hash') !== snapshotSha256) {
        throw new Error('goal_resume_snapshot_hash_mismatch');
    }
    return { material, objectiveSha256, snapshotSha256, serialized };
}
