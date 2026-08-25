import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    HallDatabase,
    database,
    getDb as getLegacyDb,
} from '../../src/tools/pennyone/intel/database.js';

const RETIRED_ALIAS = 'legacy_hall_writable_facade_retired_use_explicit_kernel_controller';
const roots: string[] = [];

function temporaryRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
}

afterEach(() => {
    database.close();
    while (roots.length > 0) {
        fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
});

describe('Hall store path and facade authority', () => {
    it('retires both ambiguous writable aliases before creating state', () => {
        const root = temporaryRoot('cstar-hall-alias-');
        assert.throws(() => database.getDb(root), new RegExp(RETIRED_ALIAS));
        assert.throws(() => getLegacyDb(root), new RegExp(RETIRED_ALIAS));
        assert.deepEqual(fs.readdirSync(root), []);
    });

    it('rejects a symlink root without touching its target', () => {
        const parent = temporaryRoot('cstar-hall-root-link-');
        const target = temporaryRoot('cstar-hall-root-target-');
        const link = path.join(parent, 'linked-root');
        fs.symlinkSync(target, link, 'dir');

        assert.throws(() => database.getReadDb(link), /hall_root_symlink_forbidden/);
        assert.throws(() => database.getWritableDb(link), /hall_root_symlink_forbidden/);
        assert.deepEqual(fs.readdirSync(target), []);
    });

    it('rejects a root reached through a symlinked ancestor', () => {
        const parent = temporaryRoot('cstar-hall-root-ancestor-');
        const outside = temporaryRoot('cstar-hall-root-outside-');
        const repository = path.join(outside, 'repository');
        fs.mkdirSync(repository);
        fs.symlinkSync(outside, path.join(parent, 'linked-parent'), 'dir');
        const linkedRepository = path.join(parent, 'linked-parent', 'repository');

        assert.throws(() => database.getReadDb(linkedRepository), /hall_root_path_not_canonical/);
        assert.throws(() => database.getWritableDb(linkedRepository), /hall_root_path_not_canonical/);
        assert.deepEqual(fs.readdirSync(repository), []);
    });

    it('rejects a symlink .stats directory without touching its target', () => {
        const root = temporaryRoot('cstar-hall-stats-link-');
        const target = temporaryRoot('cstar-hall-stats-target-');
        fs.symlinkSync(target, path.join(root, '.stats'), 'dir');

        assert.throws(() => database.getReadDb(root), /hall_stats_symlink_forbidden/);
        assert.throws(() => database.getWritableDb(root), /hall_stats_symlink_forbidden/);
        assert.deepEqual(fs.readdirSync(target), []);
    });

    it('rejects a symlink, hardlink, or non-file Hall store before SQLite opens it', () => {
        const source = temporaryRoot('cstar-hall-unsafe-source-');
        const sourceFile = path.join(source, 'outside.db');
        fs.writeFileSync(sourceFile, 'synthetic-not-a-database');

        for (const unsafeType of ['symlink', 'hardlink', 'directory'] as const) {
            const root = temporaryRoot(`cstar-hall-${unsafeType}-`);
            const stats = path.join(root, '.stats');
            const dbPath = path.join(stats, 'pennyone.db');
            fs.mkdirSync(stats);
            if (unsafeType === 'symlink') fs.symlinkSync(sourceFile, dbPath);
            else if (unsafeType === 'hardlink') fs.linkSync(sourceFile, dbPath);
            else fs.mkdirSync(dbPath);

            const error = unsafeType === 'symlink'
                ? /hall_store_symlink_forbidden/
                : unsafeType === 'hardlink'
                    ? /hall_store_hardlink_forbidden/
                    : /hall_store_not_regular_file/;
            assert.throws(() => database.getReadDb(root), error);
            assert.throws(() => database.getWritableDb(root), error);
        }
        assert.equal(fs.readFileSync(sourceFile, 'utf8'), 'synthetic-not-a-database');
    });

    it('rejects foreign-writable root, stats, and store permissions', () => {
        const unsafeRoot = temporaryRoot('cstar-hall-root-mode-');
        fs.chmodSync(unsafeRoot, 0o777);
        assert.throws(() => database.getWritableDb(unsafeRoot), /hall_root_permissions_unsafe/);
        fs.chmodSync(unsafeRoot, 0o700);

        const unsafeStats = temporaryRoot('cstar-hall-stats-mode-');
        database.getWritableDb(unsafeStats);
        database.close();
        fs.chmodSync(path.join(unsafeStats, '.stats'), 0o777);
        assert.throws(() => database.getReadDb(unsafeStats), /hall_stats_permissions_unsafe/);
        assert.throws(() => database.getWritableDb(unsafeStats), /hall_stats_permissions_unsafe/);
        fs.chmodSync(path.join(unsafeStats, '.stats'), 0o700);

        const unsafeStore = temporaryRoot('cstar-hall-store-mode-');
        database.getWritableDb(unsafeStore);
        database.close();
        const dbPath = path.join(unsafeStore, '.stats', 'pennyone.db');
        fs.chmodSync(dbPath, 0o666);
        assert.throws(() => database.getReadDb(unsafeStore), /hall_store_permissions_unsafe/);
        assert.throws(() => database.getWritableDb(unsafeStore), /hall_store_permissions_unsafe/);
        fs.chmodSync(dbPath, 0o600);
    });

    it('rejects a store or stats replacement before returning a cached handle', () => {
        const storeRoot = temporaryRoot('cstar-hall-store-race-');
        const hall = new HallDatabase();
        try {
            hall.getWritableDb(storeRoot);
            const dbPath = path.join(storeRoot, '.stats', 'pennyone.db');
            fs.renameSync(dbPath, `${dbPath}.original`);
            fs.writeFileSync(dbPath, '', { mode: 0o600 });
            assert.throws(() => hall.getWritableDb(storeRoot), /hall_store_identity_changed/);
        } finally {
            hall.close();
        }

        const statsRoot = temporaryRoot('cstar-hall-stats-race-');
        const secondHall = new HallDatabase();
        try {
            secondHall.getWritableDb(statsRoot);
            const stats = path.join(statsRoot, '.stats');
            fs.renameSync(stats, path.join(statsRoot, '.stats-original'));
            fs.mkdirSync(stats, { mode: 0o700 });
            assert.throws(() => secondHall.getWritableDb(statsRoot), /hall_stats_identity_changed/);
        } finally {
            secondHall.close();
        }
    });

    it('opens only explicit secure writable and read-only handles', () => {
        const root = temporaryRoot('cstar-hall-explicit-');
        assert.throws(() => database.getReadDb(root), /hall_store_missing/);
        assert.deepEqual(fs.readdirSync(root), []);

        const writable = database.getWritableDb(root);
        const dbPath = path.join(root, '.stats', 'pennyone.db');
        assert.equal(fs.statSync(path.join(root, '.stats')).mode & 0o777, 0o700);
        assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600);
        writable.prepare('SELECT 1 AS ok').get();
        database.close();

        const readonly = database.getReadDb(root);
        assert.equal(readonly.pragma('query_only', { simple: true }), 1);
        assert.throws(
            () => readonly.prepare('CREATE TABLE forbidden_effect (id INTEGER)').run(),
            /readonly|read-only|attempt to write/i,
        );
    });

    it('keeps executable TypeScript scripts outside Hall persistence internals', () => {
        const scripts = path.join(process.cwd(), 'scripts');
        const offenders = fs.readdirSync(scripts)
            .filter((name) => name.endsWith('.ts'))
            .filter((name) => {
                const source = fs.readFileSync(path.join(scripts, name), 'utf8');
                return /better-sqlite3|pennyone\.db|pennyone\/intel\/(?:database|bead_controller|session_manager|repository_manager|schema)/.test(source);
            });
        assert.deepEqual(offenders, []);
    });
});
