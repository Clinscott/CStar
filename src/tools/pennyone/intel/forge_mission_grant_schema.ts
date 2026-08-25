import type Database from 'better-sqlite3';

const MISSION_GRANT_REQUESTS_TABLE = 'hall_forge_mission_grant_requests';
const LEGACY_AUTHORIZATION_TABLE = 'hall_forge_authorizations_exact_profile_legacy';

const MISSION_GRANT_REQUESTS_TABLE_SQL = `
    CREATE TABLE hall_forge_mission_grant_requests_repair (
        mission_grant_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        authorization_id TEXT NOT NULL UNIQUE,
        request_scope_sha256 TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(mission_grant_id, request_id),
        FOREIGN KEY(mission_grant_id)
            REFERENCES hall_forge_mission_grants(mission_grant_id),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id),
        FOREIGN KEY(authorization_id)
            REFERENCES hall_forge_authorizations(authorization_id)
    );
`;

export const FORGE_MISSION_GRANT_SCHEMA = `
    CREATE TABLE IF NOT EXISTS hall_forge_mission_grants (
        mission_grant_id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        mission_decision_id TEXT NOT NULL,
        root_bead_id TEXT NOT NULL,
        allowed_child_lineage_json TEXT NOT NULL,
        root_thread_id TEXT NOT NULL,
        set_turn_id TEXT NOT NULL,
        set_record_sha256 TEXT NOT NULL,
        set_record_set_sha256 TEXT NOT NULL,
        set_record_count INTEGER NOT NULL CHECK(set_record_count >= 1),
        design_sha256 TEXT NOT NULL,
        allowed_targets_json TEXT NOT NULL,
        allowed_outputs_json TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        prohibited_actions_json TEXT NOT NULL,
        adapter_ref TEXT NOT NULL,
        write_capability TEXT NOT NULL CHECK(write_capability IN ('response_only', 'project_files')),
        total_provider_attempt_ceiling INTEGER NOT NULL
            CHECK(total_provider_attempt_ceiling >= 1),
        retry_derived_iteration_ceiling INTEGER NOT NULL
            CHECK(retry_derived_iteration_ceiling >= 0),
        paid_attempt_ceiling INTEGER NOT NULL CHECK(paid_attempt_ceiling >= 0),
        authorized_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(
            status IN ('ACTIVE', 'BLOCKED', 'REVOKED', 'EXPIRED', 'EXHAUSTED')
        ),
        revocation_state TEXT NOT NULL CHECK(revocation_state IN ('ACTIVE', 'REVOKED')),
        blocked_reason TEXT,
        revoked_at INTEGER,
        revocation_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(repo_id, mission_decision_id, root_thread_id, set_record_set_sha256)
    );

    CREATE TABLE IF NOT EXISTS hall_forge_mission_grant_requests (
        mission_grant_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        authorization_id TEXT NOT NULL UNIQUE,
        request_scope_sha256 TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(mission_grant_id, request_id),
        FOREIGN KEY(mission_grant_id)
            REFERENCES hall_forge_mission_grants(mission_grant_id),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id),
        FOREIGN KEY(authorization_id)
            REFERENCES hall_forge_authorizations(authorization_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hall_forge_mission_grant_requests_grant
    ON hall_forge_mission_grant_requests(mission_grant_id, created_at, request_id);

    CREATE TABLE IF NOT EXISTS hall_forge_mission_grant_reservations (
        attempt_id TEXT PRIMARY KEY,
        mission_grant_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        root_thread_id TEXT NOT NULL,
        set_turn_id TEXT NOT NULL,
        set_record_set_sha256 TEXT NOT NULL,
        root_session_record_set_sha256 TEXT NOT NULL,
        root_session_record_count INTEGER NOT NULL
            CHECK(root_session_record_count >= 1),
        root_session_file_bytes INTEGER NOT NULL
            CHECK(root_session_file_bytes >= 1),
        verified_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(attempt_id) REFERENCES hall_forge_attempts(attempt_id),
        FOREIGN KEY(mission_grant_id)
            REFERENCES hall_forge_mission_grants(mission_grant_id),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hall_forge_mission_grant_reservations_grant
    ON hall_forge_mission_grant_reservations(
        mission_grant_id, created_at, attempt_id
    );
`;

function missionGrantRequestTableSql(db: Database.Database): string | undefined {
    const row = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(MISSION_GRANT_REQUESTS_TABLE) as { sql?: unknown } | undefined;
    return typeof row?.sql === 'string' ? row.sql : undefined;
}

function repairLegacyAuthorizationForeignKey(db: Database.Database): void {
    const sql = missionGrantRequestTableSql(db);
    if (!sql || !sql.includes(LEGACY_AUTHORIZATION_TABLE)) return;

    db.exec(MISSION_GRANT_REQUESTS_TABLE_SQL);
    db.exec(`
        INSERT INTO hall_forge_mission_grant_requests_repair (
            mission_grant_id, request_id, authorization_id,
            request_scope_sha256, created_at
        )
        SELECT mission_grant_id, request_id, authorization_id,
               request_scope_sha256, created_at
        FROM ${MISSION_GRANT_REQUESTS_TABLE}
    `);
    db.exec(`DROP TABLE ${MISSION_GRANT_REQUESTS_TABLE}`);
    db.exec(`ALTER TABLE hall_forge_mission_grant_requests_repair
        RENAME TO ${MISSION_GRANT_REQUESTS_TABLE}`);
}

export function ensureForgeMissionGrantSchema(db: Database.Database): void {
    const apply = (): void => {
        repairLegacyAuthorizationForeignKey(db);
        db.exec(FORGE_MISSION_GRANT_SCHEMA);
    };
    if (db.inTransaction) apply();
    else db.transaction(apply).immediate();
}
