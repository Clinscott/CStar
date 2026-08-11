import { fail } from './contracts.js';
import { operationOwnerDefinitelyDead } from './operation_identity.js';
import {
    acquireRecoveryOwner,
    claimAndRemoveOperationGuard,
    releaseRecoveryOwner,
    repositoryOperationPaths,
    selectRecoveryTarget,
} from './repository_operation_guard.js';
import {
    assertOperationBindsLease,
    operationRecoveryTarget,
    type RepositoryLeaseRecord,
    type RepositoryOperationRecord,
    type RepositoryOperationRecovery,
    type RepositoryOperationRecoveryOutcome,
} from './repository_lease_contract.js';
import { optionalStat } from './repository_private_file.js';
import {
    readAuthorizedReceipt,
    readVerifiedReceiptAgain,
    repositoryLeaseLockPath,
    verifyLeaseSource,
    verifyRepositoryLease,
    type LeaseAuthorizationInput,
} from './repository_lease_state.js';

export { recoverRepositoryLeaseAcquisition } from './repository_lease_acquisition_recovery.js';

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
