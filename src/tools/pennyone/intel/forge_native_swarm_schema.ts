import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export const NATIVE_CONNECTION_GENERATIONS_TABLE = 'hall_forge_connection_generations' as const;
export const NATIVE_CONNECTION_TOMBSTONES_TABLE = 'hall_forge_connection_tombstones' as const;
export const NATIVE_RUNS_TABLE = 'hall_forge_native_runs' as const;
export const NATIVE_WORKER_RECEIPTS_TABLE = 'hall_forge_native_worker_receipts' as const;

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
    connection_outcome TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_hall_forge_native_runs_connection ON hall_forge_native_runs(connection_id, created_at);
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

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function tableExists(db: Database.Database, name: string): boolean {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function countRows(db: Database.Database, table: string): number {
    return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

export type NativeSchemaMigrationReceipt = {
    schema: 'cstar.forge_native_swarm_migration_receipt.v1';
    before_schema_sha256: string;
    after_schema_sha256: string;
    existing_table_counts: Record<string, number>;
    foreign_key_check: { table: string; violations: unknown[] }[];
    idempotent_replay: boolean;
};

function schemaDigest(db: Database.Database): string {
    const rows = db.prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    ).all() as Array<Record<string, unknown>>;
    return sha256(JSON.stringify(rows));
}

function scopedForeignKeyCheck(db: Database.Database): { table: string; violations: unknown[] }[] {
    return [NATIVE_RUNS_TABLE, NATIVE_WORKER_RECEIPTS_TABLE]
        .filter((table) => tableExists(db, table))
        .map((table) => ({
            table,
            violations: db.prepare(`PRAGMA main.foreign_key_check(${table})`).all(),
        }));
}

export function ensureForgeNativeSwarmSchema(db: Database.Database): void {
    db.pragma('foreign_keys = ON');
    db.transaction(() => db.exec(FORGE_NATIVE_SCHEMA_SQL)).immediate();
    const violations = scopedForeignKeyCheck(db).find((entry) => entry.violations.length > 0);
    if (violations) throw new Error('forge_native_swarm_schema_foreign_key_check_failed');
}

export function rehearseForgeNativeSwarmMigration(db: Database.Database): NativeSchemaMigrationReceipt {
    const before = schemaDigest(db);
    const existing = ['hall_forge_requests', 'hall_forge_authorizations', 'hall_forge_attempts', 'hall_beads']
        .filter((table) => tableExists(db, table))
        .reduce<Record<string, number>>((result, table) => {
            result[table] = countRows(db, table);
            return result;
        }, {});
    ensureForgeNativeSwarmSchema(db);
    const replayBefore = schemaDigest(db);
    ensureForgeNativeSwarmSchema(db);
    const after = schemaDigest(db);
    if (replayBefore !== after) throw new Error('forge_native_swarm_schema_replay_drift');
    const afterCounts = Object.fromEntries(Object.entries(existing).map(([table]) => [table, countRows(db, table)]));
    if (JSON.stringify(existing) !== JSON.stringify(afterCounts)) {
        throw new Error('forge_native_swarm_schema_existing_rows_changed');
    }
    const checks = scopedForeignKeyCheck(db);
    if (checks.some((entry) => entry.violations.length > 0)) {
        throw new Error('forge_native_swarm_schema_foreign_key_check_failed');
    }
    return {
        schema: 'cstar.forge_native_swarm_migration_receipt.v1',
        before_schema_sha256: before,
        after_schema_sha256: after,
        existing_table_counts: existing,
        foreign_key_check: checks,
        idempotent_replay: true,
    };
}
