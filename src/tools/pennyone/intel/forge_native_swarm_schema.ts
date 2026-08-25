import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ForgeNativeError, stableNativeJson } from '../../../types/forge_native_swarm.js';

export const NATIVE_CONNECTION_GENERATIONS_TABLE = 'hall_forge_connection_generations' as const;
export const NATIVE_CONNECTION_TOMBSTONES_TABLE = 'hall_forge_connection_tombstones' as const;
export const NATIVE_RUNS_TABLE = 'hall_forge_native_runs' as const;
export const NATIVE_WORKER_RECEIPTS_TABLE = 'hall_forge_native_worker_receipts' as const;

const NATIVE_TABLES = [
    NATIVE_CONNECTION_GENERATIONS_TABLE,
    NATIVE_CONNECTION_TOMBSTONES_TABLE,
    NATIVE_RUNS_TABLE,
    NATIVE_WORKER_RECEIPTS_TABLE,
] as const;

/** Additive copied-state schema. It never alters legacy table definitions or rows. */
export const FORGE_NATIVE_SCHEMA_SQL = String.raw`
CREATE TABLE IF NOT EXISTS hall_forge_connection_generations (
    connection_id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL CHECK (generation > 0),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED', 'TOMBSTONED')),
    executable INTEGER NOT NULL CHECK (executable IN (0, 1)),
    policy_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hall_forge_connection_tombstones (
    connection_id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL CHECK (generation > 0),
    connection_outcome TEXT NOT NULL CHECK (connection_outcome IN ('REJECTED_FINAL_CANONICAL_ATTEMPT', 'RETIRED')),
    executable INTEGER NOT NULL DEFAULT 0 CHECK (executable = 0),
    historical INTEGER NOT NULL DEFAULT 1 CHECK (historical = 1),
    replacement_connection_id TEXT,
    replacement_request_id TEXT,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hall_forge_native_runs (
    run_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
    connection_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation > 0),
    set_batch_id TEXT NOT NULL,
    authority_scope_json TEXT NOT NULL,
    source_identity_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    lease_id TEXT NOT NULL UNIQUE,
    lease_expires_at INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('RESERVED', 'PLANNED', 'RUNNING', 'DELIVERED_UNVERIFIED', 'CANCEL_REQUESTED', 'CANCELLED', 'UNKNOWN')),
    plan_sha256 TEXT,
    worker_package_json TEXT NOT NULL,
    control_receipt_json TEXT NOT NULL,
    aggregate_receipt_json TEXT,
    completion_fingerprint_sha256 TEXT,
    unresolved_gaps_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (request_id) REFERENCES hall_forge_requests(request_id)
);
CREATE INDEX IF NOT EXISTS idx_hall_forge_native_runs_state ON hall_forge_native_runs(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_hall_forge_native_runs_connection ON hall_forge_native_runs(connection_id, generation, created_at);
CREATE TABLE IF NOT EXISTS hall_forge_native_worker_receipts (
    receipt_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    work_item_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    task_id TEXT NOT NULL,
    parent_task_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'leaf')),
    state TEXT NOT NULL CHECK (state IN ('PLANNED', 'SPAWNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN')),
    receipt_sha256 TEXT NOT NULL CHECK (length(receipt_sha256) = 64),
    receipt_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (run_id) REFERENCES hall_forge_native_runs(run_id),
    UNIQUE (run_id, work_item_id),
    UNIQUE (run_id, idempotency_key),
    UNIQUE (run_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_hall_forge_native_worker_receipts_run ON hall_forge_native_worker_receipts(run_id, created_at);
CREATE TRIGGER IF NOT EXISTS hall_forge_native_worker_receipts_immutable_update
BEFORE UPDATE ON hall_forge_native_worker_receipts
BEGIN
    SELECT RAISE(ABORT, 'forge_native_worker_receipt_immutable');
END;
CREATE TRIGGER IF NOT EXISTS hall_forge_native_worker_receipts_immutable_delete
BEFORE DELETE ON hall_forge_native_worker_receipts
BEGIN
    SELECT RAISE(ABORT, 'forge_native_worker_receipt_immutable');
END;
`;

function tableExists(db: Database.Database, name: string): boolean {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function scalar<T>(db: Database.Database, sql: string): T {
    return db.prepare(sql).get() as T;
}

function schemaRows(db: Database.Database): Array<Record<string, unknown>> {
    return db.prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    ).all() as Array<Record<string, unknown>>;
}

export function forgeNativeSchemaDigest(db: Database.Database): string {
    return createHash('sha256').update(stableNativeJson(schemaRows(db)), 'utf8').digest('hex');
}

export function forgeNativeSchemaPresent(db: Database.Database): boolean {
    return NATIVE_TABLES.every((table) => tableExists(db, table));
}

export function assertForgeNativeSchemaPresent(db: Database.Database): void {
    const missing = NATIVE_TABLES.filter((table) => !tableExists(db, table));
    if (missing.length) throw new ForgeNativeError(`forge_native_schema_missing:${missing.join(',')}`);
}

export function scopedNativeForeignKeyCheck(db: Database.Database): { table: string; violations: unknown[] }[] {
    assertForgeNativeSchemaPresent(db);
    return [NATIVE_RUNS_TABLE, NATIVE_WORKER_RECEIPTS_TABLE].map((table) => ({
        table,
        violations: db.prepare(`PRAGMA main.foreign_key_check(${table})`).all(),
    }));
}

export function ensureForgeNativeSwarmSchema(
    db: Database.Database,
    options: { copied_state?: boolean } = {},
): void {
    const filename = databaseFilename(db);
    const isFileDatabase = filename !== '' && filename !== ':memory:';
    if (isFileDatabase && options.copied_state !== true) {
        throw new ForgeNativeError('forge_native_live_migration_forbidden');
    }
    db.pragma('foreign_keys = ON');
    db.transaction(() => db.exec(FORGE_NATIVE_SCHEMA_SQL)).immediate();
    if (scopedNativeForeignKeyCheck(db).some((item) => item.violations.length > 0)) {
        throw new ForgeNativeError('forge_native_swarm_schema_foreign_key_check_failed');
    }
}

function databaseFilename(db: Database.Database): string {
    const row = db.prepare('PRAGMA database_list').all()[0] as { file?: string } | undefined;
    return row?.file ?? '';
}

export type NativeSchemaMigrationReceipt = {
    schema: 'cstar.forge_native_swarm_migration_receipt.v1';
    before_schema_sha256: string;
    after_schema_sha256: string;
    existing_table_counts: Record<string, number>;
    foreign_key_check: { table: string; violations: unknown[] }[];
    idempotent_replay: true;
    copied_state: true;
};

export function rehearseForgeNativeSwarmMigration(
    db: Database.Database,
    options: { copied_state?: boolean } = {},
): NativeSchemaMigrationReceipt {
    const filename = databaseFilename(db);
    const isFileDatabase = filename !== '' && filename !== ':memory:';
    if (isFileDatabase && options.copied_state !== true) {
        throw new ForgeNativeError('forge_native_live_migration_forbidden');
    }

    const before = forgeNativeSchemaDigest(db);
    const existingTableCounts = [
        'hall_forge_requests',
        'hall_forge_authorizations',
        'hall_forge_attempts',
        'hall_beads',
    ].filter((table) => tableExists(db, table)).reduce<Record<string, number>>((out, table) => {
        out[table] = Number(scalar<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`).count);
        return out;
    }, {});

    ensureForgeNativeSwarmSchema(db, { copied_state: options.copied_state === true });
    const replayBefore = forgeNativeSchemaDigest(db);
    ensureForgeNativeSwarmSchema(db, { copied_state: options.copied_state === true });
    const after = forgeNativeSchemaDigest(db);
    if (replayBefore !== after) throw new ForgeNativeError('forge_native_swarm_schema_replay_drift');

    for (const [table, count] of Object.entries(existingTableCounts)) {
        const actual = Number(scalar<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`).count);
        if (actual !== count) throw new ForgeNativeError('forge_native_swarm_schema_existing_rows_changed');
    }

    const foreignKeyCheck = scopedNativeForeignKeyCheck(db);
    if (foreignKeyCheck.some((item) => item.violations.length > 0)) {
        throw new ForgeNativeError('forge_native_swarm_schema_foreign_key_check_failed');
    }
    return {
        schema: 'cstar.forge_native_swarm_migration_receipt.v1',
        before_schema_sha256: before,
        after_schema_sha256: after,
        existing_table_counts: existingTableCounts,
        foreign_key_check: foreignKeyCheck,
        idempotent_replay: true,
        copied_state: true,
    };
}
