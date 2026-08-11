import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    MAX_JSON_FILE_BYTES,
    assertRunId,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    sha256,
    validateDirectoryCreationTarget,
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
    assertResumeToken,
    governedPathsSha256,
    repositoryLeaseIntentFromRecord,
    type OwnedRepositoryLease,
    type RepositoryLeaseAcquisitionOperationRecord,
    type RepositoryLeaseIntent,
    type RepositoryLeaseRecord,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    atomicPrivateTemporaryPath,
    closeOwnedPrivateFile,
    createAtomicPrivateFile,
    openPrivateJson,
    optionalStat,
    privateFileDurabilityUncertain,
    type OpenedPrivateJson,
} from './repository_private_file.js';
import {
    receiptSealPath,
    sealReceipt,
    verifyReceiptSeal,
    writePrivateReceiptJson,
} from './receipt_seal.js';
import {
    assertLeaseIntent,
    assertLeasePathSeparated,
    assertLeaseRecord,
    repositoryLeaseLockPathFromCommon,
    verifyLeaseSource,
    verifyRepositoryLease,
    type CanonicalLeaseScope,
} from './repository_lease_state.js';
import { assertGovernedPaths, attestSource } from './source_attestation.js';

function sameIntent(left: RepositoryLeaseIntent, right: RepositoryLeaseIntent): boolean {
    return canonicalJson(left) === canonicalJson(right);
}

function openRequestedIntent(
    file: string,
    scope: CanonicalLeaseScope,
    tokenSha256: string,
    governedPaths: readonly string[],
): OpenedPrivateJson<RepositoryLeaseIntent> | undefined {
    if (optionalStat(file) === undefined) return undefined;
    const opened = openPrivateJson<RepositoryLeaseIntent>(
        file,
        scope.commonDirectory,
        'repository source lease intent',
        MAX_JSON_FILE_BYTES,
    );
    try {
        assertLeaseIntent(opened.record, scope, tokenSha256);
        if (canonicalJson(opened.record.governed_paths) !== canonicalJson(governedPaths)) {
            fail('repository source lease intent governed paths do not match the request');
        }
        return opened;
    } catch (error) {
        closeOwnedPrivateFile(opened, 'repository source lease intent');
        throw error;
    }
}

function readExistingReceipt(
    file: string,
    intent: RepositoryLeaseIntent,
    scope: CanonicalLeaseScope,
): { record: RepositoryLeaseRecord; sealed: boolean } | undefined {
    const sealFile = receiptSealPath(file);
    if (optionalStat(file) === undefined) {
        if (optionalStat(sealFile) !== undefined) fail('repository source lease seal exists without its body');
        return undefined;
    }
    const opened = openPrivateJson<RepositoryLeaseRecord>(
        file,
        path.dirname(file),
        'repository source lease receipt',
        MAX_JSON_FILE_BYTES,
    );
    try {
        assertLeaseRecord(opened.record, scope, intent.resume_token_sha256);
        if (!sameIntent(repositoryLeaseIntentFromRecord(opened.record), intent)) {
            fail('repository source lease receipt does not match its intent');
        }
        const sealed = optionalStat(sealFile) !== undefined;
        if (sealed) verifyReceiptSeal(file, opened.record);
        assertOwnedPrivateFile(opened, 'repository source lease receipt');
        return { record: opened.record, sealed };
    } finally {
        closeOwnedPrivateFile(opened, 'repository source lease receipt');
    }
}

export function acquireRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    resumeToken: string;
}): OwnedRepositoryLease {
    assertRunId(input.runId);
    assertResumeToken(input.resumeToken);
    const operationOwner = currentOperationOwner();
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);
    const controlTarget = validateDirectoryCreationTarget(input.controlRoot, 'control root');
    assertLeasePathSeparated(controlTarget, repoRoot, commonDirectory, 'control root');
    if (optionalStat(controlTarget) !== undefined
        && canonicalPrivateDirectory(controlTarget, 'control root') !== controlTarget) {
        fail('control root changed before repository lease acquisition');
    }
    const receiptTarget = path.join(controlTarget, 'council-autoresearch', input.runId);
    assertLeasePathSeparated(receiptTarget, repoRoot, commonDirectory, 'receipt directory');
    const sourceReceiptTarget = path.join(receiptTarget, '00-source-lease.json');
    const sourceSealTarget = receiptSealPath(sourceReceiptTarget);
    const sourceLockPath = repositoryLeaseLockPathFromCommon(commonDirectory);
    const tokenSha256 = sha256(input.resumeToken);
    const scope: CanonicalLeaseScope = {
        repoRoot,
        commonDirectory,
        controlRoot: controlTarget,
        runId: input.runId,
    };
    const preexisting = openRequestedIntent(sourceLockPath, scope, tokenSha256, governedPaths);
    let intent: RepositoryLeaseIntent;
    if (preexisting === undefined) {
        if (optionalStat(sourceReceiptTarget) !== undefined
            || optionalStat(sourceSealTarget) !== undefined) {
            fail('repository source lease evidence exists without its intent');
        }
        intent = {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            lease_id: randomUUID(),
            run_id: input.runId,
            repository_root: repoRoot,
            git_common_directory: commonDirectory,
            control_root: controlTarget,
            governed_paths: governedPaths,
            resume_token_sha256: tokenSha256,
            owner: { pid: operationOwner.pid, hostname: operationOwner.hostname },
            acquired_at: new Date().toISOString(),
        };
    } else {
        intent = preexisting.record;
        closeOwnedPrivateFile(preexisting, 'repository source lease intent');
    }
    const operation: RepositoryLeaseAcquisitionOperationRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: 'lease-acquisition',
        operation_id: randomUUID(),
        lease_id: intent.lease_id,
        run_id: input.runId,
        resume_token_sha256: tokenSha256,
        owner: operationOwner,
        acquired_at: new Date().toISOString(),
        repository_root: repoRoot,
        git_common_directory: commonDirectory,
        control_root: controlTarget,
        governed_paths_sha256: governedPathsSha256(governedPaths),
        lease_intent_sha256: sha256(canonicalJson(intent)),
    };
    const paths = repositoryOperationPaths(repoRoot);
    assertNoRecoverySidecars(paths);

    let guard: OwnedOperationGuard | undefined;
    let heldIntent: OpenedPrivateJson<RepositoryLeaseIntent> | undefined;
    let effectStarted = false;
    try {
        guard = createOwnedOperationGuard(paths, operation);
        assertNoRecoverySidecars(paths);
        if (optionalStat(controlTarget) === undefined) effectStarted = true;
        const controlRoot = canonicalPrivateDirectory(controlTarget, 'control root', true);
        if (controlRoot !== intent.control_root) fail('repository lease control root changed');
        if (optionalStat(receiptTarget) === undefined) effectStarted = true;
        const receiptDirectory = canonicalPrivateDirectory(
            receiptTarget,
            'receipt directory',
            true,
        );
        assertLeasePathSeparated(receiptDirectory, repoRoot, commonDirectory, 'receipt directory');
        const sourceReceipt = path.join(receiptDirectory, '00-source-lease.json');

        heldIntent = openRequestedIntent(sourceLockPath, scope, tokenSha256, governedPaths);
        if (heldIntent === undefined) {
            if (preexisting !== undefined) fail('repository source lease intent disappeared');
            if (optionalStat(sourceReceipt) !== undefined
                || optionalStat(receiptSealPath(sourceReceipt)) !== undefined) {
                fail('repository source lease evidence exists without its intent');
            }
            effectStarted = true;
            const published = createAtomicPrivateFile({
                file: sourceLockPath,
                temporary: atomicPrivateTemporaryPath(
                    sourceLockPath,
                    operation.owner.pid,
                    operation.operation_id,
                ),
                commonDirectory,
                content: Buffer.from(`${JSON.stringify(intent, null, 2)}\n`),
                label: 'repository source lease intent',
            });
            closeOwnedPrivateFile(published, 'repository source lease intent');
            heldIntent = openRequestedIntent(sourceLockPath, scope, tokenSha256, governedPaths);
            if (heldIntent === undefined) fail('repository source lease intent was not published');
        }
        if (!sameIntent(heldIntent.record, intent)
            || sha256(canonicalJson(heldIntent.record)) !== operation.lease_intent_sha256) {
            fail('repository source lease intent changed before acquisition');
        }

        let existing = readExistingReceipt(sourceReceipt, intent, scope);
        let record: RepositoryLeaseRecord;
        let created = false;
        if (existing === undefined) {
            const attestation = attestSource(repoRoot, governedPaths, 'source');
            record = {
                ...intent,
                source_head: attestation.head,
                source_manifest: attestation.manifest,
            };
            effectStarted = true;
            created = writePrivateReceiptJson(sourceReceipt, record, {
                ownerPid: operation.owner.pid,
                operationId: operation.operation_id,
            }).created;
            existing = { record, sealed: false };
        } else {
            record = existing.record;
        }
        verifyLeaseSource(record);
        if (!existing.sealed) {
            effectStarted = true;
            sealReceipt(sourceReceipt, record, {
                ownerPid: operation.owner.pid,
                operationId: operation.operation_id,
            });
        }
        const verified = verifyRepositoryLease({
            repoRoot,
            controlRoot,
            runId: input.runId,
            resumeToken: input.resumeToken,
        });
        if (canonicalJson(verified) !== canonicalJson(record)) {
            fail('repository lease changed before acquisition completed');
        }
        assertNoRecoverySidecars(paths);
        assertOwnedPrivateFile(heldIntent, 'repository source lease intent');
        const held = heldIntent;
        heldIntent = undefined;
        closeOwnedPrivateFile(held, 'repository source lease intent');
        const ownedGuard = guard;
        guard = undefined;
        releaseOwnedOperationGuard(ownedGuard);
        return { record, lock_file: sourceLockPath, created };
    } catch (error) {
        let cleanupError: unknown;
        effectStarted ||= privateFileDurabilityUncertain(error);
        if (heldIntent !== undefined) {
            const held = heldIntent;
            heldIntent = undefined;
            try {
                closeOwnedPrivateFile(held, 'repository source lease intent');
            } catch (caught) {
                cleanupError = caught;
                effectStarted = true;
            }
        }
        if (guard !== undefined) {
            const ownedGuard = guard;
            guard = undefined;
            try {
                if (effectStarted || cleanupError !== undefined) {
                    abandonOwnedOperationGuard(ownedGuard);
                } else {
                    releaseOwnedOperationGuard(ownedGuard);
                }
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
