import fs from 'node:fs';
import path from 'node:path';

import { MAX_JSON_FILE_BYTES, fail } from './contracts.js';
import {
    PrivateFileDurabilityError,
    atomicPrivateFileState,
    closeOwnedPrivateFile,
    openPrivateJson,
    optionalStat,
    repairAtomicPrivateFilePublication,
    sameInode,
    type AtomicPrivateFileState,
    type OwnedPrivateFile,
} from './repository_private_file.js';

type RecoveryArtifactState = Exclude<AtomicPrivateFileState, 'absent' | 'ambiguous'>;

interface RecoveryArtifactLocation {
    target: string;
    temporary: string;
    commonDirectory: string;
    label: string;
}

interface RecoveryArtifactBytesSnapshot {
    state: RecoveryArtifactState;
    content: Buffer;
    stat: fs.BigIntStats;
}

export interface RecoveryArtifactSnapshot<T> extends RecoveryArtifactBytesSnapshot {
    state: Exclude<AtomicPrivateFileState, 'absent' | 'ambiguous'>;
    record: T;
}

export type OpaqueStagedRecoveryArtifactSnapshot<T> =
    | (Omit<RecoveryArtifactBytesSnapshot, 'state'> & { state: 'staged' })
    | (Omit<RecoveryArtifactSnapshot<T>, 'state'> & { state: 'committed' | 'complete' });

const SNAPSHOT_STAT_KEYS = Object.freeze([
    'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
] as const);
// Linux O_PATH is a stable UAPI flag not exposed by Node. It permits holding and
// fstat-ing an owned mode-0000 zero-byte inode without granting content access.
const LINUX_O_PATH = 0o10000000;

export function assertNoForeignRecoveryTemporary(target: string, expected: string): void {
    const directory = path.dirname(target);
    if (optionalStat(directory) === undefined) return;
    const prefix = `${path.basename(target)}.tmp-`;
    const opened = fs.opendirSync(directory);
    let count = 0;
    try {
        for (;;) {
            const entry = opened.readSync();
            if (entry === null) break;
            count += 1;
            if (count > 4096) fail('repository lease recovery directory exceeds its entry limit');
            if (entry.name.startsWith(prefix)
                && path.join(directory, entry.name) !== expected) {
                fail('repository lease recovery found a foreign temporary artifact');
            }
        }
    } finally {
        opened.closeSync();
    }
}

function selectedRecoveryState(input: RecoveryArtifactLocation): RecoveryArtifactState | undefined {
    const state = atomicPrivateFileState(input.target, input.temporary, input.label);
    if (state === 'ambiguous') fail(`${input.label} publication state is ambiguous`);
    if (state === 'absent') return undefined;
    return state;
}

function assertOpaqueStagedStat(stat: fs.BigIntStats, label: string): void {
    const uid = process.getuid?.();
    const mode = stat.mode & 0o7777n;
    const plausibleMode = stat.size === 0n
        ? (mode & ~0o600n) === 0n
        : mode === 0o600n;
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || stat.nlink !== 1n || stat.uid !== BigInt(uid) || !plausibleMode) {
        fail(`${label} must be a plausible exact staged private file`);
    }
}

function selectedOpaqueRecoveryState(
    input: RecoveryArtifactLocation,
): RecoveryArtifactState | undefined {
    const target = optionalStat(input.target);
    const temporary = optionalStat(input.temporary);
    if (target === undefined && temporary !== undefined) {
        assertOpaqueStagedStat(temporary, input.label);
        return 'staged';
    }
    return selectedRecoveryState(input);
}

function readParsedRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
    state: RecoveryArtifactState,
): RecoveryArtifactSnapshot<T> {
    const selected = state === 'staged' ? input.temporary : input.target;
    const allowedLinks = state === 'committed' ? [2n] : [1n];
    const opened = openPrivateJson<T>(
        selected,
        input.commonDirectory,
        input.label,
        MAX_JSON_FILE_BYTES,
        allowedLinks,
    );
    try {
        return {
            state,
            record: opened.record,
            content: Buffer.from(opened.content),
            stat: opened.stat,
        };
    } finally {
        closeOwnedPrivateFile(opened, input.label, allowedLinks);
    }
}

export function readRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
): RecoveryArtifactSnapshot<T> | undefined {
    const state = selectedRecoveryState(input);
    return state === undefined ? undefined : readParsedRecoveryArtifact<T>(input, state);
}

interface OpenedOpaqueStagedArtifact extends OwnedPrivateFile {
    content: Buffer;
}

interface OpenedPrivateParent {
    descriptor: number;
    directory: string;
    stat: fs.BigIntStats;
}

function readExactBytes(descriptor: number, bytes: number, label: string): Buffer {
    const content = Buffer.allocUnsafe(bytes);
    let offset = 0;
    while (offset < bytes) {
        const count = fs.readSync(descriptor, content, offset, bytes - offset, offset);
        if (count === 0) fail(`${label} changed while it was read`);
        offset += count;
    }
    return content;
}

function assertSameStat(
    expected: fs.BigIntStats,
    actual: fs.BigIntStats,
    label: string,
): void {
    for (const key of SNAPSHOT_STAT_KEYS) {
        if (expected[key] !== actual[key]) fail(`${label} identity changed`);
    }
}

function captureOpaqueStagedFile(
    descriptor: number,
    input: RecoveryArtifactLocation,
): OwnedPrivateFile {
    const descriptorStat = fs.fstatSync(descriptor, { bigint: true });
    const pathStat = fs.lstatSync(input.temporary, { bigint: true });
    assertOpaqueStagedStat(descriptorStat, input.label);
    assertOpaqueStagedStat(pathStat, input.label);
    assertSameStat(descriptorStat, pathStat, input.label);
    return {
        descriptor,
        file: input.temporary,
        commonDirectory: input.commonDirectory,
        stat: pathStat,
    };
}

function assertOpaqueStagedFile(
    opened: OpenedOpaqueStagedArtifact,
    label: string,
): fs.BigIntStats {
    const descriptorStat = fs.fstatSync(opened.descriptor, { bigint: true });
    const pathStat = fs.lstatSync(opened.file, { bigint: true });
    assertOpaqueStagedStat(descriptorStat, label);
    assertOpaqueStagedStat(pathStat, label);
    assertSameStat(opened.stat, descriptorStat, label);
    assertSameStat(descriptorStat, pathStat, label);
    return descriptorStat;
}

function assertPrivateParentStat(stat: fs.BigIntStats, label: string): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isDirectory() || stat.isSymbolicLink()
        || (stat.mode & 0o077n) !== 0n || stat.uid !== BigInt(uid)) {
        fail(`${label} parent must be an exact private owned directory`);
    }
}

function openPrivateParent(input: RecoveryArtifactLocation): OpenedPrivateParent {
    if (path.dirname(input.target) !== input.commonDirectory
        || path.dirname(input.temporary) !== input.commonDirectory
        || typeof fs.constants.O_DIRECTORY !== 'number') {
        fail(`${input.label} recovery parent is invalid`);
    }
    const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY;
    const descriptor = fs.openSync(input.commonDirectory, flags);
    try {
        const descriptorStat = fs.fstatSync(descriptor, { bigint: true });
        const pathStat = fs.lstatSync(input.commonDirectory, { bigint: true });
        assertPrivateParentStat(descriptorStat, input.label);
        assertPrivateParentStat(pathStat, input.label);
        assertSameStat(descriptorStat, pathStat, `${input.label} parent`);
        if (fs.realpathSync(input.commonDirectory) !== input.commonDirectory) {
            fail(`${input.label} recovery parent is not canonical`);
        }
        return { descriptor, directory: input.commonDirectory, stat: pathStat };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function assertSamePrivateParent(parent: OpenedPrivateParent, label: string): void {
    const descriptorStat = fs.fstatSync(parent.descriptor, { bigint: true });
    const pathStat = fs.lstatSync(parent.directory, { bigint: true });
    assertPrivateParentStat(descriptorStat, label);
    assertPrivateParentStat(pathStat, label);
    assertSameStat(descriptorStat, pathStat, `${label} parent`);
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid'] as const) {
        if (parent.stat[key] !== descriptorStat[key]) fail(`${label} recovery parent changed`);
    }
    if (fs.realpathSync(parent.directory) !== parent.directory) {
        fail(`${label} recovery parent changed`);
    }
}

function openOpaqueStagedArtifact(
    input: RecoveryArtifactLocation,
): OpenedOpaqueStagedArtifact {
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        fail(`${input.label} requires no-follow descriptor support`);
    }
    const initial = fs.lstatSync(input.temporary, { bigint: true });
    assertOpaqueStagedStat(initial, input.label);
    const zeroByteOPath = initial.size === 0n && process.platform === 'linux';
    if (!zeroByteOPath && typeof fs.constants.O_NONBLOCK !== 'number') {
        fail(`${input.label} requires nonblocking descriptor support`);
    }
    const flags = zeroByteOPath
        ? LINUX_O_PATH | fs.constants.O_NOFOLLOW
        : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
    const descriptor = fs.openSync(
        input.temporary,
        flags,
    );
    try {
        const owned = captureOpaqueStagedFile(descriptor, input);
        if (owned.stat.size > BigInt(MAX_JSON_FILE_BYTES)) {
            fail(`${input.label} exceeds its byte limit`);
        }
        const content = readExactBytes(descriptor, Number(owned.stat.size), input.label);
        assertOpaqueStagedFile({ ...owned, content }, input.label);
        return { ...owned, content };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

export function readOpaqueStagedRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
): OpaqueStagedRecoveryArtifactSnapshot<T> | undefined {
    const state = selectedOpaqueRecoveryState(input);
    if (state === undefined) return undefined;
    if (state !== 'staged') {
        return readParsedRecoveryArtifact<T>(input, state) as
            OpaqueStagedRecoveryArtifactSnapshot<T>;
    }
    const opened = openOpaqueStagedArtifact(input);
    try {
        return { state, content: Buffer.from(opened.content), stat: opened.stat };
    } finally {
        try {
            assertOpaqueStagedFile(opened, input.label);
        } finally {
            fs.closeSync(opened.descriptor);
        }
    }
}

export function repairRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
    snapshot: RecoveryArtifactSnapshot<T>,
): void {
    if (snapshot.state !== 'staged' && snapshot.state !== 'committed') return;
    repairAtomicPrivateFilePublication({
        file: input.target,
        temporary: input.temporary,
        commonDirectory: input.commonDirectory,
        label: input.label,
        expected: { content: snapshot.content, stat: snapshot.stat },
    });
}

function assertSameBytes(
    input: RecoveryArtifactLocation,
    expected: RecoveryArtifactBytesSnapshot | undefined,
    actual: RecoveryArtifactBytesSnapshot | undefined,
): void {
    if (expected === undefined) {
        if (actual !== undefined) fail(`${input.label} appeared during recovery`);
        return;
    }
    if (actual === undefined || actual.state !== expected.state
        || !actual.content.equals(expected.content)) {
        fail(`${input.label} changed during recovery`);
    }
    for (const key of SNAPSHOT_STAT_KEYS) {
        if (actual.stat[key] !== expected.stat[key]) {
            fail(`${input.label} changed during recovery`);
        }
    }
}

function assertOpenedMatches(
    input: RecoveryArtifactLocation,
    opened: OpenedOpaqueStagedArtifact,
    expected: Extract<OpaqueStagedRecoveryArtifactSnapshot<unknown>, { state: 'staged' }>,
): void {
    assertOpaqueStagedFile(opened, input.label);
    const content = readExactBytes(opened.descriptor, expected.content.length, input.label);
    const stat = assertOpaqueStagedFile(opened, input.label);
    assertSameBytes(input, expected, {
        state: 'staged',
        content,
        stat,
    });
}

export function removeOpaqueStagedRecoveryArtifact(
    input: RecoveryArtifactLocation,
    expected: Extract<OpaqueStagedRecoveryArtifactSnapshot<unknown>, { state: 'staged' }>,
    recheckOperationAuthority: () => void,
): void {
    if (typeof recheckOperationAuthority !== 'function') {
        fail(`${input.label} recovery authority recheck is required`);
    }
    if (selectedOpaqueRecoveryState(input) !== 'staged') {
        fail(`${input.label} publication changed before recovery`);
    }
    const parent = openPrivateParent(input);
    let opened: OpenedOpaqueStagedArtifact | undefined;
    try {
        opened = openOpaqueStagedArtifact(input);
        assertOpenedMatches(input, opened, expected);
        recheckOperationAuthority();
        assertOpenedMatches(input, opened, expected);
        assertSamePrivateParent(parent, input.label);
        if (optionalStat(input.target) !== undefined) {
            fail(`${input.label} target appeared before staged recovery`);
        }
        fs.unlinkSync(input.temporary);
        let syncError: unknown;
        try {
            fs.fsyncSync(parent.descriptor);
        } catch (error) {
            syncError = error;
        }
        let verificationError: unknown;
        try {
            assertSamePrivateParent(parent, input.label);
            const held = fs.fstatSync(opened.descriptor, { bigint: true });
            if (!sameInode(opened.stat, held) || held.nlink !== 0n
                || held.mode !== opened.stat.mode || held.uid !== opened.stat.uid
                || held.gid !== opened.stat.gid || held.size !== opened.stat.size
                || held.mtimeNs !== opened.stat.mtimeNs
                || optionalStat(input.temporary) !== undefined
                || optionalStat(input.target) !== undefined) {
                fail(`${input.label} staged artifact changed during recovery`);
            }
        } catch (error) {
            verificationError = error;
        }
        if (syncError !== undefined) throw new PrivateFileDurabilityError(input.label, syncError);
        if (verificationError !== undefined) throw verificationError;
        recheckOperationAuthority();
    } finally {
        if (opened !== undefined) fs.closeSync(opened.descriptor);
        fs.closeSync(parent.descriptor);
    }
}

export function assertSameRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
    expected: RecoveryArtifactSnapshot<T> | undefined,
): RecoveryArtifactSnapshot<T> | undefined {
    const actual = readRecoveryArtifact<T>(input);
    assertSameBytes(input, expected, actual);
    return actual;
}

export function assertSameOpaqueStagedRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
    expected: OpaqueStagedRecoveryArtifactSnapshot<T> | undefined,
): OpaqueStagedRecoveryArtifactSnapshot<T> | undefined {
    const actual = readOpaqueStagedRecoveryArtifact<T>(input);
    assertSameBytes(input, expected, actual);
    return actual;
}
