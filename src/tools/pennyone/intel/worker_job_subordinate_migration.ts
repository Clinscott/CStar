import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export const WORKER_JOB_MIGRATION_ID = 'cstar.subordinate_worker_jobs.v1';

interface SchemaObject {
    type: 'table' | 'index';
    name: string;
    sql: string;
}

const objects: readonly SchemaObject[] = [
    {
        type: 'table',
        name: 'hall_worker_job_migrations',
        sql: `CREATE TABLE hall_worker_job_migrations (
            migration_id TEXT PRIMARY KEY,
            schema_checksum TEXT NOT NULL CHECK(length(schema_checksum) = 64),
            applied_at INTEGER NOT NULL
        )`,
    },
    {
        type: 'table',
        name: 'hall_worker_jobs',
        sql: `CREATE TABLE hall_worker_jobs (
            job_id TEXT PRIMARY KEY,
            worker_kind TEXT NOT NULL CHECK(worker_kind IN ('forge', 'researcher')),
            bead_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            canonical_request_id TEXT NOT NULL,
            canonical_request_sha256 TEXT NOT NULL CHECK(length(canonical_request_sha256) = 64),
            authorization_id TEXT NOT NULL,
            authorization_expires_at INTEGER NOT NULL,
            adapter_runtime_binding_sha256 TEXT NOT NULL CHECK(length(adapter_runtime_binding_sha256) = 64),
            idempotency_key TEXT NOT NULL UNIQUE,
            execution_deadline_at INTEGER NOT NULL,
            attempt_id TEXT NOT NULL UNIQUE,
            objective TEXT NOT NULL,
            expected_artifacts_json TEXT NOT NULL,
            contract_sha256 TEXT NOT NULL CHECK(length(contract_sha256) = 64),
            state TEXT NOT NULL CHECK(state IN (
                'QUEUED', 'LEASED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED',
                'DELIVERED_UNVERIFIED', 'FAILED', 'UNKNOWN'
            )),
            progress_percent INTEGER NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
            progress_phase TEXT NOT NULL CHECK(progress_phase IN (
                'queued', 'preparing', 'working', 'validating', 'finalizing',
                'complete', 'unknown'
            )),
            provider_started INTEGER NOT NULL CHECK(provider_started IN (0, 1)),
            provider_requests_started INTEGER NOT NULL CHECK(provider_requests_started >= 0),
            provider_evidence_sha256 TEXT NOT NULL CHECK(length(provider_evidence_sha256) = 64),
            provider_evidence_observed_at INTEGER NOT NULL,
            spend_uncertain INTEGER NOT NULL CHECK(spend_uncertain IN (0, 1)),
            known_spend_observed INTEGER NOT NULL CHECK(known_spend_observed IN (0, 1)),
            spend_evidence_sha256 TEXT NOT NULL CHECK(length(spend_evidence_sha256) = 64),
            spend_evidence_observed_at INTEGER NOT NULL,
            cancel_requested_at INTEGER,
            cancel_reason TEXT,
            failure_code TEXT,
            failure_summary TEXT,
            version INTEGER NOT NULL CHECK(version >= 1),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            terminal_at INTEGER,
            CHECK(execution_deadline_at <= authorization_expires_at),
            UNIQUE(canonical_request_id, attempt_id)
        )`,
    },
    {
        type: 'table',
        name: 'hall_worker_job_leases',
        sql: `CREATE TABLE hall_worker_job_leases (
            job_id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL UNIQUE,
            lease_owner_id TEXT NOT NULL,
            lease_token_sha256 TEXT NOT NULL CHECK(length(lease_token_sha256) = 64),
            leased_at INTEGER NOT NULL,
            lease_expires_at INTEGER NOT NULL,
            heartbeat_at INTEGER NOT NULL,
            CHECK(lease_expires_at > leased_at),
            CHECK(heartbeat_at >= leased_at),
            FOREIGN KEY(job_id) REFERENCES hall_worker_jobs(job_id)
        )`,
    },
    {
        type: 'table',
        name: 'hall_worker_job_artifacts',
        sql: `CREATE TABLE hall_worker_job_artifacts (
            artifact_id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            attempt_id TEXT NOT NULL,
            artifact_kind TEXT NOT NULL CHECK(artifact_kind IN (
                'report', 'patch', 'package', 'dataset', 'test_result', 'other'
            )),
            name TEXT NOT NULL,
            media_type TEXT NOT NULL,
            byte_count INTEGER NOT NULL CHECK(byte_count BETWEEN 1 AND 67108864),
            sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
            storage_ref TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN (
                'STAGED', 'DELIVERED_UNVERIFIED', 'REJECTED'
            )),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(job_id, attempt_id, name, artifact_kind),
            FOREIGN KEY(job_id) REFERENCES hall_worker_jobs(job_id)
        )`,
    },
    {
        type: 'table',
        name: 'hall_worker_job_events',
        sql: `CREATE TABLE hall_worker_job_events (
            event_id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            attempt_id TEXT NOT NULL,
            event_kind TEXT NOT NULL,
            state TEXT NOT NULL,
            progress_percent INTEGER NOT NULL,
            progress_phase TEXT NOT NULL,
            evidence_sha256 TEXT,
            detail TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(job_id) REFERENCES hall_worker_jobs(job_id)
        )`,
    },
    {
        type: 'index',
        name: 'idx_hall_worker_jobs_state',
        sql: `CREATE INDEX idx_hall_worker_jobs_state
            ON hall_worker_jobs(state, created_at, job_id)`,
    },
    {
        type: 'index',
        name: 'idx_hall_worker_job_leases_expiry',
        sql: `CREATE INDEX idx_hall_worker_job_leases_expiry
            ON hall_worker_job_leases(lease_expires_at, job_id)`,
    },
    {
        type: 'index',
        name: 'idx_hall_worker_job_artifacts_job',
        sql: `CREATE INDEX idx_hall_worker_job_artifacts_job
            ON hall_worker_job_artifacts(job_id, status, created_at)`,
    },
    {
        type: 'index',
        name: 'idx_hall_worker_job_events_job',
        sql: `CREATE INDEX idx_hall_worker_job_events_job
            ON hall_worker_job_events(job_id, created_at, event_id)`,
    },
];

function normalizeSql(sql: string): string {
    return sql.trim().replace(/;$/, '').replace(/\s+/g, ' ').toLowerCase();
}

export const WORKER_JOB_MIGRATION_CHECKSUM = crypto
    .createHash('sha256')
    .update(objects.map((entry) => `${entry.type}:${entry.name}:${normalizeSql(entry.sql)}`).join('\n'))
    .digest('hex');

function presentObjects(db: Database.Database): Map<string, { type: string; sql: string }> {
    const names = objects.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT type, name, sql FROM sqlite_master
        WHERE name IN (${names}) AND type IN ('table', 'index')
    `).all(...objects.map((entry) => entry.name)) as Array<{
        type: string;
        name: string;
        sql: string;
    }>;
    return new Map(rows.map((row) => [row.name, { type: row.type, sql: row.sql }]));
}

function assertExactObjects(db: Database.Database): void {
    const present = presentObjects(db);
    if (present.size !== objects.length) {
        throw new Error('worker_job_migration_partial_schema');
    }
    for (const expected of objects) {
        const actual = present.get(expected.name);
        if (actual?.type !== expected.type
            || normalizeSql(actual.sql) !== normalizeSql(expected.sql)) {
            throw new Error(`worker_job_migration_incompatible_object:${expected.name}`);
        }
    }
    const ledger = db.prepare(`
        SELECT schema_checksum FROM hall_worker_job_migrations
        WHERE migration_id = ?
    `).get(WORKER_JOB_MIGRATION_ID) as { schema_checksum?: string } | undefined;
    if (ledger?.schema_checksum !== WORKER_JOB_MIGRATION_CHECKSUM) {
        throw new Error('worker_job_migration_checksum_mismatch');
    }
}

export function assertCurrentWorkerJobLedgerSchema(db: Database.Database): void {
    assertExactObjects(db);
}

export interface SyntheticWorkerJobMigrationOptions {
    now?: number;
    faultInjector?: (createdObject: string) => void;
}

/**
 * Explicit synthetic-Hall migration. It opens and caches nothing.
 * The caller owns the supplied database handle and its lifecycle.
 */
export function migrateSyntheticWorkerJobLedger(
    db: Database.Database,
    options: SyntheticWorkerJobMigrationOptions = {},
): 'created' | 'current' {
    if (db.inTransaction) {
        throw new Error('worker_job_migration_requires_outermost_transaction');
    }
    const migrate = db.transaction(() => {
        const present = presentObjects(db);
        if (present.size === objects.length) {
            assertExactObjects(db);
            return 'current' as const;
        }
        if (present.size !== 0) {
            throw new Error('worker_job_migration_partial_schema');
        }
        for (const entry of objects) {
            db.exec(entry.sql);
            options.faultInjector?.(entry.name);
        }
        db.prepare(`
            INSERT INTO hall_worker_job_migrations (
                migration_id, schema_checksum, applied_at
            ) VALUES (?, ?, ?)
        `).run(
            WORKER_JOB_MIGRATION_ID,
            WORKER_JOB_MIGRATION_CHECKSUM,
            options.now ?? Date.now(),
        );
        assertExactObjects(db);
        return 'created' as const;
    });
    return migrate.immediate();
}
