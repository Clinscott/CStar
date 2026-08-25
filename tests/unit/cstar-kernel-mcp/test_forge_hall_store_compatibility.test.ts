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
            CREATE TABLE hall_forge_attempts (attempt_id TEXT PRIMARY KEY);
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
});
