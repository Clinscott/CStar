import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    ensureForgeAuthorizationSchema,
    FORGE_AUTHORIZATION_GUARD_TRIGGER,
    FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER,
} from '../../../src/tools/pennyone/intel/forge_authorization_schema.js';

const AUTHORIZATION_COLUMNS = [
    'authorization_id', 'request_id', 'request_sha256', 'authorization_profile',
    'authorization_binding_sha256', 'challenge_sha256', 'operator_intent_json',
    'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
    'operator_message_sha256', 'operator_record_sha256',
    'operator_record_set_sha256', 'operator_record_count',
    'execution_grant_schema', 'execution_grant_sha256', 'execution_grant_json',
    'authorized_at', 'expires_at', 'created_at',
].join(', ');

function createAuthorizationTables(
    db: Database.Database,
    options: { uniquePair?: boolean; validProfileCheck?: boolean } = {},
): void {
    const profileCheck = options.validProfileCheck === false
        ? ''
        : "CHECK(authorization_profile IN ('root_user_forge_intent_v1', 'exact_request_challenge_v1'))";
    const integrityCheck = options.validProfileCheck === false
        ? ''
        : `, CHECK(
                (authorization_profile = 'exact_request_challenge_v1'
                    AND challenge_sha256 IS NOT NULL
                    AND authorization_binding_sha256 = challenge_sha256
                    AND operator_intent_json IS NULL)
                OR
                (authorization_profile = 'root_user_forge_intent_v1'
                    AND challenge_sha256 IS NULL
                    AND operator_intent_json IS NOT NULL)
            )`;
    const uniquePair = options.uniquePair ? ', UNIQUE(operator_thread_id, operator_turn_id)' : '';
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);
        CREATE TABLE hall_forge_authorizations (
            authorization_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            request_sha256 TEXT NOT NULL,
            authorization_profile TEXT NOT NULL ${profileCheck},
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
            created_at INTEGER NOT NULL${integrityCheck}${uniquePair},
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
        );
    `);
}

function insertRequest(db: Database.Database, suffix: string): string {
    const requestId = `request-${suffix}`;
    db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(requestId);
    return requestId;
}

function insertExactAuthorization(
    db: Database.Database,
    suffix: string,
    threadId: string,
    turnId: string,
): void {
    const requestId = insertRequest(db, suffix);
    const challenge = suffix.padEnd(64, '0').slice(0, 64);
    db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, challenge_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            execution_grant_schema, execution_grant_sha256, execution_grant_json,
            authorized_at, expires_at, created_at
        ) VALUES (?, ?, ?, 'exact_request_challenge_v1', ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1,
                  NULL, NULL, NULL, 10, 20, 10)
    `).run(
        `authorization-${suffix}`,
        requestId,
        suffix.padEnd(64, '1').slice(0, 64),
        challenge,
        challenge,
        `legacy-ref-${suffix}`,
        threadId,
        turnId,
        suffix.padEnd(64, '2').slice(0, 64),
        suffix.padEnd(64, '3').slice(0, 64),
        suffix.padEnd(64, '4').slice(0, 64),
    );
}

function authorizationSnapshot(db: Database.Database): Array<Record<string, unknown>> {
    return db.prepare(
        `SELECT ${AUTHORIZATION_COLUMNS} FROM hall_forge_authorizations ORDER BY authorization_id`,
    ).all() as Array<Record<string, unknown>>;
}

function guardSql(db: Database.Database, trigger: string): string {
    return String(db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
    ).pluck().get(trigger));
}

describe('Forge authorization schema legacy duplicate migration', () => {
    it('preserves legacy duplicate pairs and atomically guards every new insert', () => {
        const db = new Database(':memory:');
        createAuthorizationTables(db);
        insertExactAuthorization(db, 'legacy-a', 'legacy-thread', 'legacy-turn');
        insertExactAuthorization(db, 'legacy-b', 'legacy-thread', 'legacy-turn');
        const before = authorizationSnapshot(db);

        ensureForgeAuthorizationSchema(db);

        assert.deepEqual(authorizationSnapshot(db), before);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').pluck().get(),
            2,
        );
        assert.match(guardSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER), /BEFORE INSERT ON hall_forge_authorizations/i);
        assert.match(
            guardSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER),
            /BEFORE UPDATE OF operator_thread_id, operator_turn_id ON hall_forge_authorizations/i,
        );
        assert.throws(
            () => insertExactAuthorization(db, 'legacy-reuse', 'legacy-thread', 'legacy-turn'),
            /forge_operator_turn_already_consumed/i,
        );
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').pluck().get(),
            2,
        );

        insertExactAuthorization(db, 'fresh-a', 'fresh-thread', 'fresh-turn');
        assert.throws(
            () => insertExactAuthorization(db, 'fresh-b', 'fresh-thread', 'fresh-turn'),
            /forge_operator_turn_already_consumed/i,
        );
        insertExactAuthorization(db, 'unrelated', 'other-thread', 'other-turn');
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').pluck().get(),
            4,
        );
        db.close();
    });

    it('gives a fresh database a guard and makes repeated ensure idempotent', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);');

        ensureForgeAuthorizationSchema(db);
        const firstTable = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'",
        ).pluck().get();
        const firstGuard = guardSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER);
        const firstUpdateGuard = guardSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER);
        ensureForgeAuthorizationSchema(db);

        assert.equal(guardSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER), firstGuard);
        assert.equal(guardSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER), firstUpdateGuard);
        assert.equal(
            db.prepare(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'",
        ).pluck().get(),
            firstTable,
        );
        assert.match(firstGuard, /RAISE\(ABORT, 'forge_operator_turn_already_consumed'\)/i);
        assert.match(
            firstUpdateGuard,
            /authorization_id <> OLD.authorization_id/i,
        );
        db.close();
    });

    it('upgrades a readable current table-level-unique schema to the trigger guard', () => {
        const db = new Database(':memory:');
        createAuthorizationTables(db, { uniquePair: true });
        insertExactAuthorization(db, 'current', 'current-thread', 'current-turn');
        const before = authorizationSnapshot(db);

        ensureForgeAuthorizationSchema(db);

        assert.deepEqual(authorizationSnapshot(db), before);
        assert.match(guardSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER), /BEFORE INSERT ON hall_forge_authorizations/i);
        assert.match(
            guardSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER),
            /BEFORE UPDATE OF operator_thread_id, operator_turn_id ON hall_forge_authorizations/i,
        );
        assert.throws(
            () => insertExactAuthorization(db, 'current-reuse', 'current-thread', 'current-turn'),
            /forge_operator_turn_already_consumed/i,
        );
        db.close();
    });

    it('guards updates while allowing self and genuinely unused pairs', () => {
        const db = new Database(':memory:');
        createAuthorizationTables(db);
        insertExactAuthorization(db, 'legacy-a', 'legacy-thread', 'legacy-turn');
        insertExactAuthorization(db, 'legacy-b', 'legacy-thread', 'legacy-turn');
        insertExactAuthorization(db, 'unrelated', 'unrelated-thread', 'unrelated-turn');
        ensureForgeAuthorizationSchema(db);

        const unrelatedBefore = db.prepare(
            'SELECT * FROM hall_forge_authorizations WHERE authorization_id = ?',
        ).get('authorization-unrelated');
        assert.throws(
            () => db.prepare(`
                UPDATE hall_forge_authorizations
                SET operator_thread_id = ?, operator_turn_id = ?
                WHERE authorization_id = ?
            `).run('legacy-thread', 'legacy-turn', 'authorization-unrelated'),
            /forge_operator_turn_already_consumed/i,
        );
        assert.deepEqual(
            db.prepare('SELECT * FROM hall_forge_authorizations WHERE authorization_id = ?')
                .get('authorization-unrelated'),
            unrelatedBefore,
        );

        const selfUpdate = db.prepare(`
            UPDATE hall_forge_authorizations
            SET operator_thread_id = ?, operator_turn_id = ?
            WHERE authorization_id = ?
        `).run('unrelated-thread', 'unrelated-turn', 'authorization-unrelated');
        assert.equal(selfUpdate.changes, 1);
        const unusedUpdate = db.prepare(`
            UPDATE hall_forge_authorizations
            SET operator_thread_id = ?, operator_turn_id = ?
            WHERE authorization_id = ?
        `).run('unused-thread', 'unused-turn', 'authorization-unrelated');
        assert.equal(unusedUpdate.changes, 1);
        assert.deepEqual(
            db.prepare(`
                SELECT operator_thread_id, operator_turn_id
                FROM hall_forge_authorizations
                WHERE authorization_id = ?
            `).get('authorization-unrelated'),
            { operator_thread_id: 'unused-thread', operator_turn_id: 'unused-turn' },
        );
        db.close();
    });

    it('rolls back a failed migration without leaving the renamed legacy table', () => {
        const db = new Database(':memory:');
        createAuthorizationTables(db, { validProfileCheck: false });
        const requestId = insertRequest(db, 'invalid');
        const invalid = 'invalid-profile';
        db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                authorization_binding_sha256, challenge_sha256, operator_intent_json,
                operator_authorization_ref, operator_thread_id, operator_turn_id,
                operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, 10, 20, 10)
        `).run(
            invalid, requestId, '1'.repeat(64), 'invalid_profile', '2'.repeat(64), '2'.repeat(64),
            'invalid-ref', 'invalid-thread', 'invalid-turn', '3'.repeat(64),
            '4'.repeat(64), '5'.repeat(64),
        );

        let migrationError: unknown;
        try {
            ensureForgeAuthorizationSchema(db);
        } catch (error) {
            migrationError = error;
        }
        assert.equal(
            (migrationError as { code?: unknown } | undefined)?.code,
            'SQLITE_CONSTRAINT_CHECK',
        );
        assert.equal(
            db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'",
            ).pluck().get(),
            'hall_forge_authorizations',
        );
        assert.equal(
            db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations_exact_profile_legacy'",
            ).pluck().get(),
            undefined,
        );
        assert.equal(guardSql(db, FORGE_AUTHORIZATION_GUARD_TRIGGER), 'undefined');
        assert.equal(guardSql(db, FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER), 'undefined');
        assert.equal(
            db.prepare('SELECT authorization_profile FROM hall_forge_authorizations').pluck().get(),
            'invalid_profile',
        );
        db.close();
    });
});
