import type Database from 'better-sqlite3';

export const FORGE_ROOT_REPAIR_BINDING_SCHEMA = 'cstar.forge_request_root_repair_binding.v1' as const;
export const FORGE_ROOT_REPAIR_BINDING_TABLE = 'hall_forge_request_root_repair_bindings' as const;

const MIGRATION_TABLE = `${FORGE_ROOT_REPAIR_BINDING_TABLE}__migration_tmp`;
const UPDATE_TRIGGER = `${FORGE_ROOT_REPAIR_BINDING_TABLE}_immutable_update`;
const DELETE_TRIGGER = `${FORGE_ROOT_REPAIR_BINDING_TABLE}_immutable_delete`;
const COLUMNS = [
    'schema', 'request_id', 'repo_id', 'bead_id', 'decision_id', 'request_sha256',
    'target_paths_sha256', 'required_output_paths_sha256', 'requested_actions_sha256',
    'prohibited_actions_sha256', 'package_locks_sha256', 'callback_contract_sha256',
    'spend_policy_sha256', 'retry_budget', 'max_attempts', 'live_source_allowed',
    'adapter_ref', 'write_capability', 'action', 'repair_instruction_sha256',
    'root_thread_id', 'root_turn_id', 'root_record_set_sha256', 'binding_sha256', 'created_at',
] as const;
const COLUMN_LIST = COLUMNS.map((column) => `"${column}"`).join(', ');

interface TableInfoRow {
    name?: unknown;
    type?: unknown;
    notnull?: unknown;
    dflt_value?: unknown;
    pk?: unknown;
}

interface SchemaObjectRow {
    name?: unknown;
    tbl_name?: unknown;
    sql?: unknown;
    type?: unknown;
}

interface DatabaseListRow {
    name?: unknown;
}

interface ForeignKeyRow {
    table?: unknown;
}

const EXPECTED_COLUMN_INFO = [
    ['schema', 'TEXT', 1, 0],
    ['request_id', 'TEXT', 0, 1],
    ['repo_id', 'TEXT', 1, 0],
    ['bead_id', 'TEXT', 1, 0],
    ['decision_id', 'TEXT', 1, 0],
    ['request_sha256', 'TEXT', 1, 0],
    ['target_paths_sha256', 'TEXT', 1, 0],
    ['required_output_paths_sha256', 'TEXT', 1, 0],
    ['requested_actions_sha256', 'TEXT', 1, 0],
    ['prohibited_actions_sha256', 'TEXT', 1, 0],
    ['package_locks_sha256', 'TEXT', 1, 0],
    ['callback_contract_sha256', 'TEXT', 1, 0],
    ['spend_policy_sha256', 'TEXT', 1, 0],
    ['retry_budget', 'INTEGER', 1, 0],
    ['max_attempts', 'INTEGER', 1, 0],
    ['live_source_allowed', 'INTEGER', 1, 0],
    ['adapter_ref', 'TEXT', 0, 0],
    ['write_capability', 'TEXT', 1, 0],
    ['action', 'TEXT', 1, 0],
    ['repair_instruction_sha256', 'TEXT', 1, 0],
    ['root_thread_id', 'TEXT', 1, 0],
    ['root_turn_id', 'TEXT', 1, 0],
    ['root_record_set_sha256', 'TEXT', 1, 0],
    ['binding_sha256', 'TEXT', 1, 0],
    ['created_at', 'INTEGER', 1, 0],
] as const;

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function tableExists(db: Database.Database, table: string): boolean {
    return Boolean(db.prepare(
        `SELECT 1 FROM ${quoteSchemaObject('main', 'sqlite_master')} WHERE type = 'table' AND name = ?`,
    ).get(table));
}

function tableSql(db: Database.Database, table: string): string | null {
    const row = db.prepare(
        `SELECT sql FROM ${quoteSchemaObject('main', 'sqlite_master')} WHERE type = 'table' AND name = ?`,
    ).get(table) as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : null;
}

function normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();
}

function createTableSql(table: string, legacyAdapterRef = false): string {
    const adapterDeclaration = legacyAdapterRef ? 'TEXT NOT NULL' : 'TEXT';
    return `
        CREATE TABLE ${table} (
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
            adapter_ref ${adapterDeclaration},
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
    `;
}

function storedTriggerSql(name: string, event: 'UPDATE' | 'DELETE', qualifiedTarget = false): string {
    const triggerName = qualifiedTarget ? quoteIdentifier(name) : name;
    const target = qualifiedTarget ? quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE)
        : FORGE_ROOT_REPAIR_BINDING_TABLE;
    return `CREATE TRIGGER ${triggerName} BEFORE ${event} ON ${target} BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END`;
}

function createImmutableTriggers(db: Database.Database): void {
    const mainTable = quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE);
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS ${quoteSchemaObject('main', UPDATE_TRIGGER)}
        BEFORE UPDATE ON ${mainTable}
        BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END;
        CREATE TRIGGER IF NOT EXISTS ${quoteSchemaObject('main', DELETE_TRIGGER)}
        BEFORE DELETE ON ${mainTable}
        BEGIN SELECT RAISE(ABORT, 'forge_root_repair_binding_immutable'); END;
    `);
}

function validateSchemaObjects(db: Database.Database): void {
    const mainMaster = quoteSchemaObject('main', 'sqlite_master');
    const unexpected = db.prepare(
        `SELECT type, name, sql FROM ${mainMaster} WHERE tbl_name = ? AND type NOT IN ('table', 'index', 'trigger')`,
    ).all(FORGE_ROOT_REPAIR_BINDING_TABLE) as SchemaObjectRow[];
    if (unexpected.length > 0) throw new Error('forge_root_repair_binding_schema_dependent_object');

    const indexes = db.prepare(
        `SELECT name, sql FROM ${mainMaster} WHERE type = 'index' AND tbl_name = ?`,
    ).all(FORGE_ROOT_REPAIR_BINDING_TABLE) as SchemaObjectRow[];
    if (indexes.some((index) => index.sql !== null)) {
        throw new Error('forge_root_repair_binding_schema_dependent_object');
    }

    const triggers = db.prepare(
        `SELECT name, sql FROM ${mainMaster} WHERE type = 'trigger' AND tbl_name = ? ORDER BY name`,
    ).all(FORGE_ROOT_REPAIR_BINDING_TABLE) as SchemaObjectRow[];
    for (const trigger of triggers) {
        const name = trigger.name;
        const expected = name === UPDATE_TRIGGER
            ? [storedTriggerSql(UPDATE_TRIGGER, 'UPDATE'), storedTriggerSql(UPDATE_TRIGGER, 'UPDATE', true)]
            : name === DELETE_TRIGGER
                ? [storedTriggerSql(DELETE_TRIGGER, 'DELETE'), storedTriggerSql(DELETE_TRIGGER, 'DELETE', true)]
                : null;
        const actual = typeof trigger.sql === 'string' ? normalizeSql(trigger.sql) : null;
        if (typeof name !== 'string' || typeof trigger.sql !== 'string' || expected === null
            || actual === null || !expected.some((definition) => normalizeSql(definition) === actual)) {
            throw new Error('forge_root_repair_binding_schema_trigger_invalid');
        }
    }
}

function dependencyFailure(): never {
    throw new Error('forge_root_repair_binding_schema_dependent_object');
}

function sameSqliteName(actual: string, expected: string): boolean {
    return actual.toLowerCase() === expected.toLowerCase();
}

function quoteSchemaObject(schema: string, object: string): string {
    return schema === 'temp'
        ? `sqlite_temp_master`
        : `${quoteIdentifier(schema)}.${quoteIdentifier(object)}`;
}

function databaseSchemas(db: Database.Database): string[] {
    const names = new Set(['main', 'temp']);
    let rows: DatabaseListRow[];
    try {
        rows = db.prepare('PRAGMA database_list').all() as DatabaseListRow[];
    } catch {
        return dependencyFailure();
    }
    for (const row of rows) {
        if (typeof row.name !== 'string' || !row.name) return dependencyFailure();
        names.add(row.name);
    }
    return [...names];
}

function schemaObjects(db: Database.Database, schema: string): SchemaObjectRow[] {
    try {
        return db.prepare(
            `SELECT type, name, tbl_name, sql FROM ${quoteSchemaObject(schema, 'sqlite_master')}
             WHERE type IN ('view', 'trigger') ORDER BY type, name`,
        ).all() as SchemaObjectRow[];
    } catch {
        return dependencyFailure();
    }
}

function schemaTables(db: Database.Database, schema: string): string[] {
    let rows: Array<{ name?: unknown }>;
    try {
        rows = db.prepare(
            `SELECT name FROM ${quoteSchemaObject(schema, 'sqlite_master')} WHERE type = 'table' ORDER BY name`,
        ).all() as Array<{ name?: unknown }>;
    } catch {
        return dependencyFailure();
    }
    const names: string[] = [];
    for (const row of rows) {
        if (typeof row.name !== 'string' || !row.name) return dependencyFailure();
        names.push(row.name);
    }
    return names;
}

function schemaCatalogObjects(db: Database.Database, schema: string): SchemaObjectRow[] {
    try {
        return db.prepare(
            `SELECT type, name, tbl_name, sql FROM ${quoteSchemaObject(schema, 'sqlite_master')}
             WHERE type IN ('table', 'index', 'view', 'trigger') ORDER BY type, name`,
        ).all() as SchemaObjectRow[];
    } catch {
        return dependencyFailure();
    }
}

function assertNoSchemaNameCollisions(db: Database.Database): void {
    let migrationCollision = false;
    let targetCollision = false;
    for (const schema of databaseSchemas(db)) {
        for (const object of schemaCatalogObjects(db, schema)) {
            if (typeof object.type !== 'string' || typeof object.name !== 'string' || !object.name) {
                return dependencyFailure();
            }
            if (sameSqliteName(object.name, MIGRATION_TABLE)) {
                migrationCollision = true;
                continue;
            }
            if (sameSqliteName(object.name, FORGE_ROOT_REPAIR_BINDING_TABLE)
                && !(schema === 'main' && object.type === 'table')) {
                targetCollision = true;
            }
        }
    }
    if (migrationCollision) throw new Error('forge_root_repair_binding_schema_stale_migration_table');
    if (targetCollision) return dependencyFailure();
}

function readQuotedIdentifier(
    sql: string,
    start: number,
    delimiter: '"' | '`' | '[',
): { value: string; next: number } | null {
    const closing = delimiter === '[' ? ']' : delimiter;
    let value = '';
    for (let index = start + 1; index < sql.length; index += 1) {
        const character = sql[index]!;
        if (character === closing) {
            if (sql[index + 1] === closing) {
                value += closing;
                index += 1;
                continue;
            }
            return { value, next: index + 1 };
        }
        value += character;
    }
    return null;
}

function skipStringLiteral(sql: string, start: number): number | null {
    for (let index = start + 1; index < sql.length; index += 1) {
        if (sql[index] !== "'") continue;
        if (sql[index + 1] === "'") {
            index += 1;
            continue;
        }
        return index + 1;
    }
    return null;
}

function sqlReferencesTable(sql: string): boolean | null {
    const target = FORGE_ROOT_REPAIR_BINDING_TABLE.toLowerCase();
    for (let index = 0; index < sql.length;) {
        const character = sql[index]!;
        if (/\s/u.test(character)) {
            index += 1;
            continue;
        }
        if (character === '-' && sql[index + 1] === '-') {
            index += 2;
            while (index < sql.length && sql[index] !== '\n') index += 1;
            continue;
        }
        if (character === '/' && sql[index + 1] === '*') {
            const end = sql.indexOf('*/', index + 2);
            if (end < 0) return null;
            index = end + 2;
            continue;
        }
        if (character === "'") {
            const next = skipStringLiteral(sql, index);
            if (next === null) return null;
            index = next;
            continue;
        }
        if (character === '"' || character === '`' || character === '[') {
            const quoted = readQuotedIdentifier(sql, index, character);
            if (quoted === null) return null;
            if (quoted.value.toLowerCase() === target) return true;
            index = quoted.next;
            continue;
        }
        if (/[A-Za-z_]/u.test(character)) {
            const start = index;
            index += 1;
            while (index < sql.length && /[A-Za-z0-9_$]/u.test(sql[index]!)) index += 1;
            if (sql.slice(start, index).toLowerCase() === target) return true;
            continue;
        }
        index += 1;
    }
    return false;
}

function foreignKeys(db: Database.Database, schema: string, table: string): ForeignKeyRow[] {
    try {
        const pragma = schema === 'temp'
            ? `PRAGMA temp.foreign_key_list(${quoteIdentifier(table)})`
            : `PRAGMA ${quoteIdentifier(schema)}.foreign_key_list(${quoteIdentifier(table)})`;
        return db.prepare(pragma).all() as ForeignKeyRow[];
    } catch {
        return dependencyFailure();
    }
}

function assertNoExternalDependencies(db: Database.Database): void {
    for (const schema of databaseSchemas(db)) {
        for (const object of schemaObjects(db, schema)) {
            if (typeof object.type !== 'string' || typeof object.name !== 'string'
                || typeof object.tbl_name !== 'string' || typeof object.sql !== 'string') {
                return dependencyFailure();
            }
            const ownImmutableTrigger = schema === 'main'
                && object.tbl_name === FORGE_ROOT_REPAIR_BINDING_TABLE
                && (object.name === UPDATE_TRIGGER || object.name === DELETE_TRIGGER);
            if (object.type === 'trigger' && ownImmutableTrigger) continue;
            if (object.type === 'trigger' && object.tbl_name === FORGE_ROOT_REPAIR_BINDING_TABLE) {
                return dependencyFailure();
            }
            const references = sqlReferencesTable(object.sql);
            if (references === null) return dependencyFailure();
            if (references) return dependencyFailure();
        }
        for (const table of schemaTables(db, schema)) {
            if (schema === 'main' && sameSqliteName(table, FORGE_ROOT_REPAIR_BINDING_TABLE)) continue;
            for (const foreignKey of foreignKeys(db, schema, table)) {
                if (typeof foreignKey.table !== 'string') return dependencyFailure();
                if (foreignKey.table.toLowerCase() === FORGE_ROOT_REPAIR_BINDING_TABLE.toLowerCase()) {
                    return dependencyFailure();
                }
            }
        }
    }
}

function tableInfo(db: Database.Database, table: string): TableInfoRow[] {
    return db.prepare(`PRAGMA main.table_info(${quoteIdentifier(table)})`).all() as TableInfoRow[];
}

function classifyTableShape(db: Database.Database): 'current' | 'legacy' {
    const info = tableInfo(db, FORGE_ROOT_REPAIR_BINDING_TABLE);
    if (info.length !== EXPECTED_COLUMN_INFO.length) {
        throw new Error('forge_root_repair_binding_schema_shape_invalid');
    }
    let legacyAdapterRef = false;
    for (const [index, expected] of EXPECTED_COLUMN_INFO.entries()) {
        const row = info[index];
        if (row?.name !== expected[0] || row.type !== expected[1] || row.pk !== expected[3]
            || row.dflt_value !== null) {
            throw new Error('forge_root_repair_binding_schema_shape_invalid');
        }
        if (row.name === 'adapter_ref') {
            if (row.notnull === 1) legacyAdapterRef = true;
            else if (row.notnull !== 0) throw new Error('forge_root_repair_binding_schema_shape_invalid');
        } else if (row.notnull !== expected[2]) {
            throw new Error('forge_root_repair_binding_schema_shape_invalid');
        }
    }
    const sql = tableSql(db, FORGE_ROOT_REPAIR_BINDING_TABLE);
    const currentSql = normalizeSql(createTableSql(FORGE_ROOT_REPAIR_BINDING_TABLE));
    const qualifiedCurrentSql = normalizeSql(createTableSql(quoteIdentifier(FORGE_ROOT_REPAIR_BINDING_TABLE)));
    const legacySql = normalizeSql(createTableSql(FORGE_ROOT_REPAIR_BINDING_TABLE, true));
    const qualifiedLegacySql = normalizeSql(createTableSql(quoteIdentifier(FORGE_ROOT_REPAIR_BINDING_TABLE), true));
    if (typeof sql !== 'string') throw new Error('forge_root_repair_binding_schema_shape_invalid');
    const normalized = normalizeSql(sql);
    if ((normalized === currentSql || normalized === qualifiedCurrentSql) && !legacyAdapterRef) return 'current';
    if ((normalized === legacySql || normalized === qualifiedLegacySql) && legacyAdapterRef) return 'legacy';
    throw new Error('forge_root_repair_binding_schema_shape_invalid');
}

function snapshotRows(db: Database.Database, table: string): unknown[] {
    return db.prepare(
        `SELECT ${COLUMN_LIST} FROM ${quoteSchemaObject('main', table)} ORDER BY "request_id"`,
    ).all();
}

function verifyForeignKeys(db: Database.Database): void {
    if (db.prepare('PRAGMA main.foreign_key_check(hall_forge_request_root_repair_bindings)').all().length > 0) {
        throw new Error('forge_root_repair_binding_schema_foreign_key_check_failed');
    }
}

function migrateLegacyTable(db: Database.Database): void {
    assertNoExternalDependencies(db);
    const before = snapshotRows(db, FORGE_ROOT_REPAIR_BINDING_TABLE);
    db.exec(`ALTER TABLE ${quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE)}
        RENAME TO ${quoteIdentifier(MIGRATION_TABLE)}`);
    db.exec(createTableSql(quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE)));
    db.prepare(`
        INSERT INTO ${quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE)} (${COLUMN_LIST})
        SELECT ${COLUMN_LIST} FROM ${quoteSchemaObject('main', MIGRATION_TABLE)}
    `).run();
    const after = snapshotRows(db, FORGE_ROOT_REPAIR_BINDING_TABLE);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error('forge_root_repair_binding_schema_row_preservation_failed');
    }
    db.exec(`DROP TABLE ${quoteSchemaObject('main', MIGRATION_TABLE)}`);
    createImmutableTriggers(db);
    verifyForeignKeys(db);
}

function applySchema(db: Database.Database): void {
    assertNoSchemaNameCollisions(db);
    if (!tableExists(db, FORGE_ROOT_REPAIR_BINDING_TABLE)) {
        db.exec(createTableSql(quoteSchemaObject('main', FORGE_ROOT_REPAIR_BINDING_TABLE)));
        createImmutableTriggers(db);
        return;
    }
    validateSchemaObjects(db);
    const shape = classifyTableShape(db);
    if (shape === 'legacy') migrateLegacyTable(db);
    else createImmutableTriggers(db);
}

export function ensureForgeRootRepairBindingSchema(db: Database.Database): void {
    if (db.inTransaction) {
        applySchema(db);
        return;
    }
    db.transaction(() => applySchema(db)).immediate();
}
