import Database from 'better-sqlite3';

import { database } from './database.js';
import { assertStableHallStoreIdentity, resolveHallStorePath } from './hall_store_path.js';

interface HallDatabaseCompatibility {
    getReadDb?: (rootPath?: string) => Database.Database;
    getWritableDb?: (rootPath?: string) => Database.Database;
    getDb?: (rootPath?: string) => Database.Database;
}

export interface ForgeReadHandle {
    db: Database.Database;
    release: () => void;
}

const FORGE_AUTHORIZATION_SCHEMA = `
    CREATE TABLE IF NOT EXISTS hall_forge_authorizations (
        authorization_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_sha256 TEXT NOT NULL,
        authorization_profile TEXT NOT NULL CHECK(authorization_profile = 'exact_request_challenge_v1'),
        challenge_sha256 TEXT NOT NULL,
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
        UNIQUE(operator_thread_id, operator_turn_id),
        FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
    );
`;

function ensureColumn(
    db: Database.Database,
    table: string,
    column: string,
    declaration: string,
): void {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    if (!columns.some((entry) => entry.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
}

export function ensureForgeActivationSchema(db: Database.Database): void {
    db.transaction(() => {
        db.exec(FORGE_AUTHORIZATION_SCHEMA);
        for (const [table, column, declaration] of [
            ['hall_forge_requests', 'operator_record_set_sha256', 'TEXT'],
            ['hall_forge_requests', 'operator_record_count', 'INTEGER'],
            ['hall_forge_requests', 'requester_thread_id', 'TEXT'],
            ['hall_forge_requests', 'requester_turn_id', 'TEXT'],
            ['hall_forge_requests', 'requester_record_set_sha256', 'TEXT'],
            ['hall_forge_requests', 'authorization_profile', 'TEXT'],
            ['hall_forge_requests', 'authorization_challenge_sha256', 'TEXT'],
            ['hall_forge_attempts', 'validation_authority', 'TEXT'],
            ['hall_forge_attempts', 'validation_evidence_sha256', 'TEXT'],
            ['hall_forge_authorizations', 'execution_grant_schema', 'TEXT'],
            ['hall_forge_authorizations', 'execution_grant_sha256', 'TEXT'],
            ['hall_forge_authorizations', 'execution_grant_json', 'TEXT'],
            ['hall_validation_runs', 'authority_class', "TEXT NOT NULL DEFAULT 'legacy_unverified'"],
            ['hall_validation_runs', 'evidence_sha256', 'TEXT'],
            ['hall_validation_runs', 'validator_identity', 'TEXT'],
            ['hall_validation_runs', 'validator_identity_source', 'TEXT'],
            ['hall_validation_runs', 'evidence_manifest_json', 'TEXT'],
        ] as const) {
            ensureColumn(db, table, column, declaration);
        }
    }).immediate();
}

export function openForgeReadDb(rootPath: string): ForgeReadHandle {
    const compatibility = database as unknown as HallDatabaseCompatibility;
    if (typeof compatibility.getReadDb === 'function') {
        return { db: compatibility.getReadDb.call(database, rootPath), release: () => undefined };
    }

    const store = resolveHallStorePath(rootPath, false);
    const db = new Database(store.dbPath, { readonly: true, fileMustExist: true });
    try {
        assertStableHallStoreIdentity(store);
        db.pragma('query_only = ON');
    } catch (error) {
        db.close();
        throw error;
    }
    let released = false;
    return {
        db,
        release: () => {
            if (released) return;
            released = true;
            db.close();
        },
    };
}

export function getForgeWritableDb(rootPath: string): Database.Database {
    const compatibility = database as unknown as HallDatabaseCompatibility;
    const db = typeof compatibility.getWritableDb === 'function'
        ? compatibility.getWritableDb.call(database, rootPath)
        : compatibility.getDb?.call(database, rootPath);
    if (!db) throw new Error('hall_writable_store_unavailable');
    ensureForgeActivationSchema(db);
    return db;
}
