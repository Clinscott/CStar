import path from 'node:path';

import {
    assertExactObjectKeys,
    assertSha256,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    fsyncDirectory,
    sha256,
} from './contracts.js';
import { atomicPrivateTemporaryPath } from './repository_private_file.js';
import {
    assertNoForeignRecoveryTemporary,
    assertSameOpaqueStagedRecoveryArtifact,
    readOpaqueStagedRecoveryArtifact,
    removeOpaqueStagedRecoveryArtifact,
    repairRecoveryArtifact,
    type OpaqueStagedRecoveryArtifactSnapshot,
} from './repository_lease_recovery_artifact.js';

export type RepositoryReceiptRecoveryOutcome =
    | 'absent'
    | 'body-only'
    | 'body-with-claim'
    | 'sealed';

export interface RepositoryReceiptRecoveryTarget {
    file: string;
    directory: string;
    label: string;
}

export interface RepositoryReceiptRecoveryAuthority {
    owner_pid: number;
    operation_id: string;
    body_sha256: string;
    seal_sha256: string;
    claim_sha256?: string;
}

type ReceiptRecoveryRole = 'claim' | 'body' | 'seal';
type ReceiptSnapshot = OpaqueStagedRecoveryArtifactSnapshot<unknown> | undefined;

interface RecoveryLocation {
    target: string;
    temporary: string;
    commonDirectory: string;
    label: string;
    digest: string;
}

type RecoveryLocations = Partial<Record<ReceiptRecoveryRole, RecoveryLocation>>
    & Pick<Record<ReceiptRecoveryRole, RecoveryLocation>, 'body' | 'seal'>;
type RecoverySnapshots = Partial<Record<ReceiptRecoveryRole, ReceiptSnapshot>>;

function recoveryLocation(
    target: RepositoryReceiptRecoveryTarget,
    ownerPid: number,
    operationId: string,
    digest: string,
): RecoveryLocation {
    if (!target || typeof target !== 'object'
        || typeof target.file !== 'string' || !path.isAbsolute(target.file)
        || path.resolve(target.file) !== target.file || /[\r\n\0]/.test(target.file)
        || typeof target.directory !== 'string'
        || path.dirname(target.file) !== target.directory
        || typeof target.label !== 'string' || target.label.length < 1
        || /[\r\n\0]/.test(target.label)) {
        fail('receipt recovery target is invalid');
    }
    assertSha256(digest, `${target.label} expected digest`);
    const directory = canonicalPrivateDirectory(target.directory, target.label);
    if (directory !== target.directory) fail(`${target.label} directory is not canonical`);
    return {
        target: target.file,
        temporary: atomicPrivateTemporaryPath(target.file, ownerPid, operationId),
        commonDirectory: directory,
        label: target.label,
        digest,
    };
}

function validateAuthority(
    value: RepositoryReceiptRecoveryAuthority,
    claimExpected: boolean,
): void {
    assertExactObjectKeys(value, [
        'owner_pid', 'operation_id', 'body_sha256', 'seal_sha256',
        ...(claimExpected ? ['claim_sha256'] : []),
    ], 'receipt recovery authority');
    assertSha256(value.body_sha256, 'receipt recovery body digest');
    assertSha256(value.seal_sha256, 'receipt recovery seal digest');
    if (claimExpected) assertSha256(value.claim_sha256, 'receipt recovery claim digest');
    atomicPrivateTemporaryPath('/receipt-recovery-authority', value.owner_pid, value.operation_id);
}

function assertSameAuthority(
    expected: RepositoryReceiptRecoveryAuthority,
    actual: RepositoryReceiptRecoveryAuthority,
    claimExpected: boolean,
): void {
    validateAuthority(actual, claimExpected);
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        fail('receipt recovery operation authority changed');
    }
}

function readSnapshots(locations: RecoveryLocations): RecoverySnapshots {
    const snapshots: RecoverySnapshots = {};
    for (const role of ['claim', 'body', 'seal'] as const) {
        const location = locations[role];
        if (location !== undefined) {
            snapshots[role] = readOpaqueStagedRecoveryArtifact(location);
        }
    }
    return snapshots;
}

function assertSnapshotDigests(
    locations: RecoveryLocations,
    snapshots: RecoverySnapshots,
): void {
    for (const role of ['claim', 'body', 'seal'] as const) {
        const location = locations[role];
        const snapshot = snapshots[role];
        if (location !== undefined && snapshot !== undefined && snapshot.state !== 'staged'
            && sha256(snapshot.content) !== location.digest) {
            fail(`${location.label} does not match the operation-bound digest`);
        }
    }
}

function assertPublicationOrder(
    locations: RecoveryLocations,
    snapshots: RecoverySnapshots,
): void {
    const claim = snapshots.claim;
    const body = snapshots.body;
    const seal = snapshots.seal;
    if (claim !== undefined && (body === undefined || body.state !== 'complete')) {
        fail('receipt claim crossed an incomplete body publication');
    }
    if (seal !== undefined && (body === undefined || body.state !== 'complete'
        || (locations.claim !== undefined
            && (claim === undefined || claim.state !== 'complete')))) {
        fail('receipt seal crossed an incomplete prerequisite publication');
    }
}

function validateSnapshots(
    locations: RecoveryLocations,
    snapshots: RecoverySnapshots,
): void {
    assertSnapshotDigests(locations, snapshots);
    assertPublicationOrder(locations, snapshots);
}

function assertSnapshotsUnchanged(
    locations: RecoveryLocations,
    expected: RecoverySnapshots,
): void {
    for (const role of ['claim', 'body', 'seal'] as const) {
        const location = locations[role];
        if (location !== undefined) {
            assertSameOpaqueStagedRecoveryArtifact(location, expected[role]);
        }
    }
}

function assertStableSnapshots(snapshots: RecoverySnapshots): void {
    for (const snapshot of Object.values(snapshots)) {
        if (snapshot !== undefined && snapshot.state !== 'complete') {
            fail('receipt recovery did not reach a stable publication state');
        }
    }
}

function recoveryOutcome(snapshots: RecoverySnapshots): RepositoryReceiptRecoveryOutcome {
    if (snapshots.seal !== undefined) return 'sealed';
    if (snapshots.claim !== undefined) return 'body-with-claim';
    if (snapshots.body !== undefined) return 'body-only';
    return 'absent';
}

export function recoverRepositoryReceiptAliases(input: {
    claim?: RepositoryReceiptRecoveryTarget;
    body: RepositoryReceiptRecoveryTarget;
    seal: RepositoryReceiptRecoveryTarget;
    assertDeadTargetBoundOperation: () => RepositoryReceiptRecoveryAuthority;
}): {
    outcome: RepositoryReceiptRecoveryOutcome;
    repaired: readonly ReceiptRecoveryRole[];
} {
    if (typeof input.assertDeadTargetBoundOperation !== 'function') {
        fail('receipt recovery target assertion is required');
    }
    const selectedAuthority = input.assertDeadTargetBoundOperation();
    validateAuthority(selectedAuthority, input.claim !== undefined);
    const authority = Object.freeze({ ...selectedAuthority });
    validateAuthority(authority, input.claim !== undefined);
    const locations: RecoveryLocations = {
        body: recoveryLocation(
            input.body,
            authority.owner_pid,
            authority.operation_id,
            authority.body_sha256,
        ),
        seal: recoveryLocation(
            input.seal,
            authority.owner_pid,
            authority.operation_id,
            authority.seal_sha256,
        ),
    };
    if (input.claim !== undefined) {
        locations.claim = recoveryLocation(
            input.claim,
            authority.owner_pid,
            authority.operation_id,
            authority.claim_sha256 as string,
        );
    }
    const namespace = Object.values(locations).flatMap(
        ({ target, temporary }) => [target, temporary],
    );
    if (new Set(namespace).size !== namespace.length) {
        fail('receipt recovery target and temporary paths must be distinct');
    }

    const assertAuthority = (): void => assertSameAuthority(
        authority,
        input.assertDeadTargetBoundOperation(),
        input.claim !== undefined,
    );
    const assertNoForeignTemporaries = (): void => {
        for (const location of Object.values(locations)) {
            assertNoForeignRecoveryTemporary(location.target, location.temporary);
        }
    };
    assertAuthority();
    assertNoForeignTemporaries();
    let snapshots = readSnapshots(locations);
    validateSnapshots(locations, snapshots);

    const repaired: ReceiptRecoveryRole[] = [];
    for (const role of ['body', 'claim', 'seal'] as const) {
        const location = locations[role];
        const snapshot = snapshots[role];
        if (location === undefined || snapshot === undefined
            || (snapshot.state !== 'staged' && snapshot.state !== 'committed')) {
            continue;
        }
        assertSnapshotsUnchanged(locations, snapshots);
        assertNoForeignTemporaries();
        assertAuthority();
        if (snapshot.state === 'staged') {
            removeOpaqueStagedRecoveryArtifact(location, snapshot, () => {
                assertNoForeignTemporaries();
                assertAuthority();
            });
        } else {
            repairRecoveryArtifact(location, snapshot);
        }
        repaired.push(role);
        assertAuthority();
        snapshots = readSnapshots(locations);
        validateSnapshots(locations, snapshots);
    }

    assertStableSnapshots(snapshots);
    for (const directory of new Set(
        Object.values(locations).map(({ commonDirectory }) => commonDirectory),
    )) fsyncDirectory(directory);
    assertNoForeignTemporaries();
    assertAuthority();
    assertSnapshotsUnchanged(locations, snapshots);
    return { outcome: recoveryOutcome(snapshots), repaired };
}
