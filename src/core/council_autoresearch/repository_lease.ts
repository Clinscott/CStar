import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertRunId,
    canonicalPrivateDirectory,
    ensureDirectoryNoFollow,
    fail,
    readRegularFileNoFollow,
    repairInterruptedImmutableWrite,
    sha256,
    validateDirectoryCreationTarget,
    writeImmutableJson,
} from './contracts.js';
import { gitCommonDirectory, repositoryRoot } from './git_trust.js';
import { currentOperationOwner } from './operation_identity.js';
import {
    abandonOwnedOperationGuard,
    assertNoRecoverySidecars,
    createOwnedOperationGuard,
    releaseOwnedOperationGuard,
    repositoryOperationPaths,
    type OwnedOperationGuard,
} from './repository_operation_guard.js';
import {
    governedPathsSha256,
    type OwnedRepositoryLease,
    type RepositoryLeaseAcquisitionOperationRecord,
    type RepositoryLeaseRecord,
    type RepositoryOperationKind,
    type RepositoryOperationRecord,
    type RepositoryOperationRecovery,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    atomicPrivateFileState,
    atomicPrivateTemporaryPath,
    closeOwnedPrivateFile,
    createAtomicPrivateFile,
    optionalStat,
    privateFileDurabilityUncertain,
    unlinkOwnedPrivateFile,
    type OpenedPrivateJson,
    type OwnedPrivateFile,
} from './repository_private_file.js';
import {
    assertLeasePathSeparated,
    canonicalLeaseScope,
    openMatchingLeaseLock,
    readAuthorizedReceipt,
    readVerifiedReceiptAgain,
    repositoryLeaseLockPath,
    repositoryLeaseLockPathFromCommon,
    verifyLeaseSource,
    verifyRepositoryLease,
    type LeaseAuthorizationInput,
} from './repository_lease_state.js';
import { assertGovernedPaths, attestSource } from './source_attestation.js';

export {
    recoverRepositoryLeaseAcquisition,
    recoverRepositoryLeaseOperation,
} from './repository_lease_recovery.js';
export { verifyRepositoryLease } from './repository_lease_state.js';
export type {
    OwnedRepositoryLease,
    RepositoryLeaseAcquisitionOperationRecord,
    RepositoryLeaseRecord,
    RepositoryOperationRecord,
    RepositoryOperationRecovery,
} from './repository_lease_contract.js';

function attemptedReceiptState(
    file: string,
    record: RepositoryLeaseRecord,
): 'absent' | 'exact' | 'conflict' | 'ambiguous' {
    try {
        if (optionalStat(file) === undefined) return 'absent';
        repairInterruptedImmutableWrite(file);
        const expected = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
        const actual = readRegularFileNoFollow(file, 'repository source lease receipt');
        return actual.equals(expected) ? 'exact' : 'conflict';
    } catch {
        return 'ambiguous';
    }
}

export function acquireRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
}): OwnedRepositoryLease {
    assertRunId(input.runId);
    const leaseOwner = currentOperationOwner();
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);
    const controlTarget = validateDirectoryCreationTarget(input.controlRoot, 'control root');
    assertLeasePathSeparated(controlTarget, repoRoot, commonDirectory, 'control root');
    const receiptTarget = path.join(controlTarget, 'council-autoresearch', input.runId);
    assertLeasePathSeparated(receiptTarget, repoRoot, commonDirectory, 'receipt directory');
    const sourceReceiptTarget = path.join(receiptTarget, '00-source-lease.json');

    const resumeToken = randomBytes(32).toString('hex');
    const leaseId = randomUUID();
    const operation: RepositoryLeaseAcquisitionOperationRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: 'lease-acquisition',
        operation_id: randomUUID(),
        lease_id: leaseId,
        run_id: input.runId,
        resume_token_sha256: sha256(resumeToken),
        owner: leaseOwner,
        acquired_at: new Date().toISOString(),
        repository_root: repoRoot,
        git_common_directory: commonDirectory,
        control_root: controlTarget,
        governed_paths_sha256: governedPathsSha256(governedPaths),
    };
    const paths = repositoryOperationPaths(repoRoot);
    const sourceLockPath = repositoryLeaseLockPathFromCommon(commonDirectory);
    const sourceTemporary = atomicPrivateTemporaryPath(
        sourceLockPath,
        operation.owner.pid,
        operation.operation_id,
    );
    if (optionalStat(sourceLockPath) !== undefined) {
        fail('repository source lease already exists');
    }
    if (optionalStat(sourceReceiptTarget) !== undefined) {
        fail('repository source lease receipt already exists');
    }
    assertNoRecoverySidecars(paths);

    let guard: OwnedOperationGuard | undefined;
    let sourceLock: OwnedPrivateFile | undefined;
    let sourcePublicationStarted = false;
    let attemptedRecord: RepositoryLeaseRecord | undefined;
    let receiptWriteStarted = false;
    let receiptCommitted = false;
    let preserveAfterFailure = false;
    let sourceReceipt: string | undefined;
    try {
        guard = createOwnedOperationGuard(paths, operation);
        assertNoRecoverySidecars(paths);
        if (optionalStat(sourceLockPath) !== undefined) {
            fail('repository source lease already exists');
        }

        const controlRoot = canonicalPrivateDirectory(controlTarget, 'control root', true);
        assertLeasePathSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
        const receiptDirectory = ensureDirectoryNoFollow(receiptTarget);
        assertLeasePathSeparated(receiptDirectory, repoRoot, commonDirectory, 'receipt directory');
        sourceReceipt = path.join(receiptDirectory, '00-source-lease.json');
        if (optionalStat(sourceReceipt) !== undefined) {
            fail('repository source lease receipt already exists');
        }
        const attestation = attestSource(repoRoot, governedPaths, 'source');
        const record: RepositoryLeaseRecord = {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            lease_id: leaseId,
            run_id: input.runId,
            repository_root: repoRoot,
            git_common_directory: commonDirectory,
            control_root: controlRoot,
            source_head: attestation.head,
            governed_paths: governedPaths,
            source_manifest: attestation.manifest,
            resume_token_sha256: sha256(resumeToken),
            owner: { pid: leaseOwner.pid, hostname: leaseOwner.hostname },
            acquired_at: new Date().toISOString(),
        };
        attemptedRecord = record;
        sourcePublicationStarted = true;
        sourceLock = createAtomicPrivateFile({
            file: sourceLockPath,
            temporary: sourceTemporary,
            commonDirectory,
            content: Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
            label: 'repository source lease',
        });
        const staged = openMatchingLeaseLock(record, {
            repoRoot,
            commonDirectory,
            controlRoot,
            runId: input.runId,
        });
        closeOwnedPrivateFile(staged, 'repository source lease');

        receiptWriteStarted = true;
        writeImmutableJson(sourceReceipt, record);
        receiptCommitted = true;
        const verified = verifyRepositoryLease({
            repoRoot,
            controlRoot,
            runId: input.runId,
            resumeToken,
        });
        if (JSON.stringify(verified) !== JSON.stringify(record)) {
            fail('repository lease changed before acquisition completed');
        }
        assertNoRecoverySidecars(paths);
        assertOwnedPrivateFile(sourceLock, 'repository source lease');

        const heldLock = sourceLock;
        sourceLock = undefined;
        closeOwnedPrivateFile(heldLock, 'repository source lease');
        const heldGuard = guard;
        guard = undefined;
        releaseOwnedOperationGuard(heldGuard);
        return { record, lock_file: sourceLockPath, resume_token: resumeToken };
    } catch (error) {
        let cleanupError: unknown;
        preserveAfterFailure ||= privateFileDurabilityUncertain(error);
        if (!receiptCommitted && receiptWriteStarted && attemptedRecord !== undefined
            && sourceReceipt !== undefined) {
            const state = attemptedReceiptState(sourceReceipt, attemptedRecord);
            receiptCommitted = state === 'exact';
            preserveAfterFailure ||= state === 'ambiguous';
        }
        if (sourcePublicationStarted && sourceLock === undefined) {
            const state = atomicPrivateFileState(
                sourceLockPath,
                sourceTemporary,
                'repository source lease',
            );
            if (state !== 'absent') {
                preserveAfterFailure = true;
            }
        }
        if (sourceLock !== undefined) {
            const held = sourceLock;
            sourceLock = undefined;
            try {
                if (receiptCommitted || preserveAfterFailure) {
                    closeOwnedPrivateFile(held, 'repository source lease');
                }
                else unlinkOwnedPrivateFile(held, 'repository source lease');
            } catch (caught) {
                cleanupError = caught;
            }
        }
        if (guard !== undefined) {
            const held = guard;
            guard = undefined;
            try {
                if (receiptCommitted || preserveAfterFailure || cleanupError !== undefined) {
                    abandonOwnedOperationGuard(held);
                }
                else releaseOwnedOperationGuard(held);
            } catch (caught) {
                cleanupError ??= caught;
            }
        }
        if (cleanupError !== undefined) {
            fail(`repository lease acquisition cleanup was unsafe: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`);
        }
        throw error;
    }
}

function operationRecord(
    kind: Exclude<RepositoryOperationKind, 'lease-acquisition'>,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): RepositoryOperationRecord {
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: kind,
        operation_id: randomUUID(),
        lease_id: lease.lease_id,
        run_id: lease.run_id,
        resume_token_sha256: sha256(resumeToken),
        owner: currentOperationOwner(),
        acquired_at: new Date().toISOString(),
    };
}

export function withRepositoryLeaseOperation<T>(
    input: LeaseAuthorizationInput,
    operation: (record: RepositoryLeaseRecord) => T,
): T {
    const authorized = readAuthorizedReceipt(input).record;
    const paths = repositoryOperationPaths(authorized.repository_root);
    assertNoRecoverySidecars(paths);
    let guard: OwnedOperationGuard | undefined = createOwnedOperationGuard(
        paths,
        operationRecord('lease-command', authorized, input.resumeToken),
    );
    let effectStarted = false;
    try {
        assertNoRecoverySidecars(paths);
        const before = verifyRepositoryLease(input);
        effectStarted = true;
        let result: T | undefined;
        let operationError: unknown;
        let unsafeThenable = false;
        try {
            result = operation(before);
            unsafeThenable = result !== null && typeof result === 'object'
                && typeof (result as { then?: unknown }).then === 'function';
        } catch (error) {
            operationError = error;
        }
        if (unsafeThenable) fail('repository lease operations must be synchronous');
        const after = verifyRepositoryLease(input);
        if (after.lease_id !== before.lease_id) {
            fail('repository lease changed during the operation');
        }
        assertNoRecoverySidecars(paths);
        const held = guard;
        guard = undefined;
        releaseOwnedOperationGuard(held);
        if (operationError !== undefined) throw operationError;
        return result as T;
    } catch (error) {
        if (guard !== undefined) {
            const held = guard;
            guard = undefined;
            if (effectStarted) abandonOwnedOperationGuard(held);
            else releaseOwnedOperationGuard(held);
        }
        throw error;
    }
}

export function releaseRepositoryLease(input: LeaseAuthorizationInput): RepositoryLeaseRecord {
    const authorized = readAuthorizedReceipt(input).record;
    const paths = repositoryOperationPaths(authorized.repository_root);
    assertNoRecoverySidecars(paths);
    let guard: OwnedOperationGuard | undefined = createOwnedOperationGuard(
        paths,
        operationRecord('lease-release', authorized, input.resumeToken),
    );
    let opened: OpenedPrivateJson<RepositoryLeaseRecord> | undefined;
    let effectStarted = false;
    try {
        assertNoRecoverySidecars(paths);
        const record = verifyRepositoryLease(input);
        opened = openMatchingLeaseLock(record, canonicalLeaseScope(input));
        effectStarted = true;
        const heldLock = opened;
        opened = undefined;
        unlinkOwnedPrivateFile(heldLock, 'repository source lease');
        if (optionalStat(repositoryLeaseLockPath(record.repository_root)) !== undefined) {
            fail('repository source lease survived release');
        }
        verifyLeaseSource(record);
        readVerifiedReceiptAgain(input, record);
        assertNoRecoverySidecars(paths);
        const heldGuard = guard;
        guard = undefined;
        releaseOwnedOperationGuard(heldGuard);
        return record;
    } catch (error) {
        if (opened !== undefined) {
            const held = opened;
            opened = undefined;
            closeOwnedPrivateFile(held, 'repository source lease');
        }
        if (guard !== undefined) {
            const held = guard;
            guard = undefined;
            if (effectStarted) abandonOwnedOperationGuard(held);
            else releaseOwnedOperationGuard(held);
        }
        throw error;
    }
}
