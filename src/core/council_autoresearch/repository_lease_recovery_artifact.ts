import fs from 'node:fs';
import path from 'node:path';

import { MAX_JSON_FILE_BYTES, fail } from './contracts.js';
import {
    atomicPrivateFileState,
    closeOwnedPrivateFile,
    openPrivateJson,
    optionalStat,
    repairAtomicPrivateFilePublication,
    type AtomicPrivateFileState,
} from './repository_private_file.js';

export interface RecoveryArtifactSnapshot<T> {
    state: Exclude<AtomicPrivateFileState, 'absent' | 'ambiguous'>;
    record: T;
    content: Buffer;
    stat: fs.BigIntStats;
}

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

export function readRecoveryArtifact<T>(input: {
    target: string;
    temporary: string;
    commonDirectory: string;
    label: string;
}): RecoveryArtifactSnapshot<T> | undefined {
    const state = atomicPrivateFileState(input.target, input.temporary, input.label);
    if (state === 'ambiguous') fail(`${input.label} publication state is ambiguous`);
    if (state === 'absent') return undefined;
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

export function repairRecoveryArtifact<T>(
    input: {
        target: string;
        temporary: string;
        commonDirectory: string;
        label: string;
    },
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

export function assertSameRecoveryArtifact<T>(
    input: {
        target: string;
        temporary: string;
        commonDirectory: string;
        label: string;
    },
    expected: RecoveryArtifactSnapshot<T> | undefined,
): RecoveryArtifactSnapshot<T> | undefined {
    const actual = readRecoveryArtifact<T>(input);
    if (expected === undefined) {
        if (actual !== undefined) fail(`${input.label} appeared during recovery`);
        return undefined;
    }
    if (actual === undefined || actual.state !== expected.state
        || !actual.content.equals(expected.content)) {
        fail(`${input.label} changed during recovery`);
    }
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) {
        if (actual.stat[key] !== expected.stat[key]) {
            fail(`${input.label} changed during recovery`);
        }
    }
    return actual;
}
