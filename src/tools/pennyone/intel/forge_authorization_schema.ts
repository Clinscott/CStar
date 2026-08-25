import type Database from 'better-sqlite3';

const LEGACY_TABLE = 'hall_forge_authorizations_exact_profile_legacy';
const MISSION_GRANT_REQUEST_TABLE = 'hall_forge_mission_grant_requests';
const MISSION_GRANT_REQUEST_MIGRATION_TABLE =
    'hall_forge_mission_grant_requests_authorization_migration_tmp';
export const FORGE_AUTHORIZATION_GUARD_TRIGGER = 'hall_forge_authorizations_one_use_guard';
export const FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER =
    'hall_forge_authorizations_one_use_update_guard';

export const FORGE_AUTHORIZATION_SCHEMA = `
    CREATE TABLE IF NOT EXISTS hall_forge_authorizations (
        authorization_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_sha256 TEXT NOT NULL,
        authorization_profile TEXT NOT NULL CHECK(
            authorization_profile IN (
                'root_user_forge_intent_v1',
                'autonomous_dispatch_policy_v1',
                'exact_request_challenge_v1'
            )
        ),
        authorization_binding_sha256 TEXT NOT NULL,
        challenge_sha256 TEXT,
        operator_intent_json TEXT,
        operator_authorization_ref TEXT NOT NULL UNIQUE,
        operator_thread_id TEXT NOT NULL,
        operator_turn_id TEXT NOT NULL,
        operator_message_sha256 TEXT NOT NULL,
        operator_record_sha256 TEXT NOT NULL,
        operator_record_set_sha256 TEXT NOT NULL,
        operator_record_count INTEGER NOT NULL CHECK(operator_record_count >= 1),
        execution_grant_schema TEXT,
        execution_grant_sha256 TEXT,
        execution_grant_json TEXT,
        authorized_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        CHECK(
            (authorization_profile = 'exact_request_challenge_v1'
                AND challenge_sha256 IS NOT NULL
                AND authorization_binding_sha256 = challenge_sha256
                AND operator_intent_json IS NULL)
            OR
            (authorization_profile = 'root_user_forge_intent_v1'
                AND challenge_sha256 IS NULL
                AND operator_intent_json IS NOT NULL)
            OR
            (authorization_profile = 'autonomous_dispatch_policy_v1'
                AND challenge_sha256 IS NULL
                AND operator_intent_json IS NOT NULL
                AND execution_grant_schema IS NULL
                AND execution_grant_sha256 IS NULL
                AND execution_grant_json IS NULL
                AND CASE
                    WHEN json_valid(operator_intent_json) <> 1 THEN 0
                    WHEN json_type(operator_intent_json, '$') IS NOT 'object' THEN 0
                    WHEN json_extract(operator_intent_json, '$.schema') IS NOT
                        'cstar.forge_operator_intent_projection.v1' THEN 0
                    WHEN json_extract(operator_intent_json, '$.action') IS NOT 'implement' THEN 0
                    WHEN json_extract(operator_intent_json, '$.requester_lineage_mode') IS NOT
                        'stored_set_manifest' THEN 0
                    WHEN json_extract(operator_intent_json, '$.subject.kind') IS NOT 'bead' THEN 0
                    WHEN json_type(operator_intent_json, '$.subject.value') IS NOT 'text' THEN 0
                    WHEN length(trim(json_extract(operator_intent_json, '$.subject.value'))) = 0 THEN 0
                    WHEN substr(trim(json_extract(operator_intent_json, '$.subject.value')), 1, 5)
                        IS NOT 'bead:' THEN 0
                    WHEN json_type(operator_intent_json, '$.subject.repo_id') IS NOT 'text' THEN 0
                    WHEN length(trim(json_extract(operator_intent_json, '$.subject.repo_id'))) = 0 THEN 0
                    ELSE 1
                END = 1)
        ),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
    );
`;

const FORGE_AUTHORIZATION_GUARD_SCHEMA = `
    CREATE TRIGGER IF NOT EXISTS ${FORGE_AUTHORIZATION_GUARD_TRIGGER}
    BEFORE INSERT ON hall_forge_authorizations
    WHEN EXISTS (
        SELECT 1 FROM hall_forge_authorizations
        WHERE operator_thread_id = NEW.operator_thread_id
          AND operator_turn_id = NEW.operator_turn_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'forge_operator_turn_already_consumed');
    END;
    CREATE TRIGGER IF NOT EXISTS ${FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER}
    BEFORE UPDATE OF operator_thread_id, operator_turn_id ON hall_forge_authorizations
    WHEN EXISTS (
        SELECT 1 FROM hall_forge_authorizations
        WHERE operator_thread_id = NEW.operator_thread_id
          AND operator_turn_id = NEW.operator_turn_id
          AND authorization_id <> OLD.authorization_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'forge_operator_turn_already_consumed');
    END;
`;

function tableColumns(db: Database.Database, table: string): Set<string> {
    return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
        .map((entry) => entry.name));
}

function ensureColumn(
    db: Database.Database,
    table: string,
    column: string,
    declaration: string,
): void {
    if (!tableColumns(db, table).has(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
}

function tableSql(db: Database.Database, table: string): string | undefined {
    const row = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : undefined;
}

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function escapedSqlIdentifier(identifier: string): string {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `(?:"${escaped}"|\`${escaped}\`|\\[${escaped}\\]|${escaped})`;
}

function replaceForeignKeyReference(sql: string, from: string, to: string): string {
    const pattern = new RegExp(
        `(\\bREFERENCES\\s+)${escapedSqlIdentifier(from)}(?=\\s*[,();])`,
        'gi',
    );
    return sql.replace(pattern, `$1${quoteIdentifier(to)}`);
}

function replaceCreateObjectName(
    sql: string,
    type: 'table' | 'index' | 'trigger',
    from: string,
    to: string,
): string {
    const prefix = type === 'table'
        ? '\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'
        : type === 'index'
            ? '\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'
            : '\\bCREATE\\s+TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?';
    const suffix = type === 'table'
        ? '(?=\\s*\\(\\s*)'
        : type === 'index'
            ? '(?=\\s+ON\\s+)'
            : '(?=\\s+)';
    const pattern = new RegExp(
        `(${prefix})${escapedSqlIdentifier(from)}${suffix}`,
        'i',
    );
    const replaced = sql.replace(pattern, `$1${quoteIdentifier(to)}`);
    if (replaced === sql) {
        throw new Error('forge_authorization_schema_child_definition_unrecognized');
    }
    return replaced;
}

function hasForeignKeyTarget(
    db: Database.Database,
    table: string,
    target: string,
): boolean {
    return (db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all() as Array<{
        table?: unknown;
    }>).some((foreignKey) => foreignKey.table === target);
}

function schemaObjectsForTable(
    db: Database.Database,
    table: string,
): Array<{ type: 'index' | 'trigger'; name: string; sql: string }> {
    return db.prepare(`
        SELECT type, name, sql
        FROM sqlite_master
        WHERE tbl_name = ?
          AND type IN ('index', 'trigger')
          AND sql IS NOT NULL
        ORDER BY type, name
    `).all(table) as Array<{ type: 'index' | 'trigger'; name: string; sql: string }>;
}

function rebuildMissionGrantRequestChild(db: Database.Database): boolean {
    const childSql = tableSql(db, MISSION_GRANT_REQUEST_TABLE);
    if (!childSql || !hasForeignKeyTarget(db, MISSION_GRANT_REQUEST_TABLE, LEGACY_TABLE)) {
        return false;
    }
    if (tableSql(db, MISSION_GRANT_REQUEST_MIGRATION_TABLE)) {
        throw new Error('forge_authorization_schema_stale_child_migration_table');
    }

    let migrationSql = replaceForeignKeyReference(
        childSql,
        LEGACY_TABLE,
        'hall_forge_authorizations',
    );
    migrationSql = replaceForeignKeyReference(
        migrationSql,
        MISSION_GRANT_REQUEST_TABLE,
        MISSION_GRANT_REQUEST_MIGRATION_TABLE,
    );
    migrationSql = replaceCreateObjectName(
        migrationSql,
        'table',
        MISSION_GRANT_REQUEST_TABLE,
        MISSION_GRANT_REQUEST_MIGRATION_TABLE,
    );
    const associatedObjects = schemaObjectsForTable(db, MISSION_GRANT_REQUEST_TABLE);

    db.exec(migrationSql);
    db.exec(`INSERT INTO ${quoteIdentifier(MISSION_GRANT_REQUEST_MIGRATION_TABLE)}
        SELECT * FROM ${quoteIdentifier(MISSION_GRANT_REQUEST_TABLE)}`);
    db.exec(`DROP TABLE ${quoteIdentifier(MISSION_GRANT_REQUEST_TABLE)}`);
    db.exec(`ALTER TABLE ${quoteIdentifier(MISSION_GRANT_REQUEST_MIGRATION_TABLE)}
        RENAME TO ${quoteIdentifier(MISSION_GRANT_REQUEST_TABLE)}`);
    for (const associatedObject of associatedObjects) {
        db.exec(replaceForeignKeyReference(
            associatedObject.sql,
            LEGACY_TABLE,
            'hall_forge_authorizations',
        ));
    }
    if (!hasForeignKeyTarget(db, MISSION_GRANT_REQUEST_TABLE, 'hall_forge_authorizations')) {
        throw new Error('forge_authorization_schema_child_foreign_key_retarget_failed');
    }
    return true;
}

function triggerSql(db: Database.Database, trigger: string): string | undefined {
    const row = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
    ).get(trigger) as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : undefined;
}

function hasForgeAuthorizationInsertGuard(db: Database.Database): boolean {
    const sql = triggerSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER);
    if (!sql) return false;
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    return normalized.includes('before insert on hall_forge_authorizations')
        && normalized.includes('when exists')
        && normalized.includes('select 1 from hall_forge_authorizations where')
        && normalized.includes('operator_thread_id = new.operator_thread_id')
        && normalized.includes('operator_turn_id = new.operator_turn_id')
        && normalized.includes("raise(abort, 'forge_operator_turn_already_consumed')");
}

function hasForgeAuthorizationUpdateGuard(db: Database.Database): boolean {
    const sql = triggerSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER);
    if (!sql) return false;
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    return normalized.includes('before update of operator_thread_id, operator_turn_id on hall_forge_authorizations')
        && normalized.includes('when exists')
        && normalized.includes('select 1 from hall_forge_authorizations where')
        && normalized.includes('operator_thread_id = new.operator_thread_id')
        && normalized.includes('operator_turn_id = new.operator_turn_id')
        && normalized.includes('authorization_id <> old.authorization_id')
        && normalized.includes("raise(abort, 'forge_operator_turn_already_consumed')");
}

function hasForgeAuthorizationGuard(db: Database.Database): boolean {
    return hasForgeAuthorizationInsertGuard(db)
        && hasForgeAuthorizationUpdateGuard(db);
}

function isCurrentAuthorizationSchema(
    db: Database.Database,
    sql: string | undefined,
): boolean {
    if (!sql) return false;
    const columns = tableColumns(db, 'hall_forge_authorizations');
    const required = [
        'authorization_id', 'request_id', 'request_sha256', 'authorization_profile',
        'authorization_binding_sha256', 'challenge_sha256', 'operator_intent_json',
        'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
        'operator_message_sha256', 'operator_record_sha256',
        'operator_record_set_sha256', 'operator_record_count',
        'execution_grant_schema', 'execution_grant_sha256', 'execution_grant_json',
        'authorized_at', 'expires_at', 'created_at',
    ];
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    return required.every((column) => columns.has(column))
        && normalized.includes("authorization_profile in ('root_user_forge_intent_v1', 'autonomous_dispatch_policy_v1', 'exact_request_challenge_v1')")
        && normalized.includes('authorization_binding_sha256 text not null')
        && normalized.includes('request_id text not null unique')
        && normalized.includes('operator_authorization_ref text not null unique')
        && normalized.includes('operator_record_count integer not null check(operator_record_count >= 1)')
        && normalized.includes('authorization_binding_sha256 = challenge_sha256')
        && normalized.includes('challenge_sha256 is null')
        && normalized.includes('operator_intent_json is not null')
        && normalized.includes("authorization_profile = 'root_user_forge_intent_v1'")
        && normalized.includes("authorization_profile = 'autonomous_dispatch_policy_v1'")
        && normalized.includes('execution_grant_schema is null')
        && normalized.includes('json_valid(operator_intent_json) <> 1')
        && normalized.includes("json_type(operator_intent_json, '$') is not 'object'")
        && normalized.includes("json_extract(operator_intent_json, '$.schema') is not 'cstar.forge_operator_intent_projection.v1'")
        && normalized.includes("json_extract(operator_intent_json, '$.action') is not 'implement'")
        && normalized.includes("json_extract(operator_intent_json, '$.requester_lineage_mode') is not 'stored_set_manifest'")
        && normalized.includes("json_extract(operator_intent_json, '$.subject.kind') is not 'bead'")
        && normalized.includes("json_type(operator_intent_json, '$.subject.value') is not 'text'")
        && normalized.includes("length(trim(json_extract(operator_intent_json, '$.subject.value'))) = 0")
        && normalized.includes("substr(trim(json_extract(operator_intent_json, '$.subject.value')), 1, 5) is not 'bead:'")
        && normalized.includes("json_type(operator_intent_json, '$.subject.repo_id') is not 'text'")
        && normalized.includes("length(trim(json_extract(operator_intent_json, '$.subject.repo_id'))) = 0")
        && normalized.includes('execution_grant_sha256 is null')
        && normalized.includes('execution_grant_json is null')
        && hasForgeAuthorizationGuard(db);
}

function createForgeAuthorizationGuard(db: Database.Database): void {
    db.exec(FORGE_AUTHORIZATION_GUARD_SCHEMA);
}

function migrateAuthorizationTable(db: Database.Database): void {
    const currentSql = tableSql(db, 'hall_forge_authorizations');
    if (!currentSql) {
        db.exec(FORGE_AUTHORIZATION_SCHEMA);
        createForgeAuthorizationGuard(db);
        return;
    }
    if (isCurrentAuthorizationSchema(db, currentSql)) return;
    if (tableSql(db, LEGACY_TABLE)) {
        throw new Error('forge_authorization_schema_stale_migration_table');
    }
    if (tableSql(db, MISSION_GRANT_REQUEST_MIGRATION_TABLE)) {
        throw new Error('forge_authorization_schema_stale_child_migration_table');
    }

    for (const [column, declaration] of [
        ['execution_grant_schema', 'TEXT'],
        ['execution_grant_sha256', 'TEXT'],
        ['execution_grant_json', 'TEXT'],
    ] as const) ensureColumn(db, 'hall_forge_authorizations', column, declaration);
    const oldColumns = tableColumns(db, 'hall_forge_authorizations');
    const bindingExpression = oldColumns.has('authorization_binding_sha256')
        ? 'COALESCE(authorization_binding_sha256, challenge_sha256)'
        : 'challenge_sha256';
    const intentExpression = oldColumns.has('operator_intent_json')
        ? 'operator_intent_json'
        : 'NULL';
    const before = db.prepare(`
        SELECT authorization_id, request_id, request_sha256, authorization_profile,
               ${bindingExpression} AS authorization_binding_sha256,
               challenge_sha256, ${intentExpression} AS operator_intent_json,
               operator_authorization_ref, operator_thread_id,
               operator_turn_id, operator_message_sha256, operator_record_sha256,
               operator_record_set_sha256, operator_record_count,
               execution_grant_schema, execution_grant_sha256, execution_grant_json,
               authorized_at, expires_at, created_at
        FROM hall_forge_authorizations ORDER BY authorization_id
    `).all();

    db.exec(`ALTER TABLE hall_forge_authorizations RENAME TO ${LEGACY_TABLE}`);
    db.exec(FORGE_AUTHORIZATION_SCHEMA);
    db.exec(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, challenge_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            execution_grant_schema, execution_grant_sha256, execution_grant_json,
            authorized_at, expires_at, created_at
        )
        SELECT authorization_id, request_id, request_sha256, authorization_profile,
               ${bindingExpression}, challenge_sha256, ${intentExpression},
               operator_authorization_ref, operator_thread_id, operator_turn_id,
               operator_message_sha256, operator_record_sha256,
               operator_record_set_sha256, operator_record_count,
               execution_grant_schema, execution_grant_sha256, execution_grant_json,
               authorized_at, expires_at, created_at
        FROM ${LEGACY_TABLE}
    `);
    const after = db.prepare(`
        SELECT authorization_id, request_id, request_sha256, authorization_profile,
               authorization_binding_sha256, challenge_sha256, operator_intent_json,
               operator_authorization_ref, operator_thread_id,
               operator_turn_id, operator_message_sha256, operator_record_sha256,
               operator_record_set_sha256, operator_record_count,
               execution_grant_schema, execution_grant_sha256, execution_grant_json,
               authorized_at, expires_at, created_at
        FROM hall_forge_authorizations ORDER BY authorization_id
    `).all();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error('forge_authorization_schema_row_preservation_failed');
    }
    rebuildMissionGrantRequestChild(db);
    db.exec(`DROP TABLE ${LEGACY_TABLE}`);
    createForgeAuthorizationGuard(db);
    const foreignKeyFailures = db.prepare(
        'PRAGMA foreign_key_check(hall_forge_authorizations)',
    ).all();
    if (foreignKeyFailures.length > 0) {
        throw new Error('forge_authorization_schema_foreign_key_check_failed');
    }
}

function applyForgeAuthorizationSchema(db: Database.Database): void {
    ensureColumn(db, 'hall_forge_requests', 'authorization_profile', 'TEXT');
    ensureColumn(db, 'hall_forge_requests', 'authorization_challenge_sha256', 'TEXT');
    ensureColumn(db, 'hall_forge_requests', 'authorization_binding_sha256', 'TEXT');
    db.exec(`
        UPDATE hall_forge_requests
        SET authorization_binding_sha256 = authorization_challenge_sha256
        WHERE authorization_profile = 'exact_request_challenge_v1'
          AND authorization_binding_sha256 IS NULL
          AND authorization_challenge_sha256 IS NOT NULL
    `);
    migrateAuthorizationTable(db);
}

export function ensureForgeAuthorizationSchema(db: Database.Database): void {
    if (db.inTransaction) {
        applyForgeAuthorizationSchema(db);
        return;
    }
    db.transaction(() => applyForgeAuthorizationSchema(db)).immediate();
}
