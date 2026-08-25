import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

import {
    ensureForgeAuthorizationSchema,
    FORGE_AUTHORIZATION_GUARD_TRIGGER,
    FORGE_AUTHORIZATION_UPDATE_GUARD_TRIGGER,
} from '../../../src/tools/pennyone/intel/forge_authorization_schema.ts';

const ROOT_PROFILE = 'root_user_forge_intent_v1';
const EXACT_PROFILE = 'exact_request_challenge_v1';
const AUTONOMOUS_PROFILE = 'autonomous_dispatch_policy_v1';
const AUTONOMOUS_SCHEMA = 'cstar.forge_operator_intent_projection.v1';
const LEGACY_TABLE = 'hall_forge_authorizations_exact_profile_legacy';
const TEMP_TABLE = 'hall_forge_mission_grant_requests_authorization_migration_tmp';
const AUTH_COLUMNS = [
    'authorization_id', 'request_id', 'request_sha256', 'authorization_profile',
    'authorization_binding_sha256', 'challenge_sha256', 'operator_intent_json',
    'operator_authorization_ref', 'operator_thread_id', 'operator_turn_id',
    'operator_message_sha256', 'operator_record_sha256',
    'operator_record_set_sha256', 'operator_record_count',
    'execution_grant_schema', 'execution_grant_sha256', 'execution_grant_json',
    'authorized_at', 'expires_at', 'created_at',
].join(', ');

function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createLegacyFixture(db) {
    db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE unrelated_parent (id TEXT PRIMARY KEY);
        CREATE TABLE unrelated_child (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            FOREIGN KEY(parent_id) REFERENCES unrelated_parent(id)
        );
        INSERT INTO unrelated_child (id, parent_id) VALUES ('orphan-1', 'missing-parent');
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
        CREATE TABLE mission_grant_audit (
            audit_id INTEGER PRIMARY KEY,
            grant_id TEXT NOT NULL
        );
        CREATE TRIGGER trg_hall_forge_mission_grant_requests_audit
        AFTER INSERT ON hall_forge_mission_grant_requests
        BEGIN
            INSERT INTO mission_grant_audit (grant_id) VALUES (NEW.mission_grant_request_id);
        END;
    `);
}

function autonomousIntent(suffix) {
    return JSON.stringify({
        schema: AUTONOMOUS_SCHEMA,
        action: 'implement',
        requester_lineage_mode: 'stored_set_manifest',
        subject: {
            kind: 'bead',
            value: `bead:fixture:${suffix}`,
            repo_id: 'repo:/home/morderith/Corvus/CStar',
        },
    });
}

function insertRequest(db, suffix) {
    const requestId = `request-${suffix}`;
    db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(requestId);
    return requestId;
}

function insertAuthorization(db, {
    suffix,
    profile = ROOT_PROFILE,
    intent = 'legacy-root-intent',
    challenge = null,
    thread = `fixture-thread-${suffix}`,
    turn = `fixture-turn-${suffix}`,
}) {
    const requestId = insertRequest(db, suffix);
    const exactChallenge = challenge ?? (profile === EXACT_PROFILE ? digest(`challenge-${suffix}`) : null);
    const operatorIntent = profile === EXACT_PROFILE ? null : intent;
    db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            authorization_binding_sha256, challenge_sha256, operator_intent_json,
            operator_authorization_ref, operator_thread_id, operator_turn_id,
            operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            execution_grant_schema, execution_grant_sha256, execution_grant_json,
            authorized_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, 10, 20, 10)
    `).run(
        `authorization-${suffix}`,
        requestId,
        digest(`request-${suffix}`),
        profile,
        exactChallenge ?? digest(`binding-${suffix}`),
        exactChallenge,
        operatorIntent,
        `authorization-ref-${suffix}`,
        thread,
        turn,
        digest(`message-${suffix}`),
        digest(`record-${suffix}`),
        digest(`record-set-${suffix}`),
    );
    return `authorization-${suffix}`;
}

function parentSnapshot(db) {
    return db.prepare(
        `SELECT ${AUTH_COLUMNS} FROM hall_forge_authorizations ORDER BY authorization_id`,
    ).all();
}

function childSnapshot(db) {
    return db.prepare(`
        SELECT mission_grant_request_id, authorization_id, grant_payload
        FROM hall_forge_mission_grant_requests
        ORDER BY mission_grant_request_id
    `).all();
}

function foreignKeyList(db, table) {
    return db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
}

function expectReplayGuard(fn) {
    assert.throws(fn, /forge_operator_turn_already_consumed/i);
}

const db = new Database(':memory:');
try {
    createLegacyFixture(db);
    const parentIds = [];
    for (let index = 0; index < 8; index += 1) {
        parentIds.push(insertAuthorization(db, { suffix: `root-${index}` }));
    }
    parentIds.push(insertAuthorization(db, {
        suffix: 'exact-1',
        profile: EXACT_PROFILE,
        intent: null,
    }));
    parentIds.push(insertAuthorization(db, {
        suffix: 'autonomous-1',
        profile: AUTONOMOUS_PROFILE,
        intent: autonomousIntent('autonomous-1'),
    }));

    for (const [index, authorizationId] of parentIds.entries()) {
        db.prepare(`
            INSERT INTO hall_forge_mission_grant_requests
                (mission_grant_request_id, authorization_id, grant_payload)
            VALUES (?, ?, ?)
        `).run(`grant-${index}`, authorizationId, `payload-${index}`);
    }

    const parentBefore = parentSnapshot(db);
    const childBefore = childSnapshot(db);
    const unrelatedBefore = db.prepare('PRAGMA foreign_key_check').all();
    assert.equal(parentBefore.length, 10);
    assert.equal(childBefore.length, 10);
    assert.equal(unrelatedBefore.length, 1);
    assert.equal(unrelatedBefore[0].table, 'unrelated_child');
    assert.equal(unrelatedBefore[0].parent, 'unrelated_parent');
    assert.equal(
        foreignKeyList(db, 'hall_forge_mission_grant_requests')[0].table,
        'hall_forge_authorizations',
    );
    assert.equal(
        db.prepare("SELECT COUNT(*) FROM mission_grant_audit").pluck().get(),
        10,
    );

    ensureForgeAuthorizationSchema(db);

    assert.deepEqual(parentSnapshot(db), parentBefore);
    assert.deepEqual(childSnapshot(db), childBefore);
    const childForeignKeysAfter = foreignKeyList(db, 'hall_forge_mission_grant_requests');
    assert.equal(childForeignKeysAfter.length, 1);
    assert.equal(childForeignKeysAfter[0].table, 'hall_forge_authorizations');
    assert.equal(
        db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name = 'idx_hall_forge_mission_grant_requests_authorization'").pluck().get(),
        1,
    );
    assert.equal(
        db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name = 'trg_hall_forge_mission_grant_requests_audit'").pluck().get(),
        1,
    );
    assert.equal(
        db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name = 'trg_hall_forge_mission_grant_requests_audit'").pluck().get()
            .includes('AFTER INSERT ON hall_forge_mission_grant_requests'),
        true,
    );
    assert.equal(
        db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN (?, ?)")
            .pluck().get(LEGACY_TABLE, TEMP_TABLE),
        0,
    );

    const profileCounts = db.prepare(`
        SELECT authorization_profile, COUNT(*) AS count
        FROM hall_forge_authorizations
        GROUP BY authorization_profile
        ORDER BY authorization_profile
    `).all();
    assert.deepEqual(profileCounts, [
        { authorization_profile: AUTONOMOUS_PROFILE, count: 1 },
        { authorization_profile: EXACT_PROFILE, count: 1 },
        { authorization_profile: ROOT_PROFILE, count: 8 },
    ]);
    const exact = db.prepare(`
        SELECT authorization_profile, challenge_sha256, authorization_binding_sha256,
               operator_intent_json
        FROM hall_forge_authorizations WHERE authorization_profile = ?
    `).get(EXACT_PROFILE);
    assert.equal(exact.challenge_sha256, exact.authorization_binding_sha256);
    assert.equal(exact.operator_intent_json, null);
    const autonomous = db.prepare(`
        SELECT challenge_sha256, operator_intent_json,
               execution_grant_schema, execution_grant_sha256, execution_grant_json
        FROM hall_forge_authorizations WHERE authorization_profile = ?
    `).get(AUTONOMOUS_PROFILE);
    assert.equal(autonomous.challenge_sha256, null);
    assert.equal(autonomous.execution_grant_schema, null);
    assert.equal(autonomous.execution_grant_sha256, null);
    assert.equal(autonomous.execution_grant_json, null);
    assert.equal(JSON.parse(autonomous.operator_intent_json).schema, AUTONOMOUS_SCHEMA);
    assert.equal(JSON.parse(autonomous.operator_intent_json).subject.kind, 'bead');
    assert.equal(JSON.parse(autonomous.operator_intent_json).subject.value.startsWith('bead:'), true);

    db.prepare(`
        INSERT INTO hall_forge_mission_grant_requests
            (mission_grant_request_id, authorization_id, grant_payload)
        VALUES ('grant-post-migration', ?, 'post-migration')
    `).run(parentIds[0]);
    assert.equal(
        db.prepare("SELECT COUNT(*) FROM mission_grant_audit").pluck().get(),
        11,
    );

    expectReplayGuard(() => insertAuthorization(db, {
        suffix: 'replay-insert',
        thread: 'fixture-thread-root-0',
        turn: 'fixture-turn-root-0',
    }));
    insertAuthorization(db, { suffix: 'replay-update-target' });
    expectReplayGuard(() => db.prepare(`
        UPDATE hall_forge_authorizations
        SET operator_thread_id = 'fixture-thread-root-0', operator_turn_id = 'fixture-turn-root-0'
        WHERE authorization_id = 'authorization-replay-update-target'
    `).run());

    const unrelatedAfter = db.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(unrelatedAfter, unrelatedBefore);
    assert.deepEqual(
        db.prepare('PRAGMA foreign_key_check(hall_forge_authorizations)').all(),
        [],
    );
    assert.deepEqual(
        db.prepare('PRAGMA foreign_key_check(hall_forge_mission_grant_requests)').all(),
        [],
    );

    expectReplayGuard(() => insertAuthorization(db, {
        suffix: 'autonomous-replay',
        profile: AUTONOMOUS_PROFILE,
        intent: autonomousIntent('autonomous-replay'),
        thread: 'fixture-thread-autonomous-1',
        turn: 'fixture-turn-autonomous-1',
    }));
    assert.throws(
        () => insertAuthorization(db, {
            suffix: 'unknown-profile',
            profile: 'gpt56-cstar-audit-bootstrap-v1',
            intent: null,
        }),
        /SQLITE_CONSTRAINT_CHECK|CHECK constraint failed/i,
    );

    console.log(JSON.stringify({
        schema: 'cstar.disposable_child_fk_migration_fixture.v1',
        verdict: 'ACCEPTED',
        parent_rows: 10,
        parent_profile_counts: profileCounts,
        parent_snapshot_preserved: true,
        child_rows_before: childBefore.length,
        child_rows_preserved: true,
        child_fk_before: 'hall_forge_authorizations',
        child_fk_after: 'hall_forge_authorizations',
        associated_index_retained: true,
        associated_trigger_retained_and_fired: true,
        trigger_audit_rows: 11,
        legacy_and_temp_tables_absent: true,
        replay_insert_guard: 'forge_operator_turn_already_consumed',
        replay_update_guard: 'forge_operator_turn_already_consumed',
        unrelated_fk_orphan_preserved: true,
        unrelated_fk_check_rows: unrelatedAfter.length,
        live_hall_opened: false,
    }));
} finally {
    db.close();
}
