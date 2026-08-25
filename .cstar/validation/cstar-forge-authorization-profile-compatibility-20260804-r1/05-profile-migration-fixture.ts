import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { ensureForgeAuthorizationSchema } from '../../../src/tools/pennyone/intel/forge_authorization_schema.js';

const fixturePath = path.resolve(
    '.cstar/validation/cstar-forge-authorization-profile-compatibility-20260804-r1/05-hall-copy-r2.sqlite',
);
const columns = [
    'authorization_id', 'request_id', 'request_sha256', 'authorization_profile',
    'authorization_binding_sha256', 'challenge_sha256', 'operator_intent_json',
    'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
    'operator_message_sha256', 'operator_record_sha256', 'operator_record_set_sha256',
    'operator_record_count', 'execution_grant_schema', 'execution_grant_sha256',
    'execution_grant_json', 'authorized_at', 'expires_at', 'created_at',
].join(', ');
const projectionSchema = 'cstar.forge_operator_intent_projection.v1';
const autonomousProfile = 'autonomous_dispatch_policy_v1';

function digest(seed: string): string {
    return seed.padEnd(64, '0').slice(0, 64);
}

function intent(value: string, overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        schema: projectionSchema,
        action: 'implement',
        requester_lineage_mode: 'stored_set_manifest',
        subject: {
            kind: 'bead',
            value,
            repo_id: 'repo:/home/morderith/Corvus/CStar',
        },
        ...overrides,
    });
}

function createLegacyFixture(db: Database.Database): void {
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
    `);
}

function insertAuthorization(
    db: Database.Database,
    suffix: string,
    profile: string,
    operatorIntent: string | null,
    challenge: string | null = null,
    thread = `fixture-thread-${suffix}`,
    turn = `fixture-turn-${suffix}`,
    grant = false,
): void {
    const requestId = `fixture-request-${suffix}`;
    db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(requestId);
    db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, challenge_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256, operator_record_set_sha256,
            operator_record_count, execution_grant_schema, execution_grant_sha256,
            execution_grant_json, authorized_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 10, 20, 10)
    `).run(
        `fixture-auth-${suffix}`,
        requestId,
        digest(`request-${suffix}`),
        profile,
        challenge ?? digest(`binding-${suffix}`),
        challenge,
        operatorIntent,
        `fixture-ref-${suffix}`,
        thread,
        turn,
        digest(`message-${suffix}`),
        digest(`record-${suffix}`),
        digest(`record-set-${suffix}`),
        grant ? 'unexpected-grant-schema' : null,
        grant ? digest(`grant-${suffix}`) : null,
        grant ? '{}' : null,
    );
}

function snapshot(db: Database.Database): Array<Record<string, unknown>> {
    return db.prepare(
        `SELECT ${columns} FROM hall_forge_authorizations ORDER BY authorization_id`,
    ).all() as Array<Record<string, unknown>>;
}

function checkFailure(action: () => void, label: string): void {
    assert.throws(action, (error: unknown) => {
        const code = (error as { code?: unknown }).code;
        return code === 'SQLITE_CONSTRAINT_CHECK'
            || String(error).includes('forge_operator_turn_already_consumed');
    }, label);
}

if (fs.existsSync(fixturePath)) {
    throw new Error(`fixture_already_exists:${fixturePath}`);
}

const db = new Database(fixturePath);
try {
    createLegacyFixture(db);
    for (let index = 0; index < 8; index += 1) {
        insertAuthorization(db, `root-${index}`, 'root_user_forge_intent_v1', 'legacy-root-intent');
    }
    insertAuthorization(
        db, 'exact', 'exact_request_challenge_v1', null, digest('exact-challenge'),
    );
    insertAuthorization(
        db,
        'autonomous',
        autonomousProfile,
        intent('bead:cstar:researcher-hermes-execution-v1-20260731-policy-v3'),
    );
    const before = snapshot(db);

    ensureForgeAuthorizationSchema(db);

    const after = snapshot(db);
    assert.deepEqual(after, before);
    assert.equal(after.length, 10);
    assert.deepEqual(
        db.prepare(`
            SELECT authorization_profile, COUNT(*) AS count
            FROM hall_forge_authorizations GROUP BY authorization_profile ORDER BY authorization_profile
        `).all(),
        [
            { authorization_profile: 'autonomous_dispatch_policy_v1', count: 1 },
            { authorization_profile: 'exact_request_challenge_v1', count: 1 },
            { authorization_profile: 'root_user_forge_intent_v1', count: 8 },
        ],
    );

    const tableSql = String(db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='hall_forge_authorizations'",
    ).pluck().get());
    assert.match(tableSql, /json_valid\(operator_intent_json\)/i);
    assert.match(tableSql, /execution_grant_json is null/i);
    assert.match(tableSql, /autonomous_dispatch_policy_v1/i);
    assert.deepEqual(
        db.prepare(
            'SELECT execution_grant_schema, execution_grant_sha256, execution_grant_json FROM hall_forge_authorizations WHERE authorization_profile = ?',
        ).get(autonomousProfile),
        { execution_grant_schema: null, execution_grant_sha256: null, execution_grant_json: null },
    );

    for (const [index, profile] of [
        'gpt56-cstar-audit-bootstrap-v1',
        'gpt56-cstar-exact-request-v3',
        'arbitrary-profile',
    ].entries()) {
        checkFailure(
            () => insertAuthorization(db, `retired-${index}`, profile, null),
            `rejects profile ${profile}`,
        );
    }

    insertAuthorization(
        db,
        'valid-autonomous-new',
        autonomousProfile,
        intent('bead:cstar:fixture-valid-autonomous'),
    );
    for (const [suffix, value] of [
        ['bad-schema', JSON.stringify({ schema: 'wrong', action: 'implement' })],
        ['bad-action', intent('bead:cstar:fixture-bad-action', { action: 'repair' })],
        ['bad-lineage', intent('bead:cstar:fixture-bad-lineage', { requester_lineage_mode: 'same_turn_request' })],
        ['bad-kind', intent('bead:cstar:fixture-bad-kind', { subject: { kind: 'decision', value: 'bead:x', repo_id: 'repo:x' } })],
        ['bad-value', intent('mission:fixture-bad-prefix')],
        ['bad-repo', intent('bead:cstar:fixture-bad-repo', { subject: { kind: 'bead', value: 'bead:x' } })],
    ] as const) {
        checkFailure(
            () => insertAuthorization(db, suffix, autonomousProfile, value),
            `rejects autonomous projection ${suffix}`,
        );
    }
    checkFailure(
        () => insertAuthorization(
            db, 'challenge-contamination', autonomousProfile,
            intent('bead:cstar:fixture-challenge'), digest('challenge'),
        ),
        'rejects autonomous challenge',
    );
    checkFailure(
        () => insertAuthorization(
            db, 'grant-contamination', autonomousProfile,
            intent('bead:cstar:fixture-grant'), null, undefined, undefined, true,
        ),
        'rejects autonomous execution grant',
    );

    checkFailure(
        () => insertAuthorization(
            db, 'insert-replay', 'root_user_forge_intent_v1', 'legacy-root-intent',
            null, 'fixture-thread-root-0', 'fixture-turn-root-0',
        ),
        'preserves insert replay guard',
    );
    const beforeUpdate = db.prepare(
        'SELECT operator_thread_id, operator_turn_id FROM hall_forge_authorizations WHERE authorization_id = ?',
    ).get('fixture-auth-root-1');
    checkFailure(
        () => db.prepare(`
            UPDATE hall_forge_authorizations
            SET operator_thread_id = ?, operator_turn_id = ?
            WHERE authorization_id = ?
        `).run('fixture-thread-root-0', 'fixture-turn-root-0', 'fixture-auth-root-1'),
        'preserves update replay guard',
    );
    assert.deepEqual(
        db.prepare(
            'SELECT operator_thread_id, operator_turn_id FROM hall_forge_authorizations WHERE authorization_id = ?',
        ).get('fixture-auth-root-1'),
        beforeUpdate,
    );

    console.log(JSON.stringify({
        schema: 'cstar.independent_fixture_check.v1',
        fixture_path: fixturePath,
        live_hall_touched: false,
        historical_rows_preserved: true,
        historical_row_count: after.length,
        profile_counts: {
            autonomous_dispatch_policy_v1: 1,
            exact_request_challenge_v1: 1,
            root_user_forge_intent_v1: 8,
        },
        autonomous_projection_guarded: true,
        execution_grant_rejected: true,
        retired_and_unknown_profiles_rejected: true,
        insert_update_replay_guards_preserved: true,
        status: 'pass',
    }, null, 2));
} finally {
    db.close();
}
