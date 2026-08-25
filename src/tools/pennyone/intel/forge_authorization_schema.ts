import type Database from 'better-sqlite3';

const LEGACY_TABLE = 'hall_forge_authorizations_exact_profile_legacy';

export const FORGE_AUTHORIZATION_SCHEMA = `
    CREATE TABLE IF NOT EXISTS hall_forge_authorizations (
        authorization_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_sha256 TEXT NOT NULL,
        authorization_profile TEXT NOT NULL CHECK(
            authorization_profile IN ('root_user_forge_intent_v1', 'exact_request_challenge_v1')
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
        operator_record_count INTEGER NOT NULL CHECK(operator_record_count = 1),
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
        ),
        UNIQUE(operator_thread_id, operator_turn_id),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
    );
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
        && normalized.includes("authorization_profile in ('root_user_forge_intent_v1', 'exact_request_challenge_v1')")
        && normalized.includes('authorization_binding_sha256 text not null')
        && normalized.includes('request_id text not null unique')
        && normalized.includes('operator_authorization_ref text not null unique')
        && normalized.includes('unique(operator_thread_id, operator_turn_id)')
        && normalized.includes('authorization_binding_sha256 = challenge_sha256')
        && normalized.includes('challenge_sha256 is null')
        && normalized.includes('operator_intent_json is not null');
}

function migrateAuthorizationTable(db: Database.Database): void {
    const currentSql = tableSql(db, 'hall_forge_authorizations');
    if (!currentSql) {
        db.exec(FORGE_AUTHORIZATION_SCHEMA);
        return;
    }
    if (isCurrentAuthorizationSchema(db, currentSql)) return;
    if (tableSql(db, LEGACY_TABLE)) {
        throw new Error('forge_authorization_schema_stale_migration_table');
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
    db.exec(`DROP TABLE ${LEGACY_TABLE}`);
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
