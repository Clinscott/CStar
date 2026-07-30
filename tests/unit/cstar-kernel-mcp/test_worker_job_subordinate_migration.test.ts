import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    assertCurrentWorkerJobLedgerSchema,
    migrateSyntheticWorkerJobLedger,
    WORKER_JOB_MIGRATION_CHECKSUM,
    WORKER_JOB_MIGRATION_ID,
} from '../../../src/tools/pennyone/intel/worker_job_subordinate_migration.js';

const expectedObjects = [
    'hall_worker_job_migrations',
    'hall_worker_jobs',
    'hall_worker_job_leases',
    'hall_worker_job_artifacts',
    'hall_worker_job_events',
    'idx_hall_worker_jobs_state',
    'idx_hall_worker_job_leases_expiry',
    'idx_hall_worker_job_artifacts_job',
    'idx_hall_worker_job_events_job',
];

function workerObjects(db: Database.Database): string[] {
    return (db.prepare(`
        SELECT name FROM sqlite_master
        WHERE name LIKE 'hall_worker_job_%'
           OR name LIKE 'idx_hall_worker_job_%'
        ORDER BY name
    `).pluck().all() as string[]);
}

describe('subordinate worker-job synthetic migration', () => {
    it('uses one outer BEGIN IMMEDIATE and records the schema checksum', () => {
        const statements: string[] = [];
        const db = new Database(':memory:', { verbose: (sql) => statements.push(sql) });

        assert.equal(migrateSyntheticWorkerJobLedger(db, { now: 1234 }), 'created');
        assert.deepEqual(workerObjects(db), [...expectedObjects].sort());
        assert.deepEqual(
            db.prepare('SELECT * FROM hall_worker_job_migrations').get(),
            {
                migration_id: WORKER_JOB_MIGRATION_ID,
                schema_checksum: WORKER_JOB_MIGRATION_CHECKSUM,
                applied_at: 1234,
            },
        );
        assert.equal(
            statements.filter((sql) => sql.trim().toUpperCase() === 'BEGIN IMMEDIATE').length,
            1,
        );
        assert.equal(
            statements.filter((sql) => /^BEGIN\b/i.test(sql.trim())).length,
            1,
        );
        db.close();
    });

    it('accepts exact-current objects idempotently and caches no database state', () => {
        const first = new Database(':memory:');
        const second = new Database(':memory:');

        assert.equal(migrateSyntheticWorkerJobLedger(first), 'created');
        assert.equal(migrateSyntheticWorkerJobLedger(first), 'current');
        assert.equal(migrateSyntheticWorkerJobLedger(second), 'created');
        assertCurrentWorkerJobLedgerSchema(first);
        assertCurrentWorkerJobLedgerSchema(second);
        assert.equal(
            first.prepare('SELECT COUNT(*) FROM hall_worker_job_migrations').pluck().get(),
            1,
        );
        assert.equal(
            second.prepare('SELECT COUNT(*) FROM hall_worker_job_migrations').pluck().get(),
            1,
        );
        first.close();
        second.close();
    });

    it('fails closed on a partial schema without creating another object', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE hall_worker_jobs (job_id TEXT PRIMARY KEY)');
        const before = workerObjects(db);

        assert.throws(
            () => migrateSyntheticWorkerJobLedger(db),
            /worker_job_migration_partial_schema/,
        );
        assert.deepEqual(workerObjects(db), before);
        db.close();
    });

    it('fails closed when every named object exists but one shape is incompatible', () => {
        const db = new Database(':memory:');
        migrateSyntheticWorkerJobLedger(db);
        db.exec(`
            DROP INDEX idx_hall_worker_job_events_job;
            CREATE INDEX idx_hall_worker_job_events_job
            ON hall_worker_job_events(event_kind)
        `);

        assert.throws(
            () => migrateSyntheticWorkerJobLedger(db),
            /worker_job_migration_incompatible_object:idx_hall_worker_job_events_job/,
        );
        db.close();
    });

    it('rejects a checksum-bearing ledger row that does not match current source', () => {
        const db = new Database(':memory:');
        migrateSyntheticWorkerJobLedger(db);
        db.prepare(`
            UPDATE hall_worker_job_migrations
            SET schema_checksum = ?
            WHERE migration_id = ?
        `).run('f'.repeat(64), WORKER_JOB_MIGRATION_ID);

        assert.throws(
            () => migrateSyntheticWorkerJobLedger(db),
            /worker_job_migration_checksum_mismatch/,
        );
        db.close();
    });

    it('rolls back every created object when migration fails mid-transaction', () => {
        const db = new Database(':memory:');

        assert.throws(
            () => migrateSyntheticWorkerJobLedger(db, {
                faultInjector(createdObject) {
                    if (createdObject === 'hall_worker_job_artifacts') {
                        throw new Error('synthetic_migration_fault');
                    }
                },
            }),
            /synthetic_migration_fault/,
        );
        assert.deepEqual(workerObjects(db), []);
        db.close();
    });

    it('rejects nested invocation so the migration owns its BEGIN IMMEDIATE boundary', () => {
        const db = new Database(':memory:');
        db.exec('BEGIN');
        assert.throws(
            () => migrateSyntheticWorkerJobLedger(db),
            /worker_job_migration_requires_outermost_transaction/,
        );
        db.exec('ROLLBACK');
        assert.deepEqual(workerObjects(db), []);
        db.close();
    });
});
