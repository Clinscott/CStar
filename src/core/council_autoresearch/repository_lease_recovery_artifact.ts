import fs from 'node:fs';
import path from 'node:path';

import { MAX_JSON_FILE_BYTES, fail, fsyncDirectory } from './contracts.js';
import {
    PrivateFileDurabilityError,
    atomicPrivateFileState,
    assertOwnedPrivateFile,
    captureOwnedPrivateFile,
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

function openOpaqueStagedArtifact(
    input: RecoveryArtifactLocation,
): OpenedOpaqueStagedArtifact {
    if (typeof fs.constants.O_NONBLOCK !== 'number') {
        fail(`${input.label} requires nonblocking descriptor support`);
    }
    const descriptor = fs.openSync(
        input.temporary,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
        const owned = captureOwnedPrivateFile(
            descriptor,
            input.temporary,
            input.commonDirectory,
            input.label,
        );
        if (owned.stat.size > BigInt(MAX_JSON_FILE_BYTES)) {
            fail(`${input.label} exceeds its byte limit`);
        }
        const content = readExactBytes(descriptor, Number(owned.stat.size), input.label);
        assertOwnedPrivateFile(owned, input.label);
        return { ...owned, content };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

export function readOpaqueStagedRecoveryArtifact<T>(
    input: RecoveryArtifactLocation,
): OpaqueStagedRecoveryArtifactSnapshot<T> | undefined {
    const state = selectedRecoveryState(input);
    if (state === undefined) return undefined;
    if (state !== 'staged') {
        return readParsedRecoveryArtifact<T>(input, state) as
            OpaqueStagedRecoveryArtifactSnapshot<T>;
    }
    const opened = openOpaqueStagedArtifact(input);
    try {
        return { state, content: Buffer.from(opened.content), stat: opened.stat };
    } finally {
        closeOwnedPrivateFile(opened, input.label);
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
    assertOwnedPrivateFile(opened, input.label);
    const content = readExactBytes(opened.descriptor, expected.content.length, input.label);
    assertOwnedPrivateFile(opened, input.label);
    assertSameBytes(input, expected, {
        state: 'staged',
        content,
        stat: fs.fstatSync(opened.descriptor, { bigint: true }),
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
    if (selectedRecoveryState(input) !== 'staged') {
        fail(`${input.label} publication changed before recovery`);
    }
    const opened = openOpaqueStagedArtifact(input);
    try {
        assertOpenedMatches(input, opened, expected);
        recheckOperationAuthority();
        assertOpenedMatches(input, opened, expected);
        if (optionalStat(input.target) !== undefined) {
            fail(`${input.label} target appeared before staged recovery`);
        }
        fs.unlinkSync(input.temporary);
        recheckOperationAuthority();
        try {
            fsyncDirectory(input.commonDirectory);
        } catch (error) {
            throw new PrivateFileDurabilityError(input.label, error);
        }
        const held = fs.fstatSync(opened.descriptor, { bigint: true });
        if (!sameInode(opened.stat, held) || held.nlink !== 0n
            || held.mode !== opened.stat.mode || held.uid !== opened.stat.uid
            || held.gid !== opened.stat.gid || held.size !== opened.stat.size
            || held.mtimeNs !== opened.stat.mtimeNs
            || optionalStat(input.temporary) !== undefined
            || optionalStat(input.target) !== undefined) {
            fail(`${input.label} staged artifact changed during recovery`);
        }
    } finally {
        fs.closeSync(opened.descriptor);
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
