import { randomUUID } from 'node:crypto';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    fail,
    sha256,
} from './contracts.js';
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
    type RepositoryLeaseRecord,
    type RepositoryOperationKind,
    type RepositoryOperationRecord,
} from './repository_lease_contract.js';
import {
    closeOwnedPrivateFile,
    optionalStat,
    unlinkOwnedPrivateFile,
    type OpenedPrivateJson,
} from './repository_private_file.js';
import {
    canonicalLeaseScope,
    openMatchingLeaseLock,
    readAuthorizedReceipt,
    readVerifiedReceiptAgain,
    repositoryLeaseLockPath,
    verifyLeaseSource,
    verifyRepositoryLease,
    type LeaseAuthorizationInput,
} from './repository_lease_state.js';

export { acquireRepositoryLease } from './repository_lease_acquisition.js';
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
