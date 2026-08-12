import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { sha256 } from '../../../src/core/council_autoresearch/index.js';
import {
    recoverRepositoryReceiptAliases,
    type RepositoryReceiptRecoveryAuthority,
    type RepositoryReceiptRecoveryTarget,
} from '../../../src/core/council_autoresearch/repository_receipt_recovery.js';
import {
    atomicPrivateFileState,
    atomicPrivateTemporaryPath,
} from '../../../src/core/council_autoresearch/repository_private_file.js';
import { cleanup, temporary } from './test_helpers.js';

afterEach(cleanup);

const operationId = '00000000-0000-4000-8000-000000000123';

interface Fixture {
    directory: string;
    body: RepositoryReceiptRecoveryTarget;
    seal: RepositoryReceiptRecoveryTarget;
    temporary: string;
    authority: RepositoryReceiptRecoveryAuthority;
}

function fixture(): Fixture {
    const directory = temporary('cstar-council-staged-recovery-');
    const body = { file: path.join(directory, 'body.json'), directory, label: 'test body' };
    return {
        directory,
        body,
        seal: { file: path.join(directory, 'seal.json'), directory, label: 'test seal' },
        temporary: atomicPrivateTemporaryPath(body.file, process.pid, operationId),
        authority: {
            owner_pid: process.pid,
            operation_id: operationId,
            body_sha256: sha256(Buffer.from('{"body":true}\n')),
            seal_sha256: sha256(Buffer.from('{"seal":true}\n')),
        },
    };
}

function install(f: Fixture, content: Buffer, mode: number): void {
    fs.writeFileSync(f.temporary, content, { mode: 0o600 });
    fs.chmodSync(f.temporary, mode);
}

function recover(f: Fixture, observe = () => undefined) {
    return recoverRepositoryReceiptAliases({
        body: f.body,
        seal: f.seal,
        assertDeadTargetBoundOperation: () => {
            observe();
            return f.authority;
        },
    });
}

function fileSnapshot(file: string): { content: Buffer; stat: fs.BigIntStats } {
    return { content: fs.readFileSync(file), stat: fs.lstatSync(file, { bigint: true }) };
}

function assertFileSnapshot(file: string, expected: ReturnType<typeof fileSnapshot>): void {
    const actual = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(fs.readFileSync(file), expected.content);
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) assert.equal(actual[key], expected.stat[key], key);
}

function mutableFs(): {
    fsyncSync: typeof fs.fsyncSync;
    openSync: typeof fs.openSync;
    unlinkSync: typeof fs.unlinkSync;
} {
    return createRequire(import.meta.url)('node:fs') as {
        fsyncSync: typeof fs.fsyncSync;
        openSync: typeof fs.openSync;
        unlinkSync: typeof fs.unlinkSync;
    };
}

describe('Council autoresearch staged receipt recovery adversarial durability', () => {
    it('admits zero-byte hostile-umask subsets without weakening the generic classifier', () => {
        for (const mode of [0o000, 0o200, 0o400]) {
            const f = fixture();
            install(f, Buffer.alloc(0), mode);
            assert.equal(
                atomicPrivateFileState(f.body.file, f.temporary, f.body.label),
                'ambiguous',
            );
            assert.deepEqual(recover(f), { outcome: 'absent', repaired: ['body'] });
            assert.equal(fs.existsSync(f.temporary), false);
        }
    });

    it('holds a mode-0000 zero-byte staged inode through Linux O_PATH', {
        skip: process.platform !== 'linux',
    }, () => {
        const f = fixture();
        install(f, Buffer.alloc(0), 0o000);
        const mutable = mutableFs();
        const originalOpen = mutable.openSync;
        const stagedFlags: number[] = [];
        mutable.openSync = ((file, flags, mode) => {
            if (path.resolve(String(file)) === f.temporary && typeof flags === 'number') {
                stagedFlags.push(flags);
            }
            return originalOpen(file, flags, mode);
        }) as typeof fs.openSync;
        syncBuiltinESMExports();
        try {
            assert.deepEqual(recover(f), { outcome: 'absent', repaired: ['body'] });
        } finally {
            mutable.openSync = originalOpen;
            syncBuiltinESMExports();
        }
        assert.ok(stagedFlags.length > 0);
        assert.ok(stagedFlags.every((flags) => (flags & 0o10000000) === 0o10000000));
    });

    it('rejects every nonempty staged temporary without exact mode 0600', () => {
        for (const mode of [0o000, 0o200, 0o400, 0o640, 0o601]) {
            const f = fixture();
            install(f, Buffer.from('{'), mode);
            const before = fileSnapshot(f.temporary);
            assert.throws(() => recover(f), /plausible exact staged private file/i);
            assertFileSnapshot(f.temporary, before);
            assert.equal(fs.existsSync(f.body.file), false);
        }
    });

    it('fsyncs the held parent inode before reporting post-unlink authority drift', () => {
        const f = fixture();
        install(f, Buffer.from('{'), 0o600);
        const parentInode = fs.lstatSync(f.directory, { bigint: true }).ino;
        const mutable = mutableFs();
        const originalFsync = mutable.fsyncSync;
        const synced: bigint[] = [];
        let calls = 0;
        let syncedBeforeDrift = false;
        mutable.fsyncSync = ((descriptor) => {
            if (!fs.existsSync(f.temporary)) {
                synced.push(fs.fstatSync(descriptor, { bigint: true }).ino);
            }
            return originalFsync(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => recover(f, () => {
                calls += 1;
                if (calls === 5) {
                    syncedBeforeDrift = synced.includes(parentInode);
                    f.authority.body_sha256 = 'a'.repeat(64);
                }
            }), /operation authority changed/i);
        } finally {
            mutable.fsyncSync = originalFsync;
            syncBuiltinESMExports();
        }
        assert.equal(calls, 5);
        assert.equal(syncedBeforeDrift, true);
        assert.equal(fs.existsSync(f.temporary), false);
        assert.equal(fs.existsSync(f.body.file), false);
    });

    it('fsyncs the held inode and fails when the parent path is replaced after unlink', () => {
        const f = fixture();
        install(f, Buffer.from('{'), 0o600);
        const parentInode = fs.lstatSync(f.directory, { bigint: true }).ino;
        const moved = `${f.directory}-moved`;
        const mutable = mutableFs();
        const originalFsync = mutable.fsyncSync;
        const originalUnlink = mutable.unlinkSync;
        const synced: bigint[] = [];
        mutable.fsyncSync = ((descriptor) => {
            if (!fs.existsSync(f.temporary)) {
                synced.push(fs.fstatSync(descriptor, { bigint: true }).ino);
            }
            return originalFsync(descriptor);
        }) as typeof fs.fsyncSync;
        mutable.unlinkSync = ((file) => {
            originalUnlink(file);
            if (path.resolve(String(file)) === f.temporary) {
                fs.renameSync(f.directory, moved);
                fs.mkdirSync(f.directory, { mode: 0o700 });
                fs.chmodSync(f.directory, 0o700);
            }
        }) as typeof fs.unlinkSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => recover(f), /recovery parent changed|parent identity changed/i);
            assert.ok(synced.includes(parentInode));
        } finally {
            mutable.fsyncSync = originalFsync;
            mutable.unlinkSync = originalUnlink;
            syncBuiltinESMExports();
            if (fs.existsSync(f.directory)) fs.rmdirSync(f.directory);
            if (fs.existsSync(moved)) fs.renameSync(moved, f.directory);
        }
    });

    it('binds an unlink-fsync retry to the same expected parent inode', () => {
        const f = fixture();
        install(f, Buffer.from('{'), 0o600);
        const parentInode = fs.lstatSync(f.directory, { bigint: true }).ino;
        const mutable = mutableFs();
        const originalFsync = mutable.fsyncSync;
        let injected = false;
        let retrying = false;
        let failedInode: bigint | undefined;
        const retryInodes: bigint[] = [];
        mutable.fsyncSync = ((descriptor) => {
            const inode = fs.fstatSync(descriptor, { bigint: true }).ino;
            if (!injected && !fs.existsSync(f.temporary)) {
                injected = true;
                failedInode = inode;
                throw new Error('injected held-parent fsync failure');
            }
            if (retrying) retryInodes.push(inode);
            return originalFsync(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => recover(f), /durability is uncertain after unlink/i);
            retrying = true;
            assert.deepEqual(recover(f), { outcome: 'absent', repaired: [] });
        } finally {
            mutable.fsyncSync = originalFsync;
            syncBuiltinESMExports();
        }
        assert.equal(failedInode, parentInode);
        assert.ok(retryInodes.length > 0);
        assert.ok(retryInodes.every((inode) => inode === parentInode));
    });
});
