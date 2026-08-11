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
import {
    atomicPrivateTemporaryPath,
    createAtomicPrivateFile,
    optionalStat,
    repairAtomicPrivateFilePublication,
    sameInode,
    type OwnedPrivateFile,
} from './repository_private_file.js';

export interface RepositoryOperationPaths {
    commonDirectory: string;
    guard: string;
    claim: string;
    recoveryOwner: string;
}

export interface OwnedOperationGuard extends OwnedPrivateFile {
    record: RepositoryOperationRecord;
}

interface OwnedRecoveryOwner extends OwnedPrivateFile {
    record: RepositoryOperationRecoveryOwnerRecord;
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
    let owned: OwnedPrivateFile;
    try {
        owned = createAtomicPrivateFile({
            file: paths.guard,
            temporary: atomicPrivateTemporaryPath(
                paths.guard,
                record.owner.pid,
                record.operation_id,
            ),
            commonDirectory: paths.commonDirectory,
            content: Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
            label: 'repository operation guard',
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            fail('repository operation guard already exists; explicit recovery is required');
        }
        throw error;
    }
    assertPrivateOperationGuard(owned.stat);
    return { ...owned, record };
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
    const owned = createAtomicPrivateFile({
        file: paths.recoveryOwner,
        temporary: atomicPrivateTemporaryPath(
            paths.recoveryOwner,
            record.owner.pid,
            record.recovery_id,
        ),
        commonDirectory: paths.commonDirectory,
        content: Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
        label: 'repository operation recovery owner',
    });
    assertPrivateOperationGuard(owned.stat);
    return { ...owned, record };
}

function rejectInterruptedRecoveryOwner(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
): never {
    const previous = readRecoveryOwner(paths.recoveryOwner, [1n, 2n]);
    assertRecoveryOwnerTargets(previous.record, target);
    if (!operationOwnerDefinitelyDead(previous.record.owner)) {
        fail('another repository operation recovery is active');
    }
    if (previous.stat.nlink === 2n) {
        const repeated = readRecoveryOwner(paths.recoveryOwner, [2n]);
        assertRecoveryOwnerTargets(repeated.record, target);
        if (!operationOwnerDefinitelyDead(repeated.record.owner)) {
            fail('another repository operation recovery is active');
        }
        repairAtomicPrivateFilePublication({
            file: paths.recoveryOwner,
            temporary: atomicPrivateTemporaryPath(
                paths.recoveryOwner,
                repeated.record.owner.pid,
                repeated.record.recovery_id,
            ),
            commonDirectory: paths.commonDirectory,
            label: 'repository operation recovery owner',
            expected: { content: repeated.content, stat: repeated.stat },
        });
        const repaired = readRecoveryOwner(paths.recoveryOwner);
        assertRecoveryOwnerTargets(repaired.record, target);
        if (!operationOwnerDefinitelyDead(repaired.record.owner)) {
            fail('another repository operation recovery is active');
        }
    }
    fail('an interrupted repository operation recovery requires operator investigation');
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
    return rejectInterruptedRecoveryOwner(paths, target);
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
    if (optionalStat(paths.guard) !== undefined) return readOperationGuard(paths.guard, [1n, 2n]);
    if (optionalStat(paths.recoveryOwner) !== undefined) {
        const previous = readRecoveryOwner(paths.recoveryOwner, [1n, 2n]);
        if (operationOwnerDefinitelyDead(previous.record.owner)) {
            fail('an interrupted repository operation recovery requires operator investigation');
        }
        fail('another repository operation recovery is active');
    }
    return undefined;
}

export function normalizeOperationGuardPublication(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
): void {
    if (optionalStat(paths.claim) !== undefined) return;
    const guarded = readOperationGuard(paths.guard, [1n, 2n]);
    assertSnapshotTarget(guarded, target);
    if (!operationOwnerDefinitelyDead(guarded.record.owner)) {
        fail('another repository operation is active');
    }
    if (guarded.stat.nlink === 1n) return;
    const repeated = readOperationGuard(paths.guard, [2n]);
    assertSnapshotTarget(repeated, target);
    if (!operationOwnerDefinitelyDead(repeated.record.owner)) {
        fail('another repository operation is active');
    }
    repairAtomicPrivateFilePublication({
        file: paths.guard,
        temporary: atomicPrivateTemporaryPath(
            paths.guard,
            repeated.record.owner.pid,
            repeated.record.operation_id,
        ),
        commonDirectory: paths.commonDirectory,
        label: 'repository operation guard',
        expected: { content: repeated.content, stat: repeated.stat },
    });
    const repaired = readOperationGuard(paths.guard);
    assertSnapshotTarget(repaired, target);
    if (!operationOwnerDefinitelyDead(repaired.record.owner)) {
        fail('another repository operation is active');
    }
}

export function claimAndRemoveOperationGuard(
    paths: RepositoryOperationPaths,
    target: RepositoryOperationRecoveryTarget,
    validate: (record: RepositoryOperationRecord) => void,
): RepositoryOperationRecord {
    normalizeOperationGuardPublication(paths, target);
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
