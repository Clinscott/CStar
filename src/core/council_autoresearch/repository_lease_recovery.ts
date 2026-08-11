import fs from 'node:fs';
import path from 'node:path';

import {
    MAX_JSON_FILE_BYTES,
    assertRunId,
    canonicalJson,
    fail,
    validateDirectoryCreationTarget,
} from './contracts.js';
import { gitCommonDirectory, repositoryRoot } from './git_trust.js';
import {
    currentOperationOwner,
    operationOwnerDefinitelyDead,
} from './operation_identity.js';
import {
    acquireRecoveryOwner,
    claimAndRemoveOperationGuard,
    closeOwnedPrivateFile,
    openPrivateJson,
    optionalStat,
    releaseRecoveryOwner,
    repositoryOperationPaths,
    selectRecoveryTarget,
    unlinkOwnedPrivateFile,
} from './repository_operation_guard.js';
import {
    UUID_V4_PATTERN,
    assertAcquisitionBindsInput,
    assertOperationBindsLease,
    governedPathsSha256,
    operationRecoveryTarget,
    type RepositoryLeaseRecord,
    type RepositoryOperationRecord,
    type RepositoryOperationRecovery,
    type RepositoryOperationRecoveryOutcome,
    type RepositoryOperationRecoveryTarget,
} from './repository_lease_contract.js';
import {
    assertLeasePathSeparated,
    assertLeaseRecord,
    readAuthorizedReceipt,
    readVerifiedReceiptAgain,
    repositoryLeaseLockPath,
    repositoryLeaseLockPathFromCommon,
    verifySelfBoundLeaseRecord,
    verifyLeaseSource,
    verifyRepositoryLease,
    type LeaseAuthorizationInput,
} from './repository_lease_state.js';
import { assertGovernedPaths } from './source_attestation.js';

function classifyAuthorizedRecovery(
    input: LeaseAuthorizationInput,
    authorized: RepositoryLeaseRecord,
    operation: RepositoryOperationRecord,
): RepositoryOperationRecoveryOutcome {
    assertOperationBindsLease(
        operation,
        authorized,
        input.resumeToken,
        ['lease-acquisition', 'lease-command', 'lease-release'],
    );
    const exists = optionalStat(repositoryLeaseLockPath(authorized.repository_root)) !== undefined;
    if (operation.operation_kind === 'lease-release') {
        if (exists) {
            verifyRepositoryLease(input);
            return 'release-not-committed';
        }
        verifyLeaseSource(authorized);
        readVerifiedReceiptAgain(input, authorized);
        return 'release-committed';
    }
    verifyRepositoryLease(input);
    return operation.operation_kind === 'lease-acquisition'
        ? 'acquisition-active'
        : 'command-guard-removed';
}

export function recoverRepositoryLeaseOperation(
    input: LeaseAuthorizationInput,
): RepositoryOperationRecovery {
    const authorized = readAuthorizedReceipt(input).record;
    const paths = repositoryOperationPaths(authorized.repository_root);
    const selected = selectRecoveryTarget(paths);
    if (selected === undefined) return { recovered: false };
    const target = operationRecoveryTarget(selected);
    classifyAuthorizedRecovery(input, authorized, selected.record);
    if (!operationOwnerDefinitelyDead(selected.record.owner)) {
        fail('another repository operation is active');
    }
    const recoveryOwner = acquireRecoveryOwner(paths, target);
    try {
        let outcome = classifyAuthorizedRecovery(input, authorized, selected.record);
        const operation = claimAndRemoveOperationGuard(paths, target, (record) => {
            outcome = classifyAuthorizedRecovery(input, authorized, record);
        });
        return { recovered: true, outcome, operation };
    } finally {
        releaseRecoveryOwner(recoveryOwner);
    }
}

function acquisitionRecoveryScope(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    operationId: string;
}): {
    repoRoot: string;
    commonDirectory: string;
    controlRoot: string;
    governedPaths: string[];
} {
    assertRunId(input.runId);
    if (!UUID_V4_PATTERN.test(input.operationId)) {
        fail('repository lease acquisition recovery operation ID is invalid');
    }
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const controlRoot = validateDirectoryCreationTarget(input.controlRoot, 'control root');
    assertLeasePathSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);
    return { repoRoot, commonDirectory, controlRoot, governedPaths };
}

function assertDeadAcquisitionTarget(
    paths: ReturnType<typeof repositoryOperationPaths>,
    target: RepositoryOperationRecoveryTarget,
    input: Parameters<typeof assertAcquisitionBindsInput>[1],
): void {
    const current = selectRecoveryTarget(paths);
    if (current === undefined
        || canonicalJson(operationRecoveryTarget(current)) !== canonicalJson(target)) {
        fail('repository lease acquisition guard changed during recovery');
    }
    assertAcquisitionBindsInput(current.record, input);
    if (!operationOwnerDefinitelyDead(current.record.owner)) {
        fail('another repository operation is active');
    }
}

function assertUnchangedPrivateJson(
    file: string,
    commonDirectory: string,
    label: string,
    expected: { content: Buffer; stat: fs.BigIntStats },
): void {
    const opened = openPrivateJson<RepositoryLeaseRecord>(
        file,
        commonDirectory,
        label,
        MAX_JSON_FILE_BYTES,
    );
    try {
        if (!opened.content.equals(expected.content)) {
            fail(`${label} changed during acquisition recovery`);
        }
        for (const key of [
            'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
        ] as const) {
            if (opened.stat[key] !== expected.stat[key]) {
                fail(`${label} changed during acquisition recovery`);
            }
        }
    } finally {
        closeOwnedPrivateFile(opened, label);
    }
}

export function recoverRepositoryLeaseAcquisition(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    operationId: string;
}): RepositoryOperationRecovery {
    currentOperationOwner();
    const scope = acquisitionRecoveryScope(input);
    const paths = repositoryOperationPaths(scope.repoRoot);
    const selected = selectRecoveryTarget(paths);
    if (selected === undefined) return { recovered: false };
    assertAcquisitionBindsInput(selected.record, {
        operationId: input.operationId,
        runId: input.runId,
        repositoryRoot: scope.repoRoot,
        gitCommonDirectory: scope.commonDirectory,
        controlRoot: scope.controlRoot,
        governedPaths: scope.governedPaths,
    });
    if (!operationOwnerDefinitelyDead(selected.record.owner)) {
        fail('another repository operation is active');
    }
    const target = operationRecoveryTarget(selected);
    const recoveryOwner = acquireRecoveryOwner(paths, target);
    try {
        const boundInput = {
            operationId: input.operationId,
            runId: input.runId,
            repositoryRoot: scope.repoRoot,
            gitCommonDirectory: scope.commonDirectory,
            controlRoot: scope.controlRoot,
            governedPaths: scope.governedPaths,
        };
        assertDeadAcquisitionTarget(paths, target, boundInput);
        const runReceipt = path.join(
            scope.controlRoot,
            'council-autoresearch',
            input.runId,
            '00-source-lease.json',
        );
        let conflictingReceipt: { content: Buffer; stat: fs.BigIntStats } | undefined;
        if (optionalStat(runReceipt) !== undefined) {
            const opened = openPrivateJson<RepositoryLeaseRecord>(
                runReceipt,
                path.dirname(runReceipt),
                'repository source lease receipt',
                MAX_JSON_FILE_BYTES,
            );
            try {
                assertLeaseRecord(opened.record, {
                    repoRoot: scope.repoRoot,
                    commonDirectory: scope.commonDirectory,
                    controlRoot: scope.controlRoot,
                    runId: input.runId,
                }, opened.record.resume_token_sha256);
                verifyLeaseSource(opened.record);
                const bindsAcquisition = opened.record.lease_id === selected.record.lease_id
                    && opened.record.resume_token_sha256
                        === selected.record.resume_token_sha256
                    && governedPathsSha256(opened.record.governed_paths)
                        === selected.record.governed_paths_sha256;
                if (bindsAcquisition) {
                    fail('a receipted repository lease requires resume-token recovery');
                }
                conflictingReceipt = {
                    content: Buffer.from(opened.content),
                    stat: opened.stat,
                };
            } finally {
                closeOwnedPrivateFile(opened, 'repository source lease receipt');
            }
        }
        const sourceLockPath = repositoryLeaseLockPathFromCommon(scope.commonDirectory);
        let foreignLock: { content: Buffer; stat: fs.BigIntStats } | undefined;
        if (optionalStat(sourceLockPath) !== undefined) {
            const opened = openPrivateJson<RepositoryLeaseRecord>(
                sourceLockPath,
                scope.commonDirectory,
                'repository source lease',
                MAX_JSON_FILE_BYTES,
            );
            let remove = false;
            try {
                const matchesAcquisition = opened.record.lease_id === selected.record.lease_id
                    && opened.record.run_id === input.runId
                    && opened.record.repository_root === scope.repoRoot
                    && opened.record.git_common_directory === scope.commonDirectory
                    && opened.record.control_root === scope.controlRoot
                    && opened.record.resume_token_sha256 === selected.record.resume_token_sha256
                    && Array.isArray(opened.record.governed_paths)
                    && governedPathsSha256(opened.record.governed_paths)
                        === selected.record.governed_paths_sha256;
                if (matchesAcquisition) {
                    if (conflictingReceipt !== undefined) {
                        fail('partial repository lease conflicts with an existing receipt');
                    }
                    assertLeaseRecord(opened.record, {
                        repoRoot: scope.repoRoot,
                        commonDirectory: scope.commonDirectory,
                        controlRoot: scope.controlRoot,
                        runId: input.runId,
                    }, selected.record.resume_token_sha256);
                    verifyLeaseSource(opened.record);
                    assertDeadAcquisitionTarget(paths, target, boundInput);
                    if (optionalStat(runReceipt) !== undefined) {
                        fail('a receipted repository lease requires resume-token recovery');
                    }
                    remove = true;
                } else {
                    verifySelfBoundLeaseRecord(opened.record);
                    if (opened.record.git_common_directory !== scope.commonDirectory) {
                        fail('foreign repository source lease does not bind this lock path');
                    }
                    foreignLock = { content: Buffer.from(opened.content), stat: opened.stat };
                }
            } finally {
                if (remove) unlinkOwnedPrivateFile(opened, 'repository source lease');
                else closeOwnedPrivateFile(opened, 'repository source lease');
            }
        }
        const validate = (record: RepositoryOperationRecord): void => {
            assertAcquisitionBindsInput(record, boundInput);
            if (conflictingReceipt === undefined) {
                if (optionalStat(runReceipt) !== undefined) {
                    fail('repository lease acquisition recovery state changed');
                }
            } else {
                assertUnchangedPrivateJson(
                    runReceipt,
                    path.dirname(runReceipt),
                    'repository source lease receipt',
                    conflictingReceipt,
                );
            }
            if (foreignLock === undefined) {
                if (optionalStat(sourceLockPath) !== undefined) {
                    fail('repository lease acquisition recovery state changed');
                }
            } else {
                assertUnchangedPrivateJson(
                    sourceLockPath,
                    scope.commonDirectory,
                    'foreign repository source lease',
                    foreignLock,
                );
            }
        };
        const operation = claimAndRemoveOperationGuard(paths, target, validate);
        return { recovered: true, outcome: 'acquisition-not-committed', operation };
    } finally {
        releaseRecoveryOwner(recoveryOwner);
    }
}
