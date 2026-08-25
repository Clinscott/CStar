import type Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_GENERATION,
    ForgeNativeError,
    intersectNativeAuthority,
    type ForgeNativeAuthorityScope,
    type NativeAuthorityIntersectionInput,
    type NativeAuthorityIntersectionResult,
} from '../../../types/forge_native_swarm.js';
import { assertForgeNativeSchemaPresent, NATIVE_CONNECTION_GENERATIONS_TABLE, NATIVE_CONNECTION_TOMBSTONES_TABLE } from './forge_native_swarm_schema.js';

export type NativeGenerationRecord = {
    connection_id: string;
    generation: number;
    status: 'ACTIVE' | 'RETIRED' | 'TOMBSTONED';
    executable: 0 | 1;
    policy_json: string;
    created_at: number;
    updated_at: number;
};
export type NativeAuthorityBinding = NativeAuthorityIntersectionResult & {
    request_id: string;
    request_sha256: string;
    connection_id: typeof FORGE_NATIVE_CONNECTION_ID;
    generation: number;
};

export function nativeConnectionSelected(value: unknown): boolean {
    return typeof value === 'string' && value.trim() === FORGE_NATIVE_CONNECTION_ID;
}
export function assertNativeConnectionSelected(value: unknown): void {
    if (!nativeConnectionSelected(value)) throw new ForgeNativeError('forge_native_connection_not_selected');
}
export function readNativeGeneration(db: Database.Database, connectionId = FORGE_NATIVE_CONNECTION_ID): NativeGenerationRecord | null {
    assertForgeNativeSchemaPresent(db);
    return (db.prepare(`SELECT connection_id, generation, status, executable, policy_json, created_at, updated_at FROM ${NATIVE_CONNECTION_GENERATIONS_TABLE} WHERE connection_id = ?`).get(connectionId) as NativeGenerationRecord | undefined) ?? null;
}
export function assertNativeGenerationActive(
    db: Database.Database,
    connectionId = FORGE_NATIVE_CONNECTION_ID,
    generation: number = FORGE_NATIVE_GENERATION,
): NativeGenerationRecord {
    assertForgeNativeSchemaPresent(db);
    if (connectionId !== FORGE_NATIVE_CONNECTION_ID) {
        const tombstone = db.prepare(`SELECT connection_id FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(connectionId);
        throw new ForgeNativeError(tombstone ? 'forge_connection_generation_rejected' : 'forge_connection_generation_unknown');
    }
    const row = readNativeGeneration(db, connectionId);
    if (!row) throw new ForgeNativeError('forge_native_generation_unbound');
    if (row.generation !== generation || row.status !== 'ACTIVE' || row.executable !== 1) {
        throw new ForgeNativeError('forge_native_generation_inactive');
    }
    const tombstone = db.prepare(`SELECT executable FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(connectionId) as { executable?: number } | undefined;
    if (tombstone && tombstone.executable !== 1) throw new ForgeNativeError('forge_native_generation_tombstoned');
    return row;
}
export function assertConnectionCannotExecute(db: Database.Database, connectionId: string): void {
    assertForgeNativeSchemaPresent(db);
    const row = db.prepare(`SELECT executable, status FROM ${NATIVE_CONNECTION_GENERATIONS_TABLE} WHERE connection_id = ?`).get(connectionId) as { executable?: number; status?: string } | undefined;
    const tombstone = db.prepare(`SELECT 1 FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(connectionId);
    if (tombstone || !row || row.executable !== 1 || row.status !== 'ACTIVE') throw new ForgeNativeError('forge_connection_generation_rejected');
}
export function intersectDurableNativeAuthority(input: NativeAuthorityIntersectionInput): NativeAuthorityBinding {
    const result = intersectNativeAuthority(input);
    return {
        ...result,
        request_id: result.effective_scope.request_id,
        request_sha256: result.effective_scope.request_sha256,
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: result.effective_scope.generation ?? FORGE_NATIVE_GENERATION,
    };
}
export function assertNativeScopeDigest(scope: ForgeNativeAuthorityScope, expected: string): void {
    const actual = intersectNativeAuthority({ durable_set: scope, immutable_request: scope, connection_policy: scope, run_lease: scope }).scope_sha256;
    if (actual !== expected) throw new ForgeNativeError('forge_native_scope_digest_mismatch');
}
