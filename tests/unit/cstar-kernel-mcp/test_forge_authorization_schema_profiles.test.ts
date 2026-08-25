import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    ensureForgeAuthorizationSchema,
    FORGE_AUTHORIZATION_GUARD_TRIGGER,
} from '../../../src/tools/pennyone/intel/forge_authorization_schema.js';

const AUTONOMOUS_PROFILE = 'autonomous_dispatch_policy_v1';
const AUTONOMOUS_INTENT_SCHEMA = 'cstar.forge_operator_intent_projection.v1';
const AUTHORIZATION_COLUMNS = [
    'authorization_id', 'request_id', 'request_sha256', 'authorization_profile',
    'authorization_binding_sha256', 'challenge_sha256', 'operator_intent_json',
    'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
    'operator_message_sha256', 'operator_record_sha256',
    'operator_record_set_sha256', 'operator_record_count',
    'execution_grant_schema', 'execution_grant_sha256', 'execution_grant_json',
    'authorized_at', 'expires_at', 'created_at',
].join(', ');

function createLegacyTables(db: Database.Database): void {
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);
        CREATE TABLE hall_forge_authorizations (
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
                (authorization_profile IN ('root_user_forge_intent_v1', 'autonomous_dispatch_policy_v1')
                    AND challenge_sha256 IS NULL
                    AND operator_intent_json IS NOT NULL)
            ),
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
        );
        CREATE TABLE hall_forge_mission_grant_requests (
            mission_grant_request_id TEXT PRIMARY KEY,
            authorization_id TEXT NOT NULL,
            grant_payload TEXT NOT NULL,
            FOREIGN KEY(authorization_id) REFERENCES hall_forge_authorizations(authorization_id)
        );
        CREATE INDEX idx_hall_forge_mission_grant_requests_authorization
            ON hall_forge_mission_grant_requests(authorization_id);
    `);
}

function insertRequest(db: Database.Database, suffix: string): string {
    const requestId = `request-${suffix}`;
    db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(requestId);
    return requestId;
}

interface ProjectionOptions {
    schema?: string;
    action?: string;
    lineage?: string;
    kind?: string;
    value?: string;
    repoId?: string;
    omitValue?: boolean;
    omitRepoId?: boolean;
}

function autonomousIntent(suffix: string, options: ProjectionOptions = {}): string {
    const subject: Record<string, unknown> = {
        kind: options.kind ?? 'bead',
        value: options.value ?? `bead:${suffix}`,
        repo_id: options.repoId ?? 'repo:/home/morderith/Corvus/CStar',
    };
    if (options.omitValue) delete subject.value;
    if (options.omitRepoId) delete subject.repo_id;
    return JSON.stringify({
        schema: options.schema ?? AUTONOMOUS_INTENT_SCHEMA,
        action: options.action ?? 'implement',
        requester_lineage_mode: options.lineage ?? 'stored_set_manifest',
        subject,
    });
}

function insertAuthorization(
    db: Database.Database,
    suffix: string,
    profile: string,
    intent: string | null,
    challenge: string | null = null,
    executionGrant = false,
    threadId = `profile-thread-${suffix}`,
    turnId = `profile-turn-${suffix}`,
): void {
    const requestId = insertRequest(db, suffix);
    db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, challenge_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            execution_grant_schema, execution_grant_sha256, execution_grant_json,
            authorized_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 10, 20, 10)
    `).run(
        `authorization-${suffix}`, requestId, suffix.padEnd(64, '1').slice(0, 64),
        profile, challenge ?? suffix.padEnd(64, 'a').slice(0, 64), challenge, intent,
        `profile-ref-${suffix}`, threadId, turnId,
        suffix.padEnd(64, '2').slice(0, 64), suffix.padEnd(64, '3').slice(0, 64),
        suffix.padEnd(64, '4').slice(0, 64),
        executionGrant ? 'unexpected-grant-schema' : null,
        executionGrant ? 'b'.repeat(64) : null,
        executionGrant ? '{}' : null,
    );
}

function authorizationSnapshot(db: Database.Database): Array<Record<string, unknown>> {
    return db.prepare(
        `SELECT ${AUTHORIZATION_COLUMNS} FROM hall_forge_authorizations ORDER BY authorization_id`,
    ).all() as Array<Record<string, unknown>>;
}

function isCheckConstraint(error: unknown): boolean {
    return (error as { code?: unknown } | undefined)?.code === 'SQLITE_CONSTRAINT_CHECK';
}

describe('Forge authorization profile-specific schema semantics', () => {
    it('migrates the ten historical rows without changing any field', () => {
        const db = new Database(':memory:');
        createLegacyTables(db);
        for (let index = 0; index < 8; index += 1) {
            insertAuthorization(db, `root-${index}`, 'root_user_forge_intent_v1', 'legacy-root-intent');
        }
        insertAuthorization(
            db, 'historical-exact', 'exact_request_challenge_v1', null,
            'c'.repeat(64),
        );
        const historicalIntent = JSON.stringify({
            schema: AUTONOMOUS_INTENT_SCHEMA,
            action: 'implement', requester_lineage_mode: 'stored_set_manifest',
            subject: {
                kind: 'bead',
                value: 'bead:cstar:researcher-hermes-execution-v1-20260731-policy-v3',
                repo_id: 'repo:/home/morderith/Corvus/CStar',
            },
        });
        insertAuthorization(
            db, 'historical-autonomous', AUTONOMOUS_PROFILE, historicalIntent,
        );
        const before = authorizationSnapshot(db);
        for (const [index, row] of before.entries()) {
            db.prepare(`
                INSERT INTO hall_forge_mission_grant_requests (
                    mission_grant_request_id, authorization_id, grant_payload
                ) VALUES (?, ?, ?)
            `).run(`grant-${index}`, row.authorization_id, `grant-payload-${index}`);
        }
        const missionGrantsBefore = db.prepare(`
            SELECT mission_grant_request_id, authorization_id, grant_payload
            FROM hall_forge_mission_grant_requests
            ORDER BY mission_grant_request_id
        `).all();

        ensureForgeAuthorizationSchema(db);

        assert.deepEqual(authorizationSnapshot(db), before);
        assert.deepEqual(
            db.prepare(`
                SELECT mission_grant_request_id, authorization_id, grant_payload
                FROM hall_forge_mission_grant_requests
                ORDER BY mission_grant_request_id
            `).all(),
            missionGrantsBefore,
        );
        assert.equal(
            db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_hall_forge_mission_grant_requests_authorization'",
            ).pluck().get(),
            'idx_hall_forge_mission_grant_requests_authorization',
        );
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').pluck().get(),
            10,
        );
        assert.deepEqual(
            db.prepare(`
                SELECT authorization_profile, COUNT(*) AS count
                FROM hall_forge_authorizations
                GROUP BY authorization_profile
                ORDER BY authorization_profile
            `).all(),
            [
                { authorization_profile: AUTONOMOUS_PROFILE, count: 1 },
                { authorization_profile: 'exact_request_challenge_v1', count: 1 },
                { authorization_profile: 'root_user_forge_intent_v1', count: 8 },
            ],
        );
        assert.deepEqual(
            db.prepare('PRAGMA foreign_key_list("hall_forge_mission_grant_requests")').all()
                .map((foreignKey: { table: string }) => foreignKey.table),
            ['hall_forge_authorizations'],
        );
        assert.equal(
            db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations_exact_profile_legacy'",
            ).pluck().get(),
            undefined,
        );
        assert.equal(
            db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_mission_grant_requests_authorization_migration_tmp'",
            ).pluck().get(),
            undefined,
        );
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        assert.equal(
            db.prepare('SELECT execution_grant_schema FROM hall_forge_authorizations WHERE authorization_profile = ?')
                .pluck().get(AUTONOMOUS_PROFILE),
            null,
        );
        assert.match(
            String(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hall_forge_authorizations'")
                .pluck().get()),
            /json_valid\(operator_intent_json\)/i,
        );
        assert.throws(
            () => insertAuthorization(
                db, 'autonomous-replay', AUTONOMOUS_PROFILE, historicalIntent,
                null, false, 'profile-thread-historical-autonomous',
                'profile-turn-historical-autonomous',
            ),
            /forge_operator_turn_already_consumed/i,
        );
        assert.ok(db.prepare(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name = ?",
        ).pluck().get(FORGE_AUTHORIZATION_GUARD_TRIGGER));
        db.close();
    });

    it('rejects malformed autonomous projections while preserving root compatibility', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);');
        ensureForgeAuthorizationSchema(db);

        const invalid = [
            ['invalid-json', 'not-json'],
            ['wrong-schema', autonomousIntent('wrong-schema', { schema: 'wrong.schema' })],
            ['wrong-action', autonomousIntent('wrong-action', { action: 'repair' })],
            ['wrong-lineage', autonomousIntent('wrong-lineage', { lineage: 'same_turn_request' })],
            ['wrong-kind', autonomousIntent('wrong-kind', { kind: 'decision' })],
            ['wrong-value-prefix', autonomousIntent('wrong-value-prefix', { value: 'mission:wrong-kind' })],
            ['missing-value', autonomousIntent('missing-value', { omitValue: true })],
            ['empty-value', autonomousIntent('empty-value', { value: '   ' })],
            ['missing-repo', autonomousIntent('missing-repo', { omitRepoId: true })],
            ['empty-repo', autonomousIntent('empty-repo', { repoId: '  ' })],
        ] as const;
        for (const [suffix, intent] of invalid) {
            assert.throws(
                () => insertAuthorization(db, suffix, AUTONOMOUS_PROFILE, intent),
                isCheckConstraint,
                suffix,
            );
        }
        assert.throws(
            () => insertAuthorization(
                db, 'autonomous-challenge', AUTONOMOUS_PROFILE,
                autonomousIntent('autonomous-challenge'), 'd'.repeat(64),
            ),
            isCheckConstraint,
        );
        assert.throws(
            () => insertAuthorization(
                db, 'autonomous-grant', AUTONOMOUS_PROFILE,
                autonomousIntent('autonomous-grant'), null, true,
            ),
            isCheckConstraint,
        );

        insertAuthorization(db, 'root-legacy', 'root_user_forge_intent_v1', 'not-json');
        insertAuthorization(
            db, 'autonomous-valid', AUTONOMOUS_PROFILE, autonomousIntent('autonomous-valid'),
        );
        assert.deepEqual(
            db.prepare('SELECT authorization_profile FROM hall_forge_authorizations ORDER BY authorization_id')
                .pluck().all(),
            [AUTONOMOUS_PROFILE, 'root_user_forge_intent_v1'],
        );
        db.close();
    });

    it('rejects retired and unknown profile identifiers', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);');
        ensureForgeAuthorizationSchema(db);
        for (const [index, profile] of [
            'gpt56-cstar-audit-bootstrap-v1',
            'gpt56-cstar-exact-request-v3',
            'unknown-profile',
        ].entries()) {
            assert.throws(
                () => insertAuthorization(db, `unknown-${index}`, profile, null),
                isCheckConstraint,
            );
        }
        db.close();
    });
});
