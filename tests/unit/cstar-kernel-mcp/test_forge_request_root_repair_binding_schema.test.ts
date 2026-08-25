import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import Database from 'better-sqlite3';

import {
    ensureForgeRootRepairBindingSchema,
    FORGE_ROOT_REPAIR_BINDING_SCHEMA,
    FORGE_ROOT_REPAIR_BINDING_TABLE,
} from '../../../src/tools/pennyone/intel/forge_request_root_repair_binding_schema.js';

const TABLE = FORGE_ROOT_REPAIR_BINDING_TABLE;
const MIGRATION_TABLE = `${TABLE}__migration_tmp`;
const COLUMNS = [
    'schema', 'request_id', 'repo_id', 'bead_id', 'decision_id', 'request_sha256',
    'target_paths_sha256', 'required_output_paths_sha256', 'requested_actions_sha256',
    'prohibited_actions_sha256', 'package_locks_sha256', 'callback_contract_sha256',
    'spend_policy_sha256', 'retry_budget', 'max_attempts', 'live_source_allowed',
    'adapter_ref', 'write_capability', 'action', 'repair_instruction_sha256',
    'root_thread_id', 'root_turn_id', 'root_record_set_sha256', 'binding_sha256', 'created_at',
].join(', ');

function createLegacyDatabase(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);
        CREATE TABLE ${TABLE} (
            schema TEXT NOT NULL CHECK(schema = '${FORGE_ROOT_REPAIR_BINDING_SCHEMA}'),
            request_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            bead_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            request_sha256 TEXT NOT NULL UNIQUE,
            target_paths_sha256 TEXT NOT NULL,
            required_output_paths_sha256 TEXT NOT NULL,
            requested_actions_sha256 TEXT NOT NULL,
            prohibited_actions_sha256 TEXT NOT NULL,
            package_locks_sha256 TEXT NOT NULL,
            callback_contract_sha256 TEXT NOT NULL,
            spend_policy_sha256 TEXT NOT NULL,
            retry_budget INTEGER NOT NULL CHECK(retry_budget = 0),
            max_attempts INTEGER NOT NULL CHECK(max_attempts = 1),
            live_source_allowed INTEGER NOT NULL CHECK(live_source_allowed = 0),
            adapter_ref TEXT NOT NULL,
            write_capability TEXT NOT NULL CHECK(write_capability = 'project_files'),
            action TEXT NOT NULL CHECK(action IN ('build', 'implement', 'repair', 'fix', 'route_to_forge')),
            repair_instruction_sha256 TEXT NOT NULL,
            root_thread_id TEXT NOT NULL,
            root_turn_id TEXT NOT NULL,
            root_record_set_sha256 TEXT NOT NULL,
            binding_sha256 TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
        );
        CREATE TRIGGER ${TABLE}_immutable_update
        BEFORE UPDATE ON ${TABLE}
        BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END;
        CREATE TRIGGER ${TABLE}_immutable_delete
        BEFORE DELETE ON ${TABLE}
        BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END;
    `);
    const requestId = 'request:historical-root-repair';
    db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(requestId);
    db.prepare(`
        INSERT INTO ${TABLE} (${COLUMNS}) VALUES (${COLUMNS.split(', ').map(() => '?').join(', ')})
    `).run(
        FORGE_ROOT_REPAIR_BINDING_SCHEMA,
        requestId,
        'repo:/historical',
        'bead:historical-root-repair',
        'decision:historical-root-repair',
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        'd'.repeat(64),
        'e'.repeat(64),
        'f'.repeat(64),
        '1'.repeat(64),
        '2'.repeat(64),
        0,
        1,
        0,
        'cstar-forge-hermes-minimax-worker-adapter',
        'project_files',
        'repair',
        '3'.repeat(64),
        'thread:historical-root-repair',
        'turn:historical-root-repair',
        '4'.repeat(64),
        '5'.repeat(64),
        123456789,
    );
    return db;
}

function snapshot(db: Database.Database): unknown[] {
    return db.prepare(`SELECT ${COLUMNS} FROM main."${TABLE}" ORDER BY request_id`).all();
}

function rootState(db: Database.Database): Record<string, unknown> {
    return {
        sql: db.prepare("SELECT sql FROM main.sqlite_master WHERE type = 'table' AND name = ?")
            .pluck().get(TABLE),
        info: db.prepare(`PRAGMA main.table_info("${TABLE}")`).all(),
        triggers: db.prepare(
            "SELECT name, sql FROM main.sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name",
        ).all(TABLE),
        rows: snapshot(db),
        migrationTable: db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name = ?")
            .pluck().get(MIGRATION_TABLE),
    };
}

function externalTableState(
    db: Database.Database,
    schema: 'temp' | 'aux',
    table: string,
): Record<string, unknown> {
    const master = schema === 'temp' ? 'sqlite_temp_master' : 'aux.sqlite_master';
    return { sql: db.prepare(`SELECT sql FROM ${master} WHERE type = 'table' AND name = ?`)
        .pluck().get(table), rows: db.prepare(`SELECT * FROM ${schema}."${table}"`).all() };
}

function schemaObjectState(db: Database.Database, schema: 'temp' | 'aux', name: string): unknown {
    const master = schema === 'temp' ? 'sqlite_temp_master' : 'aux.sqlite_master';
    return db.prepare(`SELECT type, name, tbl_name, sql FROM ${master} WHERE name = ?`).get(name);
}

function assertSchemaError(db: Database.Database, message: string): void {
    assert.throws(
        () => ensureForgeRootRepairBindingSchema(db),
        (error: unknown) => error instanceof Error && error.message === message,
    );
}

function assertExternalPreflightRejected(
    db: Database.Database,
    message: string,
    schema: 'temp' | 'aux',
    table: string,
): void {
    const before = rootState(db);
    const externalBefore = externalTableState(db, schema, table);
    assertSchemaError(db, message);
    assert.deepEqual(rootState(db), before); assert.deepEqual(externalTableState(db, schema, table), externalBefore);
}

function assertDependencyRejected(db: Database.Database, before: Record<string, unknown>): void {
    assertSchemaError(db, 'forge_root_repair_binding_schema_dependent_object');
    assert.deepEqual(rootState(db), before);
}

describe('Forge root-repair binding schema compatibility', () => {
    it('widens only the legacy adapter column and preserves rows, triggers, and foreign keys', () => {
        const db = createLegacyDatabase();
        db.exec('CREATE TABLE unrelated_legacy_parent (id INTEGER PRIMARY KEY); CREATE TABLE unrelated_legacy_child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES unrelated_legacy_parent(id)); PRAGMA foreign_keys = OFF; INSERT INTO unrelated_legacy_child VALUES (1, 999); PRAGMA foreign_keys = ON;');
        db.exec(`
            CREATE TEMP TABLE immutable_trigger_source (id INTEGER);
            CREATE TEMP TRIGGER "${TABLE}_immutable_update" BEFORE UPDATE ON immutable_trigger_source BEGIN SELECT 1; END;
            CREATE TEMP TRIGGER "${TABLE}_immutable_delete" BEFORE DELETE ON immutable_trigger_source BEGIN SELECT 1; END;
            ATTACH ':memory:' AS aux;
            CREATE TABLE aux.immutable_trigger_source (id INTEGER);
            CREATE TRIGGER aux."${TABLE}_immutable_update" BEFORE UPDATE ON aux.immutable_trigger_source BEGIN SELECT 1; END;
            CREATE TRIGGER aux."${TABLE}_immutable_delete" BEFORE DELETE ON aux.immutable_trigger_source BEGIN SELECT 1; END;
        `);
        const externalBefore = [db.prepare("SELECT name, sql FROM sqlite_temp_master WHERE type = 'trigger' ORDER BY name").all(), db.prepare("SELECT name, sql FROM aux.sqlite_master WHERE type = 'trigger' ORDER BY name").all()];
        const before = snapshot(db);
        assert.equal(
            (db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{ name: string; notnull: number }>)
                .find((column) => column.name === 'adapter_ref')?.notnull,
            1,
        );

        ensureForgeRootRepairBindingSchema(db);

        const mainTriggers = db.prepare("SELECT name, sql FROM main.sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name").all(TABLE) as Array<{ name: string; sql: string }>;
        const canonical = (sql: string) => sql.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();
        assert.deepEqual(mainTriggers.map(({ name, sql }) => [name, canonical(sql)]), [
            [`${TABLE}_immutable_delete`, canonical(`CREATE TRIGGER "${TABLE}_immutable_delete" BEFORE DELETE ON "main"."${TABLE}" BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END`)],
            [`${TABLE}_immutable_update`, canonical(`CREATE TRIGGER "${TABLE}_immutable_update" BEFORE UPDATE ON "main"."${TABLE}" BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END`)],
        ]);
        assert.deepEqual([db.prepare("SELECT name, sql FROM sqlite_temp_master WHERE type = 'trigger' ORDER BY name").all(), db.prepare("SELECT name, sql FROM aux.sqlite_master WHERE type = 'trigger' ORDER BY name").all()], externalBefore);
        const adapterColumn = (db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{
            name: string;
            notnull: number;
        }>).find((column) => column.name === 'adapter_ref');
        assert.equal(adapterColumn?.notnull, 0);
        assert.deepEqual(snapshot(db), before);
        assert.equal(
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
                .pluck().get(MIGRATION_TABLE),
            undefined,
        );
        assert.deepEqual(db.prepare(`PRAGMA main.foreign_key_check(${TABLE})`).all(), []); assert.equal(db.prepare('PRAGMA main.foreign_key_check').all().length, 1);
        assert.throws(
            () => db.prepare(`UPDATE ${TABLE} SET adapter_ref = NULL`).run(),
            /forge_root_repair_binding_immutable/,
        );
        assert.throws(
            () => db.prepare(`DELETE FROM ${TABLE}`).run(),
            /forge_root_repair_binding_immutable/,
        );
        assert.deepEqual(snapshot(db), before);

        ensureForgeRootRepairBindingSchema(db);
        assert.deepEqual(snapshot(db), before);
        assert.equal(
            db.prepare(`SELECT adapter_ref FROM ${TABLE}`).pluck().get(),
            'cstar-forge-hermes-minimax-worker-adapter',
        );
        const broken = createLegacyDatabase();
        broken.exec('PRAGMA foreign_keys = OFF; DELETE FROM hall_forge_requests;');
        assertSchemaError(broken, 'forge_root_repair_binding_schema_foreign_key_check_failed');
        broken.close();
        db.close();
    });

    it('fails closed on a stale migration table without replacing the legacy table', () => {
        const db = createLegacyDatabase();
        const before = snapshot(db);
        db.exec(`CREATE TABLE ${MIGRATION_TABLE} (marker TEXT NOT NULL)`);

        assert.throws(
            () => ensureForgeRootRepairBindingSchema(db),
            /forge_root_repair_binding_schema_stale_migration_table/,
        );
        assert.deepEqual(snapshot(db), before);
        assert.equal(
            db.prepare(`PRAGMA table_info(${TABLE})`).all()
                .find((column: { name?: string }) => column.name === 'adapter_ref')?.notnull,
            1,
        );
        db.close();
    });

    it('fails closed on a stale temp migration table before touching main', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TEMP TABLE "${MIGRATION_TABLE}" (marker TEXT NOT NULL);
            INSERT INTO temp."${MIGRATION_TABLE}" VALUES ('temp-stale');
        `);
        assertExternalPreflightRejected(
            db,
            'forge_root_repair_binding_schema_stale_migration_table',
            'temp',
            MIGRATION_TABLE,
        );
        db.close();
    });

    it('fails closed on a stale attached migration table before touching main', () => {
        const db = createLegacyDatabase();
        db.exec(`
            ATTACH ':memory:' AS aux;
            CREATE TABLE aux."${MIGRATION_TABLE}" (marker TEXT NOT NULL);
            INSERT INTO aux."${MIGRATION_TABLE}" VALUES ('attached-stale');
        `);
        assertExternalPreflightRejected(
            db,
            'forge_root_repair_binding_schema_stale_migration_table',
            'aux',
            MIGRATION_TABLE,
        );
        db.close();
    });

    it('rejects a temp target-name shadow before main rename', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TEMP TABLE "${TABLE}" (marker TEXT NOT NULL);
            INSERT INTO temp."${TABLE}" VALUES ('temp-shadow');
        `);
        assertExternalPreflightRejected(
            db,
            'forge_root_repair_binding_schema_dependent_object',
            'temp',
            TABLE,
        );
        db.close();
    });

    it('rejects an attached target-name shadow before main rename', () => {
        const db = createLegacyDatabase();
        db.exec(`
            ATTACH ':memory:' AS aux;
            CREATE TABLE aux."${TABLE}" (marker TEXT NOT NULL);
            INSERT INTO aux."${TABLE}" VALUES ('attached-shadow');
        `);
        assertExternalPreflightRejected(
            db,
            'forge_root_repair_binding_schema_dependent_object',
            'aux',
            TABLE,
        );
        db.close();
    });

    it('preserves main and every external object when preflight rejects stale migration', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TEMP TABLE "${TABLE}" (marker TEXT NOT NULL);
            INSERT INTO temp."${TABLE}" VALUES ('temp-shadow');
            ATTACH ':memory:' AS aux;
            CREATE TABLE aux."${MIGRATION_TABLE}" (marker TEXT NOT NULL);
            INSERT INTO aux."${MIGRATION_TABLE}" VALUES ('attached-stale');
        `);
        const before = rootState(db);
        const tempBefore = externalTableState(db, 'temp', TABLE);
        const attachedBefore = externalTableState(db, 'aux', MIGRATION_TABLE);
        assertSchemaError(db, 'forge_root_repair_binding_schema_stale_migration_table');
        assert.deepEqual(rootState(db), before);
        assert.deepEqual(externalTableState(db, 'temp', TABLE), tempBefore);
        assert.deepEqual(externalTableState(db, 'aux', MIGRATION_TABLE), attachedBefore);
        db.close();
    });

    it('rejects temp and attached non-table name collisions before any rename', () => {
        const cases: Array<['temp' | 'aux', string, string, string]> = [
            ['temp', '', MIGRATION_TABLE, 'forge_root_repair_binding_schema_stale_migration_table'],
            ['temp', '', TABLE, 'forge_root_repair_binding_schema_dependent_object'],
            ['aux', "ATTACH ':memory:' AS aux;", MIGRATION_TABLE, 'forge_root_repair_binding_schema_stale_migration_table'],
            ['aux', "ATTACH ':memory:' AS aux;", TABLE, 'forge_root_repair_binding_schema_dependent_object'],
        ];
        for (const [schema, attach, name, error] of cases) {
            const db = createLegacyDatabase();
            if (attach) db.exec(attach);
            db.exec(schema === 'temp'
                ? `CREATE TEMP VIEW "${name}" AS SELECT 'collision' AS marker`
                : `CREATE VIEW aux."${name}" AS SELECT 'collision' AS marker`);
            const before = rootState(db);
            const objectBefore = schemaObjectState(db, schema, name);
            assertSchemaError(db, error);
            assert.deepEqual(rootState(db), before);
            assert.deepEqual(schemaObjectState(db, schema, name), objectBefore);
            const otherName = name === TABLE ? MIGRATION_TABLE : TABLE;
            assert.equal(schemaObjectState(db, schema, otherName), undefined);
            db.close();
        }
    });

    it('preflights stale namespace state before the current idempotent path', () => {
        const db = createLegacyDatabase();
        ensureForgeRootRepairBindingSchema(db);
        db.exec(`CREATE TEMP TABLE "${MIGRATION_TABLE}" (marker TEXT NOT NULL)`);
        const before = rootState(db);
        const tempBefore = externalTableState(db, 'temp', MIGRATION_TABLE);
        assertSchemaError(db, 'forge_root_repair_binding_schema_stale_migration_table');
        assert.deepEqual(rootState(db), before);
        assert.deepEqual(externalTableState(db, 'temp', MIGRATION_TABLE), tempBefore);
        db.close();
    });

    it('fails closed on an unexpected shape or immutable-trigger drift', () => {
        const malformed = createLegacyDatabase();
        const before = snapshot(malformed);
        malformed.exec(`ALTER TABLE ${TABLE} ADD COLUMN unexpected TEXT`);
        assert.throws(
            () => ensureForgeRootRepairBindingSchema(malformed),
            /forge_root_repair_binding_schema_shape_invalid/,
        );
        assert.deepEqual(snapshot(malformed), before);
        malformed.close();

        const mismatchedTrigger = createLegacyDatabase();
        const unchanged = snapshot(mismatchedTrigger);
        mismatchedTrigger.exec(`DROP TRIGGER ${TABLE}_immutable_update`);
        mismatchedTrigger.exec(`
            CREATE TRIGGER ${TABLE}_immutable_update
            BEFORE UPDATE ON ${TABLE}
            BEGIN SELECT RAISE(ABORT, 'wrong_trigger'); END;
        `);
        assert.throws(
            () => ensureForgeRootRepairBindingSchema(mismatchedTrigger),
            /forge_root_repair_binding_schema_trigger_invalid/,
        );
        assert.deepEqual(snapshot(mismatchedTrigger), unchanged);
        mismatchedTrigger.close();
    });

    it('rejects an external dependent view before renaming the legacy table', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE VIEW dependent_root_view AS
            SELECT request_id FROM "${TABLE}";
        `);
        const before = rootState(db);
        const viewSql = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'dependent_root_view'",
        ).pluck().get();

        assertDependencyRejected(db, before);
        assert.equal(
            db.prepare("SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'dependent_root_view'")
                .pluck().get(),
            viewSql,
        );
        db.close();
    });

    it('rejects an external trigger that reads the legacy table before renaming', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TABLE external_events (event_id INTEGER PRIMARY KEY, request_id TEXT NOT NULL);
            CREATE TRIGGER external_root_reader
            AFTER INSERT ON external_events
            BEGIN
                UPDATE external_events
                SET request_id = (SELECT request_id FROM "${TABLE}" WHERE request_id = NEW.request_id)
                WHERE event_id = NEW.event_id;
            END;
        `);
        const before = rootState(db);
        const triggerSql = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'external_root_reader'",
        ).pluck().get();

        assertDependencyRejected(db, before);
        assert.equal(
            db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'external_root_reader'")
                .pluck().get(),
            triggerSql,
        );
        db.close();
    });

    it('rejects a child foreign key dependency before renaming the legacy table', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TABLE root_binding_child (
                child_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                FOREIGN KEY(request_id) REFERENCES "${TABLE}"(request_id)
            );
            INSERT INTO root_binding_child (child_id, request_id)
            VALUES ('child:historical', 'request:historical-root-repair');
        `);
        const before = rootState(db);
        const childSql = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'root_binding_child'",
        ).pluck().get();
        const childRows = db.prepare('SELECT * FROM root_binding_child').all();
        const childForeignKeys = db.prepare('PRAGMA foreign_key_list(root_binding_child)').all();
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

        assertDependencyRejected(db, before);
        assert.equal(
            db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'root_binding_child'")
                .pluck().get(),
            childSql,
        );
        assert.deepEqual(db.prepare('SELECT * FROM root_binding_child').all(), childRows);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_list(root_binding_child)').all(), childForeignKeys);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        db.close();
    });

    it('does not treat similar identifiers, comments, or string literals as dependencies', () => {
        const db = createLegacyDatabase();
        db.exec(`
            CREATE TABLE ${TABLE}_shadow (marker TEXT);
            CREATE TABLE unrelated_root_data (id INTEGER PRIMARY KEY, marker TEXT);
            CREATE VIEW unrelated_root_view AS
            SELECT 'hall_forge_request_root_repair_bindings' AS marker
            /* hall_forge_request_root_repair_bindings */;
            CREATE TRIGGER unrelated_root_trigger
            AFTER INSERT ON unrelated_root_data
            WHEN NEW.marker = 'hall_forge_request_root_repair_bindings'
            BEGIN
                UPDATE unrelated_root_data SET marker = NEW.marker WHERE id = NEW.id;
                /* hall_forge_request_root_repair_bindings */
            END;
        `);
        const before = snapshot(db);

        ensureForgeRootRepairBindingSchema(db);

        assert.equal(
            (db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{ name: string; notnull: number }>)
                .find((column) => column.name === 'adapter_ref')?.notnull,
            0,
        );
        assert.deepEqual(snapshot(db), before);
        assert.equal(
            db.prepare("SELECT marker FROM unrelated_root_view").pluck().get(),
            'hall_forge_request_root_repair_bindings',
        );
        db.prepare("INSERT INTO unrelated_root_data (id, marker) VALUES (1, 'hall_forge_request_root_repair_bindings')")
            .run();
        assert.equal(
            db.prepare('SELECT marker FROM unrelated_root_data WHERE id = 1').pluck().get(),
            'hall_forge_request_root_repair_bindings',
        );
        assert.ok(db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        ).pluck().get(`${TABLE}_shadow`));
        db.close();
    });
});
