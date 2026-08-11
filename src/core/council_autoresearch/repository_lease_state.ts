import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    MAX_JSON_FILE_BYTES,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    readJson,
    sha256,
} from './contracts.js';
import { gitCommonDirectory, repositoryRoot } from './git_trust.js';
import {
    UUID_V4_PATTERN,
    type RepositoryLeaseRecord,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    closeOwnedPrivateFile,
    openPrivateJson,
    type OpenedPrivateJson,
} from './repository_private_file.js';
import { assertGovernedPaths, attestSource } from './source_attestation.js';

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

export function assertLeaseRecord(
    record: RepositoryLeaseRecord,
    scope: CanonicalLeaseScope,
    expectedTokenSha256: string,
): void {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'lease_id', 'run_id', 'repository_root',
        'git_common_directory', 'control_root', 'source_head', 'governed_paths',
        'source_manifest', 'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository lease');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !UUID_V4_PATTERN.test(record.lease_id)
        || record.run_id !== scope.runId
        || record.repository_root !== scope.repoRoot
        || record.git_common_directory !== scope.commonDirectory
        || record.control_root !== scope.controlRoot
        || !/^[a-f0-9]{40}$/.test(record.source_head)
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.acquired_at)) {
        fail('repository lease identity mismatch');
    }
    assertRunId(record.run_id);
    assertSha256(record.resume_token_sha256, 'repository lease resume token hash');
    if (record.resume_token_sha256 !== expectedTokenSha256) {
        fail('repository lease resume token mismatch');
    }
    if (!Array.isArray(record.governed_paths) || record.governed_paths.length < 1
        || new Set(record.governed_paths).size !== record.governed_paths.length
        || canonicalJson(record.governed_paths)
            !== canonicalJson([...record.governed_paths].sort())) {
        fail('repository lease governed paths are invalid');
    }
    assertGovernedPaths(record.governed_paths);
    assertExactObjectKeys(record.owner, ['pid', 'hostname'], 'repository lease owner');
    if (!Number.isSafeInteger(record.owner.pid) || record.owner.pid < 1
        || typeof record.owner.hostname !== 'string' || record.owner.hostname.length < 1
        || record.owner.hostname.length > 255 || /[\r\n\0]/.test(record.owner.hostname)) {
        fail('repository lease owner is invalid');
    }
}

export function readAuthorizedReceipt(
    input: LeaseAuthorizationInput,
): { record: RepositoryLeaseRecord; scope: CanonicalLeaseScope } {
    const scope = canonicalLeaseScope(input);
    const record = readJson<RepositoryLeaseRecord>(repositoryLeaseReceiptFile(scope));
    assertLeaseRecord(record, scope, sha256(input.resumeToken));
    return { record, scope };
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
): OpenedPrivateJson<RepositoryLeaseRecord> {
    const opened = openPrivateJson<RepositoryLeaseRecord>(
        repositoryLeaseLockPathFromCommon(scope.commonDirectory),
        scope.commonDirectory,
        'repository source lease',
        MAX_JSON_FILE_BYTES,
    );
    try {
        assertLeaseRecord(opened.record, scope, record.resume_token_sha256);
        if (JSON.stringify(opened.record) !== JSON.stringify(record)) {
            fail('repository lease receipt does not match the active lock');
        }
        return opened;
    } catch (error) {
        closeOwnedPrivateFile(opened, 'repository source lease');
        throw error;
    }
}

export function readVerifiedReceiptAgain(
    input: LeaseAuthorizationInput,
    expected: RepositoryLeaseRecord,
): void {
    const repeated = readAuthorizedReceipt(input).record;
    if (JSON.stringify(repeated) !== JSON.stringify(expected)) {
        fail('repository lease receipt changed during the operation');
    }
}

export function verifySelfBoundLeaseRecord(record: RepositoryLeaseRecord): void {
    if (typeof record.repository_root !== 'string'
        || typeof record.control_root !== 'string'
        || typeof record.run_id !== 'string'
        || typeof record.resume_token_sha256 !== 'string') {
        fail('foreign repository source lease identity is malformed');
    }
    const scope = canonicalLeaseScope({
        repoRoot: record.repository_root,
        controlRoot: record.control_root,
        runId: record.run_id,
    });
    assertLeaseRecord(record, scope, record.resume_token_sha256);
    const receipt = readJson<RepositoryLeaseRecord>(repositoryLeaseReceiptFile(scope));
    assertLeaseRecord(receipt, scope, record.resume_token_sha256);
    if (JSON.stringify(receipt) !== JSON.stringify(record)) {
        fail('foreign repository source lease receipt does not match its lock');
    }
    verifyLeaseSource(record);
}

export function verifyRepositoryLease(input: LeaseAuthorizationInput): RepositoryLeaseRecord {
    const { record, scope } = readAuthorizedReceipt(input);
    const opened = openMatchingLeaseLock(record, scope);
    try {
        verifyLeaseSource(record);
        readVerifiedReceiptAgain(input, record);
        assertOwnedPrivateFile(opened, 'repository source lease');
        return record;
    } finally {
        closeOwnedPrivateFile(opened, 'repository source lease');
    }
}
