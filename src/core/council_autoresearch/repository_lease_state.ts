import path from 'node:path';

import {
    MAX_JSON_FILE_BYTES,
    assertRunId,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    sha256,
} from './contracts.js';
import { gitCommonDirectory, repositoryRoot } from './git_trust.js';
import {
    assertResumeToken,
    repositoryLeaseIntentFromRecord,
    validateRepositoryLeaseIntent,
    verifyRepositoryLeaseRecordStructure,
    type RepositoryLeaseIntent,
    type RepositoryLeaseRecord,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    closeOwnedPrivateFile,
    openPrivateJson,
    type OpenedPrivateJson,
} from './repository_private_file.js';
import { verifyReceiptSeal } from './receipt_seal.js';
import { attestSource } from './source_attestation.js';

export interface LeaseAuthorizationInput {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
}

export interface CanonicalLeaseScope {
    repoRoot: string;
    commonDirectory: string;
    controlRoot: string;
    runId: string;
}

export function repositoryLeaseLockPathFromCommon(commonDirectory: string): string {
    return path.join(commonDirectory, 'cstar-council-autoresearch.lock');
}

export function repositoryLeaseLockPath(repoRoot: string): string {
    return repositoryLeaseLockPathFromCommon(gitCommonDirectory(repoRoot));
}

export function repositoryLeaseReceiptFile(scope: CanonicalLeaseScope): string {
    return path.join(
        scope.controlRoot,
        'council-autoresearch',
        scope.runId,
        '00-source-lease.json',
    );
}

function overlaps(left: string, right: string): boolean {
    return left === right
        || left.startsWith(`${right}${path.sep}`)
        || right.startsWith(`${left}${path.sep}`);
}

export function assertLeasePathSeparated(
    candidate: string,
    repoRoot: string,
    commonDirectory: string,
    label: string,
): void {
    if (overlaps(candidate, repoRoot) || overlaps(candidate, commonDirectory)) {
        fail(`${label} must not contain or be contained by the governed repository`);
    }
}

export function canonicalLeaseScope(
    input: Omit<LeaseAuthorizationInput, 'resumeToken'>,
): CanonicalLeaseScope {
    assertRunId(input.runId);
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const controlRoot = canonicalPrivateDirectory(input.controlRoot, 'control root');
    assertLeasePathSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
    return { repoRoot, commonDirectory, controlRoot, runId: input.runId };
}

export function assertLeaseIntent(
    intent: RepositoryLeaseIntent,
    scope: CanonicalLeaseScope,
    expectedTokenSha256: string,
): void {
    validateRepositoryLeaseIntent(intent);
    if (intent.run_id !== scope.runId
        || intent.repository_root !== scope.repoRoot
        || intent.git_common_directory !== scope.commonDirectory
        || intent.control_root !== scope.controlRoot) {
        fail('repository lease identity mismatch');
    }
    if (intent.resume_token_sha256 !== expectedTokenSha256) {
        fail('repository lease resume token mismatch');
    }
}

export function assertLeaseRecord(
    record: RepositoryLeaseRecord,
    scope: CanonicalLeaseScope,
    expectedTokenSha256: string,
): void {
    verifyRepositoryLeaseRecordStructure(record);
    assertLeaseIntent(repositoryLeaseIntentFromRecord(record), scope, expectedTokenSha256);
}

function openLeaseIntent(
    scope: CanonicalLeaseScope,
    expectedTokenSha256: string,
): OpenedPrivateJson<RepositoryLeaseIntent> {
    const opened = openPrivateJson<RepositoryLeaseIntent>(
        repositoryLeaseLockPathFromCommon(scope.commonDirectory),
        scope.commonDirectory,
        'repository source lease intent',
        MAX_JSON_FILE_BYTES,
    );
    try {
        assertLeaseIntent(opened.record, scope, expectedTokenSha256);
        return opened;
    } catch (error) {
        closeOwnedPrivateFile(opened, 'repository source lease intent');
        throw error;
    }
}

function openSealedLeaseReceipt(
    scope: CanonicalLeaseScope,
    expectedTokenSha256: string,
): OpenedPrivateJson<RepositoryLeaseRecord> {
    const file = repositoryLeaseReceiptFile(scope);
    const opened = openPrivateJson<RepositoryLeaseRecord>(
        file,
        path.dirname(file),
        'repository source lease receipt',
        MAX_JSON_FILE_BYTES,
    );
    try {
        assertLeaseRecord(opened.record, scope, expectedTokenSha256);
        verifyReceiptSeal(file, opened.record);
        assertOwnedPrivateFile(opened, 'repository source lease receipt');
        return opened;
    } catch (error) {
        closeOwnedPrivateFile(opened, 'repository source lease receipt');
        throw error;
    }
}

function authorizedScope(input: LeaseAuthorizationInput): {
    scope: CanonicalLeaseScope;
    tokenSha256: string;
} {
    assertResumeToken(input.resumeToken);
    return { scope: canonicalLeaseScope(input), tokenSha256: sha256(input.resumeToken) };
}

export function readAuthorizedIntent(
    input: LeaseAuthorizationInput,
): { intent: RepositoryLeaseIntent; scope: CanonicalLeaseScope } {
    const { scope, tokenSha256 } = authorizedScope(input);
    const opened = openLeaseIntent(scope, tokenSha256);
    try {
        return { intent: opened.record, scope };
    } finally {
        closeOwnedPrivateFile(opened, 'repository source lease intent');
    }
}

export function readAuthorizedReceipt(
    input: LeaseAuthorizationInput,
): { record: RepositoryLeaseRecord; scope: CanonicalLeaseScope } {
    const { scope, tokenSha256 } = authorizedScope(input);
    const opened = openSealedLeaseReceipt(scope, tokenSha256);
    try {
        return { record: opened.record, scope };
    } finally {
        closeOwnedPrivateFile(opened, 'repository source lease receipt');
    }
}

export function verifyLeaseSource(record: RepositoryLeaseRecord): void {
    const attestation = attestSource(
        record.repository_root,
        record.governed_paths,
        record.source_manifest.root_label,
    );
    if (record.source_head !== attestation.head
        || canonicalJson(record.source_manifest) !== canonicalJson(attestation.manifest)) {
        fail('repository source attestation changed while leased');
    }
}

export function openMatchingLeaseLock(
    record: RepositoryLeaseRecord,
    scope: CanonicalLeaseScope,
): OpenedPrivateJson<RepositoryLeaseIntent> {
    const opened = openLeaseIntent(scope, record.resume_token_sha256);
    try {
        if (canonicalJson(opened.record)
            !== canonicalJson(repositoryLeaseIntentFromRecord(record))) {
            fail('repository lease receipt does not match the active intent');
        }
        return opened;
    } catch (error) {
        closeOwnedPrivateFile(opened, 'repository source lease intent');
        throw error;
    }
}

export function readVerifiedReceiptAgain(
    input: LeaseAuthorizationInput,
    expected: RepositoryLeaseRecord,
): void {
    const { scope, tokenSha256 } = authorizedScope(input);
    const repeated = openSealedLeaseReceipt(scope, tokenSha256);
    try {
        if (canonicalJson(repeated.record) !== canonicalJson(expected)) {
            fail('repository lease receipt changed during the operation');
        }
    } finally {
        closeOwnedPrivateFile(repeated, 'repository source lease receipt');
    }
}

export function verifySelfBoundLeaseIntent(
    intent: RepositoryLeaseIntent,
): RepositoryLeaseRecord {
    validateRepositoryLeaseIntent(intent, 'foreign repository source lease intent');
    const scope = canonicalLeaseScope({
        repoRoot: intent.repository_root,
        controlRoot: intent.control_root,
        runId: intent.run_id,
    });
    assertLeaseIntent(intent, scope, intent.resume_token_sha256);
    const receipt = openSealedLeaseReceipt(scope, intent.resume_token_sha256);
    try {
        if (canonicalJson(repositoryLeaseIntentFromRecord(receipt.record))
            !== canonicalJson(intent)) {
            fail('foreign repository source lease receipt does not match its intent');
        }
        verifyLeaseSource(receipt.record);
        verifyReceiptSeal(repositoryLeaseReceiptFile(scope), receipt.record);
        assertOwnedPrivateFile(receipt, 'repository source lease receipt');
        return receipt.record;
    } finally {
        closeOwnedPrivateFile(receipt, 'repository source lease receipt');
    }
}

export function verifyRepositoryLease(input: LeaseAuthorizationInput): RepositoryLeaseRecord {
    const { scope, tokenSha256 } = authorizedScope(input);
    const receipt = openSealedLeaseReceipt(scope, tokenSha256);
    let intent: OpenedPrivateJson<RepositoryLeaseIntent> | undefined;
    try {
        intent = openMatchingLeaseLock(receipt.record, scope);
        verifyLeaseSource(receipt.record);
        verifyReceiptSeal(repositoryLeaseReceiptFile(scope), receipt.record);
        assertOwnedPrivateFile(receipt, 'repository source lease receipt');
        assertOwnedPrivateFile(intent, 'repository source lease intent');
        return receipt.record;
    } finally {
        try {
            if (intent !== undefined) {
                closeOwnedPrivateFile(intent, 'repository source lease intent');
            }
        } finally {
            closeOwnedPrivateFile(receipt, 'repository source lease receipt');
        }
    }
}
