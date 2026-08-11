import fs from 'node:fs';

import { fail, fsyncDirectory } from './contracts.js';
import { UUID_V4_PATTERN } from './repository_lease_contract.js';

export interface OwnedPrivateFile {
    descriptor: number;
    file: string;
    commonDirectory: string;
    stat: fs.BigIntStats;
}

export interface OpenedPrivateJson<T> extends OwnedPrivateFile {
    content: Buffer;
    record: T;
}

export type AtomicPrivateFileState =
    | 'absent'
    | 'staged'
    | 'committed'
    | 'complete'
    | 'ambiguous';

export class PrivateFileDurabilityError extends Error {
    readonly code = 'CSTAR_PRIVATE_FILE_NAMESPACE_DURABILITY_UNCERTAIN';

    constructor(label: string, cause: unknown) {
        super(`${label} namespace durability is uncertain after unlink`, { cause });
        this.name = 'PrivateFileDurabilityError';
    }
}

export function privateFileDurabilityUncertain(error: unknown): boolean {
    return error instanceof PrivateFileDurabilityError;
}

export function optionalStat(file: string): fs.BigIntStats | undefined {
    try {
        return fs.lstatSync(file, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

export function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function assertPrivateRegularFile(
    stat: fs.BigIntStats,
    label: string,
    allowedLinks: readonly bigint[],
): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || !allowedLinks.includes(stat.nlink) || (stat.mode & 0o7777n) !== 0o600n
        || stat.uid !== BigInt(uid)) {
        fail(`${label} must be an exact private owned regular file`);
    }
}

function assertSameIdentity(
    before: fs.BigIntStats,
    after: fs.BigIntStats,
    label: string,
): void {
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) {
        if (before[key] !== after[key]) fail(`${label} identity changed`);
    }
}

function assertSameContentIdentity(
    before: fs.BigIntStats,
    after: fs.BigIntStats,
    label: string,
): void {
    for (const key of ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs'] as const) {
        if (before[key] !== after[key]) fail(`${label} identity changed`);
    }
}

export function captureOwnedPrivateFile(
    descriptor: number,
    file: string,
    commonDirectory: string,
    label: string,
    allowedLinks: readonly bigint[] = [1n],
): OwnedPrivateFile {
    const descriptorStat = fs.fstatSync(descriptor, { bigint: true });
    const pathStat = fs.lstatSync(file, { bigint: true });
    assertPrivateRegularFile(descriptorStat, label, allowedLinks);
    assertPrivateRegularFile(pathStat, label, allowedLinks);
    assertSameIdentity(descriptorStat, pathStat, label);
    return { descriptor, file, commonDirectory, stat: pathStat };
}

export function assertOwnedPrivateFile(
    owned: OwnedPrivateFile,
    label: string,
    allowedLinks: readonly bigint[] = [1n],
): void {
    const descriptorStat = fs.fstatSync(owned.descriptor, { bigint: true });
    const pathStat = fs.lstatSync(owned.file, { bigint: true });
    assertPrivateRegularFile(descriptorStat, label, allowedLinks);
    assertPrivateRegularFile(pathStat, label, allowedLinks);
    assertSameIdentity(owned.stat, descriptorStat, label);
    assertSameIdentity(descriptorStat, pathStat, label);
}

export function closeOwnedPrivateFile(
    owned: OwnedPrivateFile,
    label: string,
    allowedLinks: readonly bigint[] = [1n],
): void {
    try {
        assertOwnedPrivateFile(owned, label, allowedLinks);
    } finally {
        fs.closeSync(owned.descriptor);
    }
}

export function unlinkOwnedPrivateFile(owned: OwnedPrivateFile, label: string): void {
    try {
        assertOwnedPrivateFile(owned, label);
        fs.unlinkSync(owned.file);
        fsyncDirectory(owned.commonDirectory);
        if (optionalStat(owned.file) !== undefined) fail(`${label} path survived unlink`);
        const unlinked = fs.fstatSync(owned.descriptor, { bigint: true });
        if (!sameInode(unlinked, owned.stat) || unlinked.nlink !== 0n
            || unlinked.mode !== owned.stat.mode || unlinked.uid !== owned.stat.uid
            || unlinked.gid !== owned.stat.gid || unlinked.size !== owned.stat.size) {
            fail(`${label} inode changed during unlink`);
        }
    } finally {
        fs.closeSync(owned.descriptor);
    }
}

export function openPrivateJson<T>(
    file: string,
    commonDirectory: string,
    label: string,
    maxBytes: number,
    allowedLinks: readonly bigint[] = [1n],
): OpenedPrivateJson<T> {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const owned = captureOwnedPrivateFile(
            descriptor,
            file,
            commonDirectory,
            label,
            allowedLinks,
        );
        if (owned.stat.size < 1n || owned.stat.size > BigInt(maxBytes)) {
            fail(`${label} exceeds its byte limit`);
        }
        const content = Buffer.allocUnsafe(Number(owned.stat.size));
        let offset = 0;
        while (offset < content.length) {
            const count = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (count === 0) fail(`${label} changed while it was read`);
            offset += count;
        }
        assertOwnedPrivateFile(owned, label, allowedLinks);
        let record: T;
        try {
            record = JSON.parse(content.toString('utf8')) as T;
        } catch (error) {
            fail(`${label} is not valid JSON: ${
                error instanceof Error ? error.message : String(error)
            }`);
        }
        return { ...owned, content, record };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

export function atomicPrivateTemporaryPath(
    file: string,
    ownerPid: number,
    operationId: string,
): string {
    if (!Number.isSafeInteger(ownerPid) || ownerPid < 1 || !UUID_V4_PATTERN.test(operationId)) {
        fail('atomic private file creator identity is invalid');
    }
    return `${file}.tmp-${ownerPid}-${operationId}`;
}

function unlinkAndSync(
    file: string,
    commonDirectory: string,
    label: string,
): void {
    fs.unlinkSync(file);
    try {
        fsyncDirectory(commonDirectory);
    } catch (error) {
        throw new PrivateFileDurabilityError(label, error);
    }
}

function removeUnpublishedTemporary(
    descriptor: number,
    temporary: string,
    commonDirectory: string,
    label: string,
): void {
    const owned = captureOwnedPrivateFile(
        descriptor,
        temporary,
        commonDirectory,
        `${label} unpublished temporary`,
    );
    unlinkAndSync(temporary, commonDirectory, label);
    if (optionalStat(temporary) !== undefined) {
        fail(`${label} unpublished temporary survived cleanup`);
    }
    const unlinked = fs.fstatSync(descriptor, { bigint: true });
    if (!sameInode(owned.stat, unlinked) || unlinked.nlink !== 0n
        || unlinked.mode !== owned.stat.mode || unlinked.uid !== owned.stat.uid
        || unlinked.gid !== owned.stat.gid || unlinked.size !== owned.stat.size
        || unlinked.mtimeNs !== owned.stat.mtimeNs) {
        fail(`${label} unpublished temporary changed during cleanup`);
    }
}

export function createAtomicPrivateFile(input: {
    file: string;
    temporary: string;
    commonDirectory: string;
    content: Buffer;
    label: string;
}): OwnedPrivateFile {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT
        | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
    const descriptor = fs.openSync(input.temporary, flags, 0o600);
    let published = false;
    try {
        fs.fchmodSync(descriptor, 0o600);
        let offset = 0;
        while (offset < input.content.length) {
            const written = fs.writeSync(
                descriptor,
                input.content,
                offset,
                input.content.length - offset,
                offset,
            );
            if (written < 1) fail(`${input.label} could not be written completely`);
            offset += written;
        }
        fs.fsyncSync(descriptor);
        const staged = captureOwnedPrivateFile(
            descriptor,
            input.temporary,
            input.commonDirectory,
            input.label,
        );
        if (staged.stat.size !== BigInt(input.content.length)) {
            fail(`${input.label} changed before publication`);
        }
        fs.linkSync(input.temporary, input.file);
        published = true;
        fsyncDirectory(input.commonDirectory);
        const linked = captureOwnedPrivateFile(
            descriptor,
            input.file,
            input.commonDirectory,
            input.label,
            [2n],
        );
        const alias = fs.lstatSync(input.temporary, { bigint: true });
        assertPrivateRegularFile(alias, input.label, [2n]);
        assertSameIdentity(linked.stat, alias, input.label);
        assertSameContentIdentity(staged.stat, linked.stat, input.label);
        unlinkAndSync(input.temporary, input.commonDirectory, input.label);
        if (optionalStat(input.temporary) !== undefined) {
            fail(`${input.label} temporary alias survived publication`);
        }
        const committed = captureOwnedPrivateFile(
            descriptor,
            input.file,
            input.commonDirectory,
            input.label,
        );
        assertSameContentIdentity(staged.stat, committed.stat, input.label);
        return committed;
    } catch (error) {
        let cleanupError: unknown;
        if (!published) {
            try {
                removeUnpublishedTemporary(
                    descriptor,
                    input.temporary,
                    input.commonDirectory,
                    input.label,
                );
            } catch (caught) {
                if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') cleanupError = caught;
            }
        }
        try {
            fs.closeSync(descriptor);
        } catch (caught) {
            cleanupError ??= caught;
        }
        if (cleanupError !== undefined) throw cleanupError;
        throw error;
    }
}

export function atomicPrivateFileState(
    file: string,
    temporary: string,
    label: string,
): AtomicPrivateFileState {
    try {
        const target = optionalStat(file);
        const alias = optionalStat(temporary);
        if (target === undefined && alias === undefined) return 'absent';
        if (target === undefined && alias !== undefined) {
            assertPrivateRegularFile(alias, label, [1n]);
            return 'staged';
        }
        if (target !== undefined && alias === undefined) {
            assertPrivateRegularFile(target, label, [1n]);
            return 'complete';
        }
        assertPrivateRegularFile(target as fs.BigIntStats, label, [2n]);
        assertPrivateRegularFile(alias as fs.BigIntStats, label, [2n]);
        assertSameIdentity(target as fs.BigIntStats, alias as fs.BigIntStats, label);
        return 'committed';
    } catch {
        return 'ambiguous';
    }
}

export function repairAtomicPrivateFilePublication(input: {
    file: string;
    temporary: string;
    commonDirectory: string;
    label: string;
    expected?: { content: Buffer; stat: fs.BigIntStats };
}): AtomicPrivateFileState {
    const state = atomicPrivateFileState(input.file, input.temporary, input.label);
    if (state === 'absent' || state === 'complete') return state;
    if (state === 'ambiguous') fail(`${input.label} publication state is ambiguous`);
    const selected = state === 'staged' ? input.temporary : input.file;
    const descriptor = fs.openSync(selected, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const allowedLinks = state === 'staged' ? [1n] : [2n];
        const owned = captureOwnedPrivateFile(
            descriptor,
            selected,
            input.commonDirectory,
            input.label,
            allowedLinks,
        );
        if (input.expected !== undefined) {
            assertSameIdentity(input.expected.stat, owned.stat, input.label);
            if (owned.stat.size !== BigInt(input.expected.content.length)) {
                fail(`${input.label} content changed before recovery`);
            }
            const actual = Buffer.allocUnsafe(input.expected.content.length);
            let offset = 0;
            while (offset < actual.length) {
                const count = fs.readSync(
                    descriptor,
                    actual,
                    offset,
                    actual.length - offset,
                    offset,
                );
                if (count === 0) fail(`${input.label} changed while recovery read it`);
                offset += count;
            }
            assertOwnedPrivateFile(owned, input.label, allowedLinks);
            if (!actual.equals(input.expected.content)) {
                fail(`${input.label} content changed before recovery`);
            }
        }
        if (state === 'committed') {
            const alias = fs.lstatSync(input.temporary, { bigint: true });
            assertPrivateRegularFile(alias, input.label, [2n]);
            assertSameIdentity(owned.stat, alias, input.label);
        }
        unlinkAndSync(input.temporary, input.commonDirectory, input.label);
        if (optionalStat(input.temporary) !== undefined) {
            fail(`${input.label} temporary alias survived recovery`);
        }
        const held = fs.fstatSync(descriptor, { bigint: true });
        if (state === 'staged') {
            if (!sameInode(owned.stat, held) || held.nlink !== 0n) {
                fail(`${input.label} staged inode changed during recovery`);
            }
            return 'absent';
        }
        const committed = fs.lstatSync(input.file, { bigint: true });
        assertPrivateRegularFile(committed, input.label, [1n]);
        assertPrivateRegularFile(held, input.label, [1n]);
        assertSameIdentity(committed, held, input.label);
        assertSameContentIdentity(owned.stat, committed, input.label);
        return 'complete';
    } finally {
        fs.closeSync(descriptor);
    }
}
