import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';

import { ensureForgeRequestCorrectionSchema } from
    '../../../src/tools/pennyone/intel/forge_request_correction_schema.js';
import { HALL_SCHEMA_CORE_SQL } from
    '../../../src/tools/pennyone/intel/schema_tables_core.js';

function createLegacyRequestStore(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    db.exec(`
        CREATE TABLE hall_forge_requests (
            request_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            bead_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            operator_authorization_ref TEXT,
            operator_thread_id TEXT,
            operator_turn_id TEXT,
            operator_message_sha256 TEXT,
            operator_record_sha256 TEXT,
            operator_record_set_sha256 TEXT,
            operator_record_count INTEGER,
            requester_thread_id TEXT,
            requester_turn_id TEXT,
            requester_record_set_sha256 TEXT,
            authorization_profile TEXT,
            authorization_binding_sha256 TEXT,
            authorization_challenge_sha256 TEXT,
            request_sha256 TEXT NOT NULL,
            request_summary_json TEXT NOT NULL,
            adapter_ref TEXT,
            write_capability TEXT,
            target_paths_sha256 TEXT NOT NULL,
            live_source_allowed INTEGER NOT NULL,
            max_attempts INTEGER NOT NULL,
            status TEXT NOT NULL,
            active_attempt_id TEXT,
            authorized_at INTEGER,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            UNIQUE(bead_id, decision_id),
            UNIQUE(operator_authorization_ref),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );
    `);
    db.exec(HALL_SCHEMA_CORE_SQL);
    db.prepare(`
        INSERT INTO hall_repositories (
            repo_id, root_path, name, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 1)
    `).run('repo:correction', '/tmp/correction', 'correction');
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, rationale, created_at, updated_at
        ) VALUES (?, ?, 'correction fixture', 1, 1)
    `).run('bead:correction', 'repo:correction');
    const requestId = `dispatch-forge-${'1'.repeat(32)}`;
    db.prepare(`
        INSERT INTO hall_forge_requests (
            request_id, repo_id, bead_id, decision_id,
            requester_thread_id, requester_turn_id, requester_record_set_sha256,
            authorization_profile, request_sha256, request_summary_json,
            adapter_ref, write_capability, target_paths_sha256,
            live_source_allowed, max_attempts, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'root_user_forge_intent_v1',
                  ?, ?, ?, 'project_files', ?, 0, 1, 'PENDING_AUTH', 10, 10)
    `).run(
        requestId, 'repo:correction', 'bead:correction',
        'decision:correction', 'root-thread', 'root-turn', '2'.repeat(64),
        '3'.repeat(64), '{"schema":"cstar.forge_request.v3","immutable":true}',
        'cstar-forge-hermes-minimax-worker-adapter', '4'.repeat(64),
    );
    db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            authorized_at, expires_at, created_at
        ) VALUES (
            'authorization:preserved', ?, ?, 'root_user_forge_intent_v1',
            ?, '{}', 'operator:preserved', 'root-thread', 'root-turn',
            ?, ?, ?, 1, 1, 2, 1
        )
    `).run(requestId, '3'.repeat(64), '5'.repeat(64), '6'.repeat(64),
        '7'.repeat(64), '8'.repeat(64));
    db.prepare(`
        INSERT INTO hall_forge_attempts (
            attempt_id, request_id, ordinal, idempotency_key,
            execution_receipt_id, adapter_ref, status, reserved_at, updated_at
        ) VALUES (
            'attempt:preserved', ?, 1, 'idempotency:preserved',
            'receipt:preserved', 'adapter:preserved', 'FAILED_FINAL', 1, 1
        )
    `).run(requestId);
    db.prepare(`
        INSERT INTO hall_forge_preprovider_continuations (
            continuation_id, request_id, attempt_id, cycle_ordinal,
            failure_code, failure_fingerprint_sha256, execution_trace_sha256,
            zero_provider_proof_sha256, zero_provider_proof_json,
            continuation_authority_sha256, prior_runtime_sha256,
            provider_attempted, proof_valid, status, created_at, updated_at
        ) VALUES (
            'continuation:preserved', ?, 'attempt:preserved', 1,
            'fixture_failure', ?, ?, ?, '{}', ?, ?,
            0, 1, 'PENDING_REPAIR', 1, 1
        )
    `).run(requestId, '9'.repeat(64), 'a'.repeat(64), 'b'.repeat(64),
        'c'.repeat(64), 'd'.repeat(64));
    return db;
}

type ForeignKeyRow = {
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
};

function foreignKeyRows(db: Database.Database): ForeignKeyRow[] {
    return (db.prepare('PRAGMA foreign_key_check').all() as ForeignKeyRow[])
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function forgeDependencyShape(db: Database.Database): Record<string, unknown[]> {
    return Object.fromEntries([
        'hall_forge_authorizations',
        'hall_forge_attempts',
        'hall_forge_preprovider_continuations',
    ].map((table) => [table, db.prepare(`PRAGMA foreign_key_list(${table})`).all()]));
}

function seedUnrelatedForeignKeyDebt(db: Database.Database): ForeignKeyRow[] {
    db.pragma('foreign_keys = OFF');
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, rationale, created_at, updated_at
        ) VALUES ('bead:legacy-debt', 'repo:missing', 'legacy debt', 2, 2)
    `).run();
    const insertBulkDebt = db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, rationale, created_at, updated_at
        ) VALUES (?, 'repo:missing', 'legacy bulk debt', 2, 2)
    `);
    for (let index = 0; index < 95; index += 1) {
        insertBulkDebt.run(`bead:legacy-debt:${String(index).padStart(2, '0')}`);
    }
    db.prepare(`
        INSERT INTO hall_lessons (
            lesson_id, repo_id, level, title, content, created_at, updated_at
        ) VALUES ('lesson:legacy-debt', 'repo:missing', 'L1', 'debt', 'debt', 2, 2)
    `).run();
    db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, scan_id, verdict, created_at
        ) VALUES ('validation:legacy-debt', 'repo:correction', 'scan:missing', 'INCONCLUSIVE', 2)
    `).run();
    db.pragma('foreign_keys = ON');
    return foreignKeyRows(db);
}

describe('Forge request correction schema', () => {
    it('preserves legacy rows and repairs the exact active-decision index', () => {
        const db = createLegacyRequestStore();
        const before = db.prepare(
            'SELECT * FROM hall_forge_requests',
        ).get() as Record<string, unknown>;
        ensureForgeRequestCorrectionSchema(db);
        const after = db.prepare(
            'SELECT * FROM hall_forge_requests',
        ).get() as Record<string, unknown>;
        for (const [key, value] of Object.entries(before)) {
            assert.deepEqual(after[key], value, key);
        }
        assert.equal(after.superseded_by, null);
        assert.equal(after.supersedes_request_id, null);
        assert.equal(db.prepare(
            'SELECT request_id FROM hall_forge_attempts WHERE attempt_id = ?',
        ).pluck().get('attempt:preserved'), before.request_id);
        assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

        db.exec(`
            DROP INDEX idx_hall_forge_requests_active_decision;
            CREATE INDEX idx_hall_forge_requests_active_decision
            ON hall_forge_requests(bead_id, decision_id)
            WHERE status <> 'SUPERSEDED';
        `);
        ensureForgeRequestCorrectionSchema(db);
        const listed = (db.prepare(
            'PRAGMA index_list(hall_forge_requests)',
        ).all() as Array<Record<string, unknown>>).find(
            (entry) => entry.name === 'idx_hall_forge_requests_active_decision',
        );
        assert.equal(listed?.unique, 1);
        assert.equal(listed?.partial, 1);
        assert.deepEqual(db.prepare(
            'SELECT request_sha256, request_summary_json, status FROM hall_forge_requests',
        ).get(), {
            request_sha256: before.request_sha256,
            request_summary_json: before.request_summary_json,
            status: 'PENDING_AUTH',
        });
        db.close();
    });

    it('preserves the full legacy violation baseline and real Forge dependencies', () => {
        const db = createLegacyRequestStore();
        const dependenciesBefore = forgeDependencyShape(db);
        const violationsBefore = seedUnrelatedForeignKeyDebt(db);
        assert.equal(violationsBefore.length, 98);
        assert.equal(
            violationsBefore.filter((row) => row.table === 'hall_beads').length,
            96,
        );
        assert.deepEqual(violationsBefore.filter(
            (row) => row.table !== 'hall_beads' || row.rowid === 2,
        ), [
            {
                table: 'hall_beads',
                rowid: 2,
                parent: 'hall_repositories',
                fkid: 1,
            },
            {
                table: 'hall_lessons',
                rowid: 1,
                parent: 'hall_repositories',
                fkid: 2,
            },
            {
                table: 'hall_validation_runs',
                rowid: 1,
                parent: 'hall_scans',
                fkid: 1,
            },
        ]);

        ensureForgeRequestCorrectionSchema(db);

        assert.deepEqual(foreignKeyRows(db), violationsBefore);
        assert.deepEqual(forgeDependencyShape(db), dependenciesBefore);
        assert.equal(db.prepare(
            'SELECT request_id FROM hall_forge_authorizations',
        ).pluck().get(), `dispatch-forge-${'1'.repeat(32)}`);
        assert.equal(db.prepare(
            'SELECT request_id FROM hall_forge_attempts',
        ).pluck().get(), `dispatch-forge-${'1'.repeat(32)}`);
        assert.equal(db.prepare(
            'SELECT request_id FROM hall_forge_preprovider_continuations',
        ).pluck().get(), `dispatch-forge-${'1'.repeat(32)}`);
        db.close();
    });

    it('rejects a changed violation set with exact bounded rows', () => {
        const db = createLegacyRequestStore();
        db.pragma('foreign_keys = OFF');
        db.exec(`
            CREATE TABLE hall_forge_migration_probe (
                probe_id INTEGER PRIMARY KEY,
                request_id TEXT NOT NULL,
                FOREIGN KEY(request_id)
                    REFERENCES hall_forge_requests_correction_migration(request_id)
            );
            INSERT INTO hall_forge_migration_probe VALUES (1, 'request:missing');
        `);
        db.pragma('foreign_keys = ON');

        assert.throws(
            () => ensureForgeRequestCorrectionSchema(db),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                const prefix = 'forge_request_correction_schema_foreign_key_check_failed:';
                assert.ok(error.message.startsWith(prefix));
                assert.deepEqual(JSON.parse(error.message.slice(prefix.length)), {
                    before_count: 1,
                    after_count: 1,
                    added: [{
                        table: 'hall_forge_migration_probe',
                        rowid: 1,
                        parent: 'hall_forge_requests',
                        fkid: 0,
                    }],
                    removed: [{
                        table: 'hall_forge_migration_probe',
                        rowid: 1,
                        parent: 'hall_forge_requests_correction_migration',
                        fkid: 0,
                    }],
                    migrated_dependencies: [{
                        table: 'hall_forge_migration_probe',
                        rowid: 1,
                        parent: 'hall_forge_requests',
                        fkid: 0,
                    }],
                    truncated: false,
                });
                return true;
            },
        );
        assert.equal(db.prepare(
            "SELECT COUNT(*) FROM pragma_table_info('hall_forge_requests') "
            + "WHERE name = 'superseded_by'",
        ).pluck().get(), 0);
        db.close();
    });

    it('preserves an exactly identical preexisting Forge-linked violation', () => {
        const db = createLegacyRequestStore();
        db.pragma('foreign_keys = OFF');
        db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key,
                execution_receipt_id, adapter_ref, status, reserved_at, updated_at
            ) VALUES (
                'attempt:orphan', 'request:missing', 1, 'idempotency:orphan',
                'receipt:orphan', 'adapter:orphan', 'FAILED_FINAL', 2, 2
            )
        `).run();
        db.pragma('foreign_keys = ON');

        const before = foreignKeyRows(db);
        ensureForgeRequestCorrectionSchema(db);
        assert.deepEqual(foreignKeyRows(db), before);
        assert.deepEqual(before, [{
            table: 'hall_forge_attempts',
            rowid: 2,
            parent: 'hall_forge_requests',
            fkid: 1,
        }]);
        db.close();
    });
});
