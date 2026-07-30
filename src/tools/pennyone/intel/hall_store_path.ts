import fs from 'node:fs';
import { join, resolve } from 'node:path';

export type FileIdentity = Pick<fs.Stats, 'dev' | 'ino'>;

export interface HallStorePath {
    root: string;
    dbPath: string;
    rootIdentity: FileIdentity;
    statsIdentity: FileIdentity;
    existingIdentity: FileIdentity | null;
    created: boolean;
}

const WINDOWS_CI_TEST_FLAG = 'CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY';

function allowUnverifiedWindowsCiTestPermissions(): boolean {
    // Test execution only: this does not assert Windows owner or DACL safety.
    return process.platform === 'win32'
        && Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env[WINDOWS_CI_TEST_FLAG] === '1';
}

function currentUid(): number | null {
    if (typeof process.getuid !== 'function' && allowUnverifiedWindowsCiTestPermissions()) return null;
    if (typeof process.getuid !== 'function') throw new Error('hall_store_owner_check_unavailable');
    return process.getuid();
}

function getExistingStat(candidate: string): fs.Stats | null {
    return fs.lstatSync(candidate, { throwIfNoEntry: false }) ?? null;
}

function identity(stat: fs.Stats): FileIdentity {
    return { dev: stat.dev, ino: stat.ino };
}

function assertIdentity(actual: fs.Stats, expected: FileIdentity, error: string): void {
    if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error(error);
}

function assertOwnedNotWritableByOthers(stat: fs.Stats, prefix: string): void {
    const uid = currentUid();
    if (uid === null) return;
    if (stat.uid !== uid) throw new Error(`${prefix}_owner_mismatch`);
    if ((stat.mode & 0o022) !== 0) throw new Error(`${prefix}_permissions_unsafe`);
}

function assertSafeDirectory(candidate: string, prefix: string): fs.Stats {
    const stat = getExistingStat(candidate);
    if (!stat) throw new Error(`${prefix}_missing`);
    if (stat.isSymbolicLink()) throw new Error(`${prefix}_symlink_forbidden`);
    if (!stat.isDirectory()) throw new Error(`${prefix}_not_directory`);
    if (fs.realpathSync(candidate) !== candidate) throw new Error(`${prefix}_path_not_canonical`);
    assertOwnedNotWritableByOthers(stat, prefix);
    return stat;
}

function assertUniqueRegularHallStore(dbPath: string): fs.Stats {
    const stat = getExistingStat(dbPath);
    if (!stat) throw new Error('hall_store_missing');
    if (stat.isSymbolicLink()) throw new Error('hall_store_symlink_forbidden');
    if (!stat.isFile()) throw new Error('hall_store_not_regular_file');
    if (stat.nlink !== 1) throw new Error('hall_store_hardlink_forbidden');
    assertOwnedNotWritableByOthers(stat, 'hall_store');
    return stat;
}

function createPrivateHallStore(dbPath: string): fs.Stats {
    const flags = fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | fs.constants.O_RDWR
        | (fs.constants.O_NOFOLLOW ?? 0);
    let descriptor: number | null = null;
    try {
        descriptor = fs.openSync(dbPath, flags, 0o600);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.nlink !== 1) throw new Error('hall_store_creation_unsafe');
        const uid = currentUid();
        if (uid !== null && (stat.uid !== uid || (stat.mode & 0o777) !== 0o600)) {
            throw new Error('hall_store_creation_permissions_unsafe');
        }
        return stat;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            return assertUniqueRegularHallStore(dbPath);
        }
        throw error;
    } finally {
        if (descriptor !== null) fs.closeSync(descriptor);
    }
}

export function resolveHallRootPath(rootPath: string): string {
    const lexicalRoot = resolve(rootPath);
    const rootStat = getExistingStat(lexicalRoot);
    if (!rootStat) throw new Error('hall_root_missing');
    if (rootStat.isSymbolicLink()) throw new Error('hall_root_symlink_forbidden');
    if (!rootStat.isDirectory()) throw new Error('hall_root_not_directory');
    if (fs.realpathSync(lexicalRoot) !== lexicalRoot) throw new Error('hall_root_path_not_canonical');
    assertOwnedNotWritableByOthers(rootStat, 'hall_root');
    return lexicalRoot;
}

export function resolveHallStorePath(rootPath: string, createStore: boolean): HallStorePath {
    const root = resolveHallRootPath(rootPath);
    const rootStat = assertSafeDirectory(root, 'hall_root');
    const statsDir = join(root, '.stats');
    let statsStat = getExistingStat(statsDir);
    if (!statsStat) {
        if (!createStore) throw new Error('hall_store_missing');
        fs.mkdirSync(statsDir, { mode: 0o700 });
    }
    statsStat = assertSafeDirectory(statsDir, 'hall_stats');

    const dbPath = join(statsDir, 'pennyone.db');
    const existing = getExistingStat(dbPath);
    if (!existing && !createStore) throw new Error('hall_store_missing');
    const storeStat = existing
        ? assertUniqueRegularHallStore(dbPath)
        : createPrivateHallStore(dbPath);
    return {
        root,
        dbPath,
        rootIdentity: identity(rootStat),
        statsIdentity: identity(statsStat),
        existingIdentity: identity(storeStat),
        created: !existing,
    };
}

export function assertStableHallStoreIdentity(store: HallStorePath): void {
    const root = assertSafeDirectory(store.root, 'hall_root');
    assertIdentity(root, store.rootIdentity, 'hall_root_identity_changed');
    const stats = assertSafeDirectory(join(store.root, '.stats'), 'hall_stats');
    assertIdentity(stats, store.statsIdentity, 'hall_stats_identity_changed');
    const current = assertUniqueRegularHallStore(store.dbPath);
    if (!store.existingIdentity) throw new Error('hall_store_identity_missing');
    assertIdentity(current, store.existingIdentity, 'hall_store_identity_changed');
}
