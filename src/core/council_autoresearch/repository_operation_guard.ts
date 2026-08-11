import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    fail,
    fsyncDirectory,
} from './contracts.js';
import { gitCommonDirectory } from './git_trust.js';
import {
    currentOperationOwner,
    operationOwnerDefinitelyDead,
} from './operation_identity.js';
import {
    assertPrivateOperationGuard,
    assertRecoveryOwnerTargets,
    assertSameOperationGuard,
    operationRecoveryTarget,
    readOperationGuard,
    readRecoveryOwner,
    validateRecoveryOwnerRecord,
    validateRepositoryOperationRecord,
    type RepositoryOperationGuardSnapshot,
    type RepositoryOperationRecord,
    type RepositoryOperationRecoveryOwnerRecord,
    type RepositoryOperationRecoveryTarget,
} from './repository_lease_contract.js';

export interface RepositoryOperationPaths {
    commonDirectory: string;
    guard: string;
    claim: string;
    recoveryOwner: string;
}

export interface OwnedOperationGuard {
    descriptor: number;
    file: string;
    commonDirectory: string;
    record: RepositoryOperationRecord;
    stat: fs.BigIntStats;
}

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

interface OwnedRecoveryOwner {
    descriptor: number;
    file: string;
    commonDirectory: string;
    record: RepositoryOperationRecoveryOwnerRecord;
    stat: fs.BigIntStats;
}

export function repositoryOperationPaths(repoRoot: string): RepositoryOperationPaths {
    const commonDirectory = gitCommonDirectory(repoRoot);
    const guard = path.join(commonDirectory, 'cstar-council-autoresearch.lock.operation');
    return {
        commonDirectory,
        guard,
        claim: `${guard}.recovery-claim`,
        recoveryOwner: `${guard}.recovery-owner`,
    };
}

export function optionalStat(file: string): fs.BigIntStats | undefined {
    try {
        return fs.lstatSync(file, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function assertPrivateOwnedFile(stat: fs.BigIntStats, label: string, links = 1n): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || stat.nlink !== links || (stat.mode & 0o7777n) !== 0o600n
        || stat.uid !== BigInt(uid)) {
        fail(`${label} must be an exact private owned regular file`);
    }
}

function assertSameOwnedFile(
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

export function captureOwnedPrivateFile(
    descriptor: number,
    file: string,
    commonDirectory: string,
    label: string,
): OwnedPrivateFile {
    const owned = fs.fstatSync(descriptor, { bigint: true });
    const linked = fs.lstatSync(file, { bigint: true });
    assertPrivateOwnedFile(owned, label);
    assertPrivateOwnedFile(linked, label);
    assertSameOwnedFile(owned, linked, label);
    return { descriptor, file, commonDirectory, stat: linked };
}

export function assertOwnedPrivateFile(owned: OwnedPrivateFile, label: string): void {
    const descriptor = fs.fstatSync(owned.descriptor, { bigint: true });
    const linked = fs.lstatSync(owned.file, { bigint: true });
    assertPrivateOwnedFile(descriptor, label);
    assertPrivateOwnedFile(linked, label);
    assertSameOwnedFile(owned.stat, descriptor, label);
    assertSameOwnedFile(descriptor, linked, label);
}

export function closeOwnedPrivateFile(owned: OwnedPrivateFile, label: string): void {
    try {
        assertOwnedPrivateFile(owned, label);
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
): OpenedPrivateJson<T> {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const owned = captureOwnedPrivateFile(descriptor, file, commonDirectory, label);
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
        assertOwnedPrivateFile(owned, label);
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

function removeOwnedGuard(owned: {
    descriptor: number;
    file: string;
    commonDirectory: string;
    stat: fs.BigIntStats;
}): void {
    try {
        const descriptor = fs.fstatSync(owned.descriptor, { bigint: true });
        const linked = fs.lstatSync(owned.file, { bigint: true });
        assertPrivateOperationGuard(descriptor);
        assertPrivateOperationGuard(linked);
        assertSameOperationGuard(owned.stat, descriptor, 'repository operation guard changed');
        assertSameOperationGuard(descriptor, linked, 'repository operation guard path changed');
        fs.unlinkSync(owned.file);
        fsyncDirectory(owned.commonDirectory);
        if (optionalStat(owned.file) !== undefined) {
            fail('repository operation guard path survived unlink');
        }
        const unlinked = fs.fstatSync(owned.descriptor, { bigint: true });
        if (!sameInode(unlinked, owned.stat) || unlinked.nlink !== 0n) {
            fail('repository operation guard inode changed during unlink');
        }
    } finally {
        fs.closeSync(owned.descriptor);
    }
}

export function createOwnedOperationGuard(
    paths: RepositoryOperationPaths,
    record: RepositoryOperationRecord,
): OwnedOperationGuard {
    validateRepositoryOperationRecord(record);
    let descriptor: number;
    try {
        descriptor = fs.openSync(paths.guard, 'wx', 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        fail('repository operation guard already exists; explicit recovery is required');
    }
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
        fs.fsyncSync(descriptor);
        fsyncDirectory(paths.commonDirectory);
        const stat = fs.fstatSync(descriptor, { bigint: true });
        const linked = fs.lstatSync(paths.guard, { bigint: true });
        assertPrivateOperationGuard(stat);
        assertPrivateOperationGuard(linked);
        assertSameOperationGuard(stat, linked, 'repository operation guard changed during creation');
        return {
            descriptor,
            file: paths.guard,
            commonDirectory: paths.commonDirectory,
            record,
            stat: linked,
        };
    } catch (error) {
        try {
            const partial = captureOwnedPrivateFile(
                descriptor,
                paths.guard,
                paths.commonDirectory,
                'repository operation guard',
            );
            unlinkOwnedPrivateFile(partial, 'repository operation guard');
        } catch (cleanupError) {
            try {
                fs.closeSync(descriptor);
            } catch {
                // The cleanup error is the actionable fail-closed result.
            }
            fail(`repository operation guard creation failed and cleanup was unsafe: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`);
        }
        throw error;
    }
}

export function releaseOwnedOperationGuard(owned: OwnedOperationGuard): void {
    removeOwnedGuard(owned);
}

export function abandonOwnedOperationGuard(owned: OwnedOperationGuard): void {
    fs.closeSync(owned.descriptor);
}

export function assertNoRecoverySidecars(paths: RepositoryOperationPaths): void {
    if (optionalStat(paths.claim) !== undefined || optionalStat(paths.recoveryOwner) !== undefined) {
        fail('repository operation recovery claim requires explicit completion');
    }
}

function createRecoveryOwner(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
): OwnedRecoveryOwner {
    const record: RepositoryOperationRecoveryOwnerRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        recovery_id: randomUUID(),
        target,
        owner: currentOperationOwner(),
        acquired_at: new Date().toISOString(),
    };
    validateRecoveryOwnerRecord(record);
    const descriptor = fs.openSync(paths.recoveryOwner, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
        fs.fsyncSync(descriptor);
        fsyncDirectory(paths.commonDirectory);
        const stat = fs.fstatSync(descriptor, { bigint: true });
        const linked = fs.lstatSync(paths.recoveryOwner, { bigint: true });
        assertPrivateOperationGuard(stat);
        assertPrivateOperationGuard(linked);
        assertSameOperationGuard(stat, linked, 'repository operation recovery owner changed');
        return {
            descriptor,
            file: paths.recoveryOwner,
            commonDirectory: paths.commonDirectory,
            record,
            stat: linked,
        };
    } catch (error) {
        try {
            const partial = captureOwnedPrivateFile(
                descriptor,
                paths.recoveryOwner,
                paths.commonDirectory,
                'repository operation recovery owner',
            );
            unlinkOwnedPrivateFile(partial, 'repository operation recovery owner');
        } catch (cleanupError) {
            try {
                fs.closeSync(descriptor);
            } catch {
                // The cleanup error below is the actionable fail-closed result.
            }
            fail(`repository operation recovery owner creation failed and cleanup was unsafe: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`);
        }
        throw error;
    }
}

export function acquireRecoveryOwner(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
): OwnedRecoveryOwner {
    try {
        return createRecoveryOwner(paths, target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const previous = readRecoveryOwner(paths.recoveryOwner);
    assertRecoveryOwnerTargets(previous.record, target);
    if (operationOwnerDefinitelyDead(previous.record.owner)) {
        fail('an interrupted repository operation recovery requires operator investigation');
    }
    fail('another repository operation recovery is active');
}

export function releaseRecoveryOwner(owned: OwnedRecoveryOwner): void {
    removeOwnedGuard(owned);
}

function assertSnapshotTarget(
    snapshot: RepositoryOperationGuardSnapshot,
    target: RepositoryOperationRecoveryTarget,
): void {
    const actual = operationRecoveryTarget(snapshot);
    if (JSON.stringify(actual) !== JSON.stringify(target)) {
        fail('repository operation guard changed while explicit recovery claimed it');
    }
}

export function selectRecoveryTarget(
    paths: RepositoryOperationPaths,
): RepositoryOperationGuardSnapshot | undefined {
    if (optionalStat(paths.claim) !== undefined) return readOperationGuard(paths.claim, [1n, 2n]);
    if (optionalStat(paths.guard) !== undefined) return readOperationGuard(paths.guard);
    if (optionalStat(paths.recoveryOwner) !== undefined) {
        const previous = readRecoveryOwner(paths.recoveryOwner);
        if (operationOwnerDefinitelyDead(previous.record.owner)) {
            fail('an interrupted repository operation recovery requires operator investigation');
        }
        fail('another repository operation recovery is active');
    }
    return undefined;
}

export function claimAndRemoveOperationGuard(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
    validate: (record: RepositoryOperationRecord) => void,
): RepositoryOperationRecord {
    let claimed: RepositoryOperationGuardSnapshot;
    if (optionalStat(paths.claim) !== undefined) {
        claimed = readOperationGuard(paths.claim, [1n, 2n]);
        assertSnapshotTarget(claimed, target);
    } else {
        const guarded = readOperationGuard(paths.guard);
        assertSnapshotTarget(guarded, target);
        validate(guarded.record);
        if (!operationOwnerDefinitelyDead(guarded.record.owner)) {
            fail('another repository operation is active');
        }
        fs.linkSync(paths.guard, paths.claim);
        fsyncDirectory(paths.commonDirectory);
        claimed = readOperationGuard(paths.claim, [1n, 2n]);
        assertSnapshotTarget(claimed, target);
    }
    validate(claimed.record);
    if (!operationOwnerDefinitelyDead(claimed.record.owner)) {
        fail('another repository operation is active');
    }

    const guardStat = optionalStat(paths.guard);
    if (claimed.stat.nlink === 2n) {
        if (guardStat === undefined || !sameInode(claimed.stat, guardStat)) {
            fail('repository operation recovery claim does not name the guarded operation');
        }
        const finalClaim = readOperationGuard(paths.claim, [2n]);
        const finalGuard = readOperationGuard(paths.guard, [2n]);
        assertSnapshotTarget(finalClaim, target);
        assertSnapshotTarget(finalGuard, target);
        validate(finalClaim.record);
        fs.unlinkSync(paths.guard);
        fsyncDirectory(paths.commonDirectory);
    } else if (guardStat !== undefined && sameInode(claimed.stat, guardStat)) {
        fail('repository operation recovery claim link count is inconsistent');
    }

    const confirmed = readOperationGuard(paths.claim);
    assertSnapshotTarget(confirmed, target);
    validate(confirmed.record);
    if (!operationOwnerDefinitelyDead(confirmed.record.owner)) {
        fail('another repository operation is active');
    }
    const finalClaim = readOperationGuard(paths.claim);
    assertSnapshotTarget(finalClaim, target);
    fs.unlinkSync(paths.claim);
    fsyncDirectory(paths.commonDirectory);
    return confirmed.record;
}
