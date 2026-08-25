import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    ForgeNativeError,
    hashNative,
    isCanonicalAbsolutePath,
    type ForgeNativeAuthorityScope,
} from '../../../types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema, forgeNativeSchemaPresent, NATIVE_CONNECTION_GENERATIONS_TABLE, NATIVE_CONNECTION_TOMBSTONES_TABLE } from './forge_native_swarm_schema.js';

export const FORGE_LEGACY_CONNECTIONS = ['forge-v3-codex-host-handoff', 'forge-v2-hermes-minimax'] as const;
export type ForgeConnectionTombstone = {
    connection_id: string;
    generation: number;
    connection_outcome: 'REJECTED_FINAL_CANONICAL_ATTEMPT' | 'RETIRED';
    executable: false;
    historical: true;
    replacement_connection_id: typeof FORGE_NATIVE_CONNECTION_ID;
    replacement_request_id: string | null;
    reason: string;
    created_at: number;
    metadata_json: string;
};
export type ForgeQuarantineFile = { source_relative_path: string; original_path: string; byte_count: number; sha256: string; mode: number };
export type ForgeQuarantineManifest = {
    schema: 'cstar.forge_native_quarantine_manifest.v1'; generation: string; replacement_connection_id: typeof FORGE_NATIVE_CONNECTION_ID;
    source_root: string; source_branch: string; source_head: string; dirty_state_sha256: string; reason: string; timestamp: string;
    files: ForgeQuarantineFile[]; manifest_sha256: string;
};
function stable(value: unknown): string { return JSON.stringify(value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : value); }
function ensureCopiedSchema(db: Database.Database, copiedState: boolean | undefined): void {
    if (forgeNativeSchemaPresent(db)) return;
    const filename = String((db.prepare('PRAGMA database_list').all()[0] as { file?: string } | undefined)?.file ?? '');
    const memory = filename === '' || filename === ':memory:';
    if (!copiedState && !memory) throw new ForgeNativeError('forge_native_live_migration_forbidden');
    ensureForgeNativeSwarmSchema(db);
}
export function tombstoneForgeConnection(
    db: Database.Database,
    input: Omit<ForgeConnectionTombstone, 'created_at' | 'metadata_json'> & { created_at?: number; metadata?: Record<string, unknown>; copied_state?: boolean },
): { replayed: boolean; tombstone: ForgeConnectionTombstone } {
    ensureCopiedSchema(db, input.copied_state);
    if (input.connection_id === FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_connection_tombstone_forbidden');
    if (!FORGE_LEGACY_CONNECTIONS.includes(input.connection_id as typeof FORGE_LEGACY_CONNECTIONS[number])) throw new ForgeNativeError('forge_connection_id_unknown');
    if (!Number.isInteger(input.generation) || input.generation < 1) throw new ForgeNativeError('forge_connection_generation_invalid');
    if (!input.reason?.trim()) throw new ForgeNativeError('forge_connection_tombstone_reason_missing');
    const row: ForgeConnectionTombstone = {
        connection_id: input.connection_id, generation: input.generation, connection_outcome: input.connection_outcome,
        executable: false, historical: true, replacement_connection_id: FORGE_NATIVE_CONNECTION_ID,
        replacement_request_id: input.replacement_request_id, reason: input.reason.trim(), created_at: input.created_at ?? Date.now(),
        metadata_json: stable(input.metadata ?? {}),
    };
    const existing = db.prepare(`SELECT * FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(input.connection_id) as ForgeConnectionTombstone | undefined;
    if (existing) {
        if (stable(existing) !== stable(row)) throw new ForgeNativeError('forge_connection_tombstone_conflict');
        return { replayed: true, tombstone: existing };
    }
    db.prepare(`INSERT INTO ${NATIVE_CONNECTION_TOMBSTONES_TABLE}
        (connection_id, generation, connection_outcome, executable, historical, replacement_connection_id, replacement_request_id, reason, created_at, metadata_json)
        VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`).run(row.connection_id, row.generation, row.connection_outcome, row.replacement_connection_id, row.replacement_request_id, row.reason, row.created_at, row.metadata_json);
    return { replayed: false, tombstone: row };
}
export function assertForgeConnectionExecutable(db: Database.Database, connectionId: string): void {
    if (!forgeNativeSchemaPresent(db)) throw new ForgeNativeError('forge_native_schema_missing');
    const tombstone = db.prepare(`SELECT executable FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(connectionId) as { executable?: number } | undefined;
    if (connectionId !== FORGE_NATIVE_CONNECTION_ID) {
        throw new ForgeNativeError(tombstone ? 'forge_connection_generation_rejected' : 'forge_connection_generation_unknown');
    }
    if (tombstone && tombstone.executable !== 1) throw new ForgeNativeError('forge_native_generation_tombstoned');
    const generation = db.prepare(`SELECT status, executable FROM ${NATIVE_CONNECTION_GENERATIONS_TABLE} WHERE connection_id = ?`).get(connectionId) as { status?: string; executable?: number } | undefined;
    if (!generation) throw new ForgeNativeError('forge_native_generation_unbound');
    if (generation.status !== 'ACTIVE' || generation.executable !== 1) throw new ForgeNativeError('forge_native_generation_inactive');
}
export function listForgeConnectionHistory(db: Database.Database): ForgeConnectionTombstone[] {
    if (!forgeNativeSchemaPresent(db)) throw new ForgeNativeError('forge_native_schema_missing');
    return db.prepare(`SELECT * FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} ORDER BY created_at, connection_id`).all() as ForgeConnectionTombstone[];
}
function fileDigest(file: Buffer): string { return createHash('sha256').update(file).digest('hex'); }
export function buildForgeQuarantineManifest(input: {
    source_root: string; generation: string; source_branch: string; source_head: string; dirty_state_sha256: string; reason: string; timestamp?: string; allowlist: string[];
}): ForgeQuarantineManifest {
    if (!isCanonicalAbsolutePath(input.source_root)) throw new ForgeNativeError('forge_quarantine_source_root_invalid');
    if (!/^[a-f0-9]{40,64}$/.test(input.source_head) || !/^[a-f0-9]{64}$/.test(input.dirty_state_sha256)) throw new ForgeNativeError('forge_quarantine_binding_invalid');
    const files: ForgeQuarantineFile[] = [];
    for (const relative of [...new Set(input.allowlist)].sort()) {
        if (!relative || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part === '..' || part === '.')) throw new ForgeNativeError('forge_quarantine_path_invalid');
        const originalPath = path.join(input.source_root, relative); const stat = fs.lstatSync(originalPath, { throwIfNoEntry: false });
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new ForgeNativeError('forge_quarantine_file_invalid');
        const bytes = fs.readFileSync(originalPath);
        files.push({ source_relative_path: relative, original_path: originalPath, byte_count: bytes.byteLength, sha256: fileDigest(bytes), mode: stat.mode & 0o777 });
    }
    const base = { schema: 'cstar.forge_native_quarantine_manifest.v1' as const, generation: input.generation, replacement_connection_id: FORGE_NATIVE_CONNECTION_ID, source_root: input.source_root, source_branch: input.source_branch, source_head: input.source_head, dirty_state_sha256: input.dirty_state_sha256, reason: input.reason, timestamp: input.timestamp ?? new Date().toISOString(), files };
    return { ...base, manifest_sha256: hashNative(base) };
}
export function assertForgeQuarantineManifestUnchanged(manifest: ForgeQuarantineManifest): void {
    const { manifest_sha256: _digest, ...base } = manifest;
    if (hashNative(base) !== manifest.manifest_sha256) throw new ForgeNativeError('forge_quarantine_manifest_digest_mismatch');
    for (const file of manifest.files) {
        const stat = fs.lstatSync(file.original_path, { throwIfNoEntry: false });
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new ForgeNativeError('forge_quarantine_source_drift');
        const bytes = fs.readFileSync(file.original_path);
        if (bytes.byteLength !== file.byte_count || fileDigest(bytes) !== file.sha256) throw new ForgeNativeError('forge_quarantine_source_drift');
    }
}
export function quarantineScopeFromManifest(manifest: ForgeQuarantineManifest): Pick<ForgeNativeAuthorityScope, 'quarantine_allowlist'> {
    return { quarantine_allowlist: manifest.files.map((file) => file.original_path).sort() };
}
