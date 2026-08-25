import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import {
    getForgeWritableDb,
    openForgeReadDb,
} from '../../../src/tools/pennyone/intel/forge_hall_store.js';
import { ensureForgeAuthorizationSchema } from '../../../src/tools/pennyone/intel/forge_authorization_schema.js';
import { readForgeRequestBeforeMutation } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_request_authority.js';

const shadowed = new Set<string>();

function shadowDatabaseMethod(name: string, value: unknown): void {
    Object.defineProperty(database, name, { configurable: true, value, writable: true });
    shadowed.add(name);
}

afterEach(() => {
    for (const name of shadowed) delete (database as unknown as Record<string, unknown>)[name];
    shadowed.clear();
});

describe('Forge Hall store compatibility boundary', () => {
    it('opens the legacy store read-only without schema or file mutation', () => {
        const root = fs.mkdtempSync(path.join(os.homedir(), '.cstar-forge-read-store-'));
        fs.chmodSync(root, 0o700);
        const stats = path.join(root, '.stats');
        const dbPath = path.join(stats, 'pennyone.db');
        fs.mkdirSync(stats, { mode: 0o700 });
        const seed = new Database(dbPath);
        seed.exec('CREATE TABLE receipts (id TEXT PRIMARY KEY); INSERT INTO receipts VALUES (\'receipt\');');
        seed.close();
        fs.chmodSync(dbPath, 0o600);
        const before = fs.statSync(dbPath);
        shadowDatabaseMethod('getReadDb', undefined);

        const handle = openForgeReadDb(root);
        assert.equal(handle.db.prepare('SELECT id FROM receipts').pluck().get(), 'receipt');
        assert.throws(() => handle.db.exec('CREATE TABLE forbidden (id TEXT)'), /readonly/i);
        handle.release();
        handle.release();

        const after = fs.statSync(dbPath);
        assert.equal(after.size, before.size);
        assert.equal(after.mtimeMs, before.mtimeMs);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('releases an owned fallback read handle when Forge request loading throws', (t) => {
        const root = fs.mkdtempSync(path.join(os.homedir(), '.cstar-forge-read-release-'));
        const stats = path.join(root, '.stats');
        const dbPath = path.join(stats, 'pennyone.db');
        fs.mkdirSync(stats, { mode: 0o700 });
        const seed = new Database(dbPath);
        seed.exec('CREATE TABLE unrelated (id TEXT PRIMARY KEY)');
        seed.close();
        shadowDatabaseMethod('getReadDb', undefined);

        const originalClose = Database.prototype.close;
        let released: Database.Database | undefined;
        const close = t.mock.method(
            Database.prototype,
            'close',
            function closeOwnedFallback(this: Database.Database) {
                released = this;
                return originalClose.call(this);
            },
        );
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));

        assert.throws(
            () => readForgeRequestBeforeMutation(
                root,
                `dispatch-forge-${'0'.repeat(32)}`,
            ),
            /no such table: hall_forge_requests/i,
        );
        assert.equal(close.mock.callCount(), 1);
        assert.ok(released);
        assert.throws(() => released.prepare('SELECT 1'), /not open/i);
    });

    it('upgrades only the Forge and validation receipt schema on an authorized legacy write handle', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);
            CREATE TABLE hall_forge_attempts (
                attempt_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                retry_of_attempt_id TEXT,
                UNIQUE(request_id, attempt_id)
            );
            CREATE TABLE hall_validation_runs (validation_id TEXT PRIMARY KEY);
        `);
        shadowDatabaseMethod('getWritableDb', undefined);
        shadowDatabaseMethod('getDb', () => db);

        assert.equal(getForgeWritableDb('/synthetic/root'), db);
        const requestColumns = db.prepare('PRAGMA table_info(hall_forge_requests)').all() as Array<{ name: string }>;
        const validationColumns = db.prepare('PRAGMA table_info(hall_validation_runs)').all() as Array<{ name: string }>;
        assert.ok(requestColumns.some((entry) => entry.name === 'authorization_challenge_sha256'));
        assert.ok(validationColumns.some((entry) => entry.name === 'evidence_manifest_json'));
        assert.equal(
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'").pluck().get(),
            'hall_forge_authorizations',
        );
        assert.equal(
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_preprovider_continuations'").pluck().get(),
            'hall_forge_preprovider_continuations',
        );
        db.close();
    });

    it('rolls back the bounded schema upgrade if any required receipt table is missing', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY);
            CREATE TABLE hall_forge_attempts (attempt_id TEXT PRIMARY KEY);
        `);
        shadowDatabaseMethod('getWritableDb', undefined);
        shadowDatabaseMethod('getDb', () => db);

        assert.throws(() => getForgeWritableDb('/synthetic/root'), /hall_validation_runs/);
        assert.equal(
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'").pluck().get(),
            undefined,
        );
        const requestColumns = db.prepare('PRAGMA table_info(hall_forge_requests)').all() as Array<{ name: string }>;
        assert.equal(requestColumns.some((entry) => entry.name === 'requester_thread_id'), false);
        db.close();
    });

    it('migrates an exact-only authorization row once without changing its evidence', () => {
        const db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        db.exec(`
            CREATE TABLE hall_forge_requests (
                request_id TEXT PRIMARY KEY,
                authorization_profile TEXT,
                authorization_challenge_sha256 TEXT
            );
            CREATE TABLE hall_forge_authorizations (
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
                operator_record_count INTEGER NOT NULL,
                authorized_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(operator_thread_id, operator_turn_id),
                FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
            );
        `);
        const requestId = `dispatch-forge-${'1'.repeat(32)}`;
        const challenge = '2'.repeat(64);
        db.prepare(`
            INSERT INTO hall_forge_requests VALUES (?, 'exact_request_challenge_v1', ?)
        `).run(requestId, challenge);
        db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                challenge_sha256, operator_authorization_ref, operator_thread_id,
                operator_turn_id, operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, 'exact_request_challenge_v1', ?, ?, ?, ?, ?, ?, ?, 1, 10, 20, 10)
        `).run(
            'forge-auth-legacy', requestId, '3'.repeat(64), challenge,
            'legacy-ref', 'thread', 'turn', '4'.repeat(64), '5'.repeat(64), '6'.repeat(64),
        );

        ensureForgeAuthorizationSchema(db);
        const first = db.prepare('SELECT * FROM hall_forge_authorizations').get() as Record<string, unknown>;
        const schemaAfterFirst = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'",
        ).pluck().get();
        ensureForgeAuthorizationSchema(db);
        const second = db.prepare('SELECT * FROM hall_forge_authorizations').get() as Record<string, unknown>;
        const schemaAfterSecond = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_authorizations'",
        ).pluck().get();

        assert.equal(first.authorization_binding_sha256, challenge);
        assert.equal(first.challenge_sha256, challenge);
        assert.equal(first.operator_intent_json, null);
        assert.deepEqual(second, first);
        assert.equal(schemaAfterSecond, schemaAfterFirst);
        assert.match(
            String(schemaAfterSecond).replace(/\s+/g, ' ').toLowerCase(),
            /operator_record_count integer not null check\(operator_record_count >= 1\)/,
        );

        const multiRequestId = `dispatch-forge-${'7'.repeat(32)}`;
        db.prepare('INSERT INTO hall_forge_requests (request_id) VALUES (?)').run(multiRequestId);
        db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                authorization_binding_sha256, challenge_sha256, operator_intent_json,
                operator_authorization_ref, operator_thread_id, operator_turn_id,
                operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, 'root_user_forge_intent_v1', ?, NULL, ?, ?, ?, ?, ?, ?, ?, 2, 30, 40, 30)
        `).run(
            'forge-auth-goal-multi', multiRequestId, '8'.repeat(64), '9'.repeat(64),
            '{"schema":"synthetic-goal-resume"}', 'goal-multi-ref',
            'goal-multi-thread', 'goal-multi-turn', 'a'.repeat(64),
            'b'.repeat(64), 'c'.repeat(64),
        );
        assert.equal(
            db.prepare('SELECT operator_record_count FROM hall_forge_authorizations WHERE request_id = ?')
                .pluck().get(multiRequestId),
            2,
        );
        db.close();
    });
});
