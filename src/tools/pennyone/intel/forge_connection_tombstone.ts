import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { FORGE_NATIVE_CONNECTION_ID, ForgeNativeError } from '../../../types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema, NATIVE_CONNECTION_TOMBSTONES_TABLE } from './forge_native_swarm_schema.js';

export const FORGE_LEGACY_CONNECTIONS = [
    'forge-v3-codex-host-handoff',
    'forge-v2-hermes-minimax',
] as const;

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

export type ForgeQuarantineFile = {
    source_relative_path: string;
    original_path: string;
    byte_count: number;
    sha256: string;
    mode: number;
};

export type ForgeQuarantineManifest = {
    schema: 'cstar.forge_native_quarantine_manifest.v1';
    generation: string;
    replacement_connection_id: typeof FORGE_NATIVE_CONNECTION_ID;
    source_root: string;
    source_branch: string;
    source_head: string;
    dirty_state_sha256: string;
    reason: string;
    timestamp: string;
    files: ForgeQuarantineFile[];
    manifest_sha256: string;
};

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function digest(value: unknown): string {
    return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function tombstoneForgeConnection(
    db: Database.Database,
    input: Omit<ForgeConnectionTombstone, 'created_at' | 'metadata_json'> & { created_at?: number; metadata?: Record<string, unknown> },
): { replayed: boolean; tombstone: ForgeConnectionTombstone } {
    ensureForgeNativeSwarmSchema(db);
    if (input.connection_id === FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_connection_tombstone_forbidden');
    if (!FORGE_LEGACY_CONNECTIONS.includes(input.connection_id as typeof FORGE_LEGACY_CONNECTIONS[number])) {
        throw new ForgeNativeError('forge_connection_id_unknown');
    }
    const row: ForgeConnectionTombstone = {
        connection_id: input.connection_id,
        generation: input.generation,
        connection_outcome: input.connection_outcome,
        executable: false,
        historical: true,
        replacement_connection_id: FORGE_NATIVE_CONNECTION_ID,
        replacement_request_id: input.replacement_request_id,
        reason: input.reason,
        created_at: input.created_at ?? Date.now(),
        metadata_json: stable(input.metadata ?? {}),
    };
    const existing = db.prepare(`SELECT * FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(input.connection_id) as ForgeConnectionTombstone | undefined;
    if (existing) {
        if (stable(existing) !== stable(row)) throw new ForgeNativeError('forge_connection_tombstone_conflict');
        return { replayed: true, tombstone: existing };
    }
    db.prepare(`INSERT INTO ${NATIVE_CONNECTION_TOMBSTONES_TABLE}
        (connection_id, generation, connection_outcome, executable, historical, replacement_connection_id,
         replacement_request_id, reason, created_at, metadata_json)
        VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`)
        .run(row.connection_id, row.generation, row.connection_outcome, row.replacement_connection_id,
            row.replacement_request_id, row.reason, row.created_at, row.metadata_json);
    return { replayed: false, tombstone: row };
}

export function assertForgeConnectionExecutable(db: Database.Database, connectionId: string): void {
    ensureForgeNativeSwarmSchema(db);
    if (connectionId !== FORGE_NATIVE_CONNECTION_ID) {
        const code = connectionId === 'forge-v2-hermes-minimax'
            ? 'forge_connection_generation_retired'
            : 'forge_connection_generation_rejected';
        throw new ForgeNativeError(code);
    }
    const tombstone = db.prepare(`SELECT executable FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`).get(connectionId) as { executable?: number } | undefined;
    if (tombstone && tombstone.executable !== 1) throw new ForgeNativeError('forge_connection_generation_tombstoned');
}

export function listForgeConnectionHistory(db: Database.Database): ForgeConnectionTombstone[] {
    ensureForgeNativeSwarmSchema(db);
    return db.prepare(`SELECT * FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} ORDER BY created_at, connection_id`).all() as ForgeConnectionTombstone[];
}

export function buildForgeQuarantineManifest(input: {
    source_root: string;
    generation: string;
    source_branch: string;
    source_head: string;
    dirty_state_sha256: string;
    reason: string;
    timestamp?: string;
    allowlist: string[];
}): ForgeQuarantineManifest {
    if (!path.isAbsolute(input.source_root) || path.resolve(input.source_root) !== input.source_root) {
        throw new ForgeNativeError('forge_quarantine_source_root_invalid');
    }
    const files: ForgeQuarantineFile[] = [];
    for (const relative of [...new Set(input.allowlist)].sort()) {
        if (path.isAbsolute(relative) || relative.split('/').some((part) => part === '..' || part === '.')) {
            throw new ForgeNativeError('forge_quarantine_path_invalid');
        }
        const originalPath = path.join(input.source_root, relative);
        const stat = fs.lstatSync(originalPath, { throwIfNoEntry: false });
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
            throw new ForgeNativeError('forge_quarantine_file_invalid');
        }
        const bytes = fs.readFileSync(originalPath);
        files.push({
            source_relative_path: relative,
            original_path: originalPath,
            byte_count: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            mode: stat.mode & 0o777,
        });
    }
    const base = {
        schema: 'cstar.forge_native_quarantine_manifest.v1' as const,
        generation: input.generation,
        replacement_connection_id: FORGE_NATIVE_CONNECTION_ID,
        source_root: input.source_root,
        source_branch: input.source_branch,
        source_head: input.source_head,
        dirty_state_sha256: input.dirty_state_sha256,
        reason: input.reason,
        timestamp: input.timestamp ?? new Date().toISOString(),
        files,
    };
    return { ...base, manifest_sha256: digest(base) };
}

export function assertForgeQuarantineManifestUnchanged(
    manifest: ForgeQuarantineManifest,
): void {
    const expected = digest({
        schema: manifest.schema,
        generation: manifest.generation,
        replacement_connection_id: manifest.replacement_connection_id,
        source_root: manifest.source_root,
        source_branch: manifest.source_branch,
        source_head: manifest.source_head,
        dirty_state_sha256: manifest.dirty_state_sha256,
        reason: manifest.reason,
        timestamp: manifest.timestamp,
        files: manifest.files,
    });
    if (expected !== manifest.manifest_sha256) throw new ForgeNativeError('forge_quarantine_manifest_digest_mismatch');
    for (const file of manifest.files) {
        const stat = fs.lstatSync(file.original_path, { throwIfNoEntry: false });
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new ForgeNativeError('forge_quarantine_source_drift');
        const bytes = fs.readFileSync(file.original_path);
        if (bytes.byteLength !== file.byte_count || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
            throw new ForgeNativeError('forge_quarantine_source_drift');
        }
    }
}
