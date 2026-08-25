import type Database from 'better-sqlite3';

const MIGRATION_TABLE = 'hall_forge_requests_correction_migration';
const ACTIVE_DECISION_INDEX = 'idx_hall_forge_requests_active_decision';
const FOREIGN_KEY_ERROR_LIMIT = 20;
const BASE_COLUMNS = [
    'request_id', 'repo_id', 'bead_id', 'decision_id',
    'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
    'operator_message_sha256', 'operator_record_sha256',
    'operator_record_set_sha256', 'operator_record_count',
    'requester_thread_id', 'requester_turn_id', 'requester_record_set_sha256',
    'authorization_profile', 'authorization_binding_sha256',
    'authorization_challenge_sha256', 'request_sha256', 'request_summary_json',
    'adapter_ref', 'write_capability', 'target_paths_sha256',
    'live_source_allowed', 'max_attempts', 'status', 'active_attempt_id',
    'authorized_at', 'expires_at', 'created_at', 'updated_at', 'completed_at',
] as const;

interface ForeignKeyViolation {
    table: string;
    rowid: number | string | null;
    parent: string;
    fkid: number;
}

function requestTableSql(table: string, ifNotExists: boolean): string {
    return `
        CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${table} (
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
            operator_record_count INTEGER CHECK(
                operator_record_count IS NULL OR operator_record_count >= 1
            ),
            requester_thread_id TEXT,
            requester_turn_id TEXT,
            requester_record_set_sha256 TEXT,
            authorization_profile TEXT,
            authorization_binding_sha256 TEXT,
            authorization_challenge_sha256 TEXT,
            request_sha256 TEXT NOT NULL,
            request_summary_json TEXT NOT NULL,
            adapter_ref TEXT,
            write_capability TEXT CHECK(
                write_capability IN ('response_only', 'project_files')
            ),
            target_paths_sha256 TEXT NOT NULL,
            live_source_allowed INTEGER NOT NULL CHECK(live_source_allowed IN (0, 1)),
            max_attempts INTEGER NOT NULL CHECK(max_attempts >= 1 AND max_attempts <= 10),
            status TEXT NOT NULL CHECK(status IN (
                'PENDING_AUTH', 'AUTHORIZED', 'SUCCEEDED', 'FAILED_FINAL',
                'EXHAUSTED', 'AMBIGUOUS', 'REVOKED', 'SUPERSEDED'
            )),
            active_attempt_id TEXT,
            authorized_at INTEGER,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            superseded_by TEXT,
            supersedes_request_id TEXT UNIQUE,
            UNIQUE(operator_authorization_ref),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(supersedes_request_id) REFERENCES hall_forge_requests(request_id)
        )
    `;
}

const REQUEST_INDEX_SQL = `
    CREATE INDEX IF NOT EXISTS idx_hall_forge_requests_bead_status
    ON hall_forge_requests(bead_id, status, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_forge_requests_one_shot_authorization
    ON hall_forge_requests(operator_authorization_ref);

    CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_DECISION_INDEX}
    ON hall_forge_requests(bead_id, decision_id)
    WHERE status <> 'SUPERSEDED';
`;

export const FORGE_REQUEST_SCHEMA = `
    ${requestTableSql('hall_forge_requests', true)};
    ${REQUEST_INDEX_SQL}
`;

function tableColumns(db: Database.Database): Set<string> {
    return new Set((db.prepare(
        'PRAGMA table_info(hall_forge_requests)',
    ).all() as Array<{ name: string }>).map((entry) => entry.name));
}

function tableSql(db: Database.Database): string | undefined {
    const row = db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'hall_forge_requests'
    `).get() as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : undefined;
}

function activeDecisionIndexIsExact(db: Database.Database): boolean {
    const listed = (db.prepare(
        'PRAGMA index_list(hall_forge_requests)',
    ).all() as Array<Record<string, unknown>>).find(
        (entry) => entry.name === ACTIVE_DECISION_INDEX,
    );
    if (Number(listed?.unique) !== 1 || Number(listed?.partial) !== 1) return false;
    const columns = (db.prepare(
        `PRAGMA index_info(${ACTIVE_DECISION_INDEX})`,
    ).all() as Array<Record<string, unknown>>).map((entry) => String(entry.name));
    if (JSON.stringify(columns) !== JSON.stringify(['bead_id', 'decision_id'])) return false;
    const row = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    ).get(ACTIVE_DECISION_INDEX) as { sql?: unknown } | undefined;
    const normalized = typeof row?.sql === 'string'
        ? row.sql.replace(/\s+/g, ' ').trim().toLowerCase() : '';
    return normalized === `create unique index ${ACTIVE_DECISION_INDEX} `
        + "on hall_forge_requests(bead_id, decision_id) where status <> 'superseded'";
}

function requestSchemaIsCurrent(db: Database.Database, sql: string): boolean {
    const columns = tableColumns(db);
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    return BASE_COLUMNS.every((column) => columns.has(column))
        && columns.has('superseded_by') && columns.has('supersedes_request_id')
        && normalized.includes("'revoked', 'superseded'")
        && !normalized.includes('unique(bead_id, decision_id)')
        && activeDecisionIndexIsExact(db);
}

function canonicalForeignKeyViolations(db: Database.Database): ForeignKeyViolation[] {
    const rows = db.prepare('PRAGMA foreign_key_check').all() as Array<{
        table?: unknown;
        rowid?: unknown;
        parent?: unknown;
        fkid?: unknown;
    }>;
    return rows.map((row) => ({
        table: String(row.table),
        rowid: typeof row.rowid === 'number' || typeof row.rowid === 'string'
            ? row.rowid : null,
        parent: String(row.parent),
        fkid: Number(row.fkid),
    })).sort((left, right) => {
        const leftKey = JSON.stringify(left);
        const rightKey = JSON.stringify(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function migrationDependencyViolation(row: ForeignKeyViolation): boolean {
    return row.table === 'hall_forge_requests'
        || row.parent === 'hall_forge_requests'
        || row.table === MIGRATION_TABLE
        || row.parent === MIGRATION_TABLE;
}

function assertForeignKeysPreserved(
    before: ForeignKeyViolation[],
    after: ForeignKeyViolation[],
): void {
    const beforeKeys = new Set(before.map((row) => JSON.stringify(row)));
    const afterKeys = new Set(after.map((row) => JSON.stringify(row)));
    const added = after.filter((row) => !beforeKeys.has(JSON.stringify(row)));
    const removed = before.filter((row) => !afterKeys.has(JSON.stringify(row)));
    const exactBaseline = JSON.stringify(before) === JSON.stringify(after);
    if (exactBaseline) return;
    const migratedDependencies = added.filter(migrationDependencyViolation);
    const detail = {
        before_count: before.length,
        after_count: after.length,
        added: added.slice(0, FOREIGN_KEY_ERROR_LIMIT),
        removed: removed.slice(0, FOREIGN_KEY_ERROR_LIMIT),
        migrated_dependencies: migratedDependencies.slice(0, FOREIGN_KEY_ERROR_LIMIT),
        truncated: added.length > FOREIGN_KEY_ERROR_LIMIT
            || removed.length > FOREIGN_KEY_ERROR_LIMIT
            || migratedDependencies.length > FOREIGN_KEY_ERROR_LIMIT,
    };
    throw new Error(
        `forge_request_correction_schema_foreign_key_check_failed:${JSON.stringify(detail)}`,
    );
}

function migrateRequestTable(db: Database.Database): void {
    if (db.inTransaction) throw new Error('forge_request_correction_schema_requires_outer_boundary');
    const foreignKeys = Number(db.pragma('foreign_keys', { simple: true })) === 1;
    if (foreignKeys) db.pragma('foreign_keys = OFF');
    try {
        db.transaction(() => {
            if (tableSqlFor(db, MIGRATION_TABLE)) {
                throw new Error('forge_request_correction_schema_stale_migration_table');
            }
            const foreignKeyBaseline = canonicalForeignKeyViolations(db);
            const columns = BASE_COLUMNS.join(', ');
            const before = db.prepare(
                `SELECT ${columns} FROM hall_forge_requests ORDER BY request_id`,
            ).all();
            db.exec(`${requestTableSql(MIGRATION_TABLE, false)};`);
            db.exec(`
                INSERT INTO ${MIGRATION_TABLE} (${columns})
                SELECT ${columns} FROM hall_forge_requests
            `);
            const copied = db.prepare(
                `SELECT ${columns} FROM ${MIGRATION_TABLE} ORDER BY request_id`,
            ).all();
            if (JSON.stringify(before) !== JSON.stringify(copied)) {
                throw new Error('forge_request_correction_schema_row_preservation_failed');
            }
            db.exec('DROP TABLE hall_forge_requests');
            db.exec(`ALTER TABLE ${MIGRATION_TABLE} RENAME TO hall_forge_requests`);
            db.exec(REQUEST_INDEX_SQL);
            assertForeignKeysPreserved(
                foreignKeyBaseline,
                canonicalForeignKeyViolations(db),
            );
        }).immediate();
    } finally {
        if (foreignKeys) db.pragma('foreign_keys = ON');
    }
}

function tableSqlFor(db: Database.Database, name: string): string | undefined {
    const row = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(name) as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : undefined;
}

export function ensureForgeRequestCorrectionSchema(db: Database.Database): void {
    const sql = tableSql(db);
    if (!sql) return;
    const columns = tableColumns(db);
    if (!BASE_COLUMNS.every((column) => columns.has(column))) return;
    if (requestSchemaIsCurrent(db, sql)) return;
    migrateRequestTable(db);
}
