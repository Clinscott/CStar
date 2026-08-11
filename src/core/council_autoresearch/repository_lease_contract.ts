import path from 'node:path';

import {
    ArtifactManifest,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    fail,
} from './contracts.js';

export interface LeaseOwner {
    pid: number;
    hostname: string;
}

export interface RepositoryLeaseIntent {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    lease_id: string;
    run_id: string;
    repository_root: string;
    git_common_directory: string;
    control_root: string;
    governed_paths: string[];
    resume_token_sha256: string;
    owner: LeaseOwner;
    acquired_at: string;
}

export interface RepositoryLeaseRecord extends RepositoryLeaseIntent {
    source_head: string;
    source_manifest: ArtifactManifest;
}

export interface RepositoryOperationRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    operation_id: string;
    lease_id: string;
    run_id: string;
    receipt_name: string;
    resume_token_sha256: string;
    owner: LeaseOwner;
    acquired_at: string;
}

export type RepositoryLeaseDisposition = 'completed' | 'abandoned';

export interface RepositoryLeaseReleaseRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    lease_id: string;
    resume_token_sha256: string;
    disposition: RepositoryLeaseDisposition;
    terminal_state: 'RELEASED' | 'ABORTED';
}

export interface OwnedRepositoryLease {
    record: RepositoryLeaseRecord;
    lock_file: string;
    created: boolean;
}

export function assertGovernedPaths(governedPaths: string[]): void {
    if (governedPaths.length < 1 || governedPaths.length > 256) fail('one to 256 governed paths are required');
    for (const entry of governedPaths) {
        const segments = entry.split('/');
        if (!entry || path.isAbsolute(entry) || entry.includes('\0') || entry.includes('\\')
            || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
            fail(`governed source path is invalid: ${entry}`);
        }
    }
}

export function assertResumeToken(token: string): void {
    if (!/^[a-f0-9]{64}$/.test(token)) fail('resume token must be 32 random bytes encoded as lowercase hex');
}

export function assertLeaseOwner(owner: LeaseOwner, label: string): void {
    assertExactObjectKeys(owner, ['pid', 'hostname'], label);
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 1
        || typeof owner.hostname !== 'string' || owner.hostname.length < 1 || owner.hostname.length > 255) {
        fail(`${label} is invalid`);
    }
}

export const repositoryLeaseIntentKeys = [
    'schema_version', 'runner_version', 'lease_id', 'run_id', 'repository_root',
    'git_common_directory', 'control_root', 'governed_paths', 'resume_token_sha256',
    'owner', 'acquired_at',
] as const;

export function validateRepositoryLeaseIntent(
    intent: RepositoryLeaseIntent,
    label = 'repository lease intent',
): void {
    assertExactObjectKeys(intent, repositoryLeaseIntentKeys, label);
    if (intent.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || intent.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !/^[a-f0-9-]{36}$/.test(intent.lease_id)
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(intent.acquired_at)) {
        fail(`${label} identity is invalid`);
    }
    assertRunId(intent.run_id);
    assertSha256(intent.resume_token_sha256, `${label}.resume_token_sha256`);
    assertGovernedPaths(intent.governed_paths);
    if (new Set(intent.governed_paths).size !== intent.governed_paths.length
        || canonicalJson(intent.governed_paths) !== canonicalJson([...intent.governed_paths].sort())) {
        fail(`${label} governed paths are invalid`);
    }
    assertLeaseOwner(intent.owner, `${label}.owner`);
}

export function repositoryLeaseIntentFromRecord(record: RepositoryLeaseRecord): RepositoryLeaseIntent {
    return Object.fromEntries(
        repositoryLeaseIntentKeys.map((key) => [key, record[key]]),
    ) as unknown as RepositoryLeaseIntent;
}

export function verifyRepositoryLeaseRecordStructure(record: RepositoryLeaseRecord): void {
    assertExactObjectKeys(
        record,
        [...repositoryLeaseIntentKeys, 'source_head', 'source_manifest'],
        'repository lease receipt',
    );
    validateRepositoryLeaseIntent(repositoryLeaseIntentFromRecord(record), 'repository lease receipt');
    if (!/^[a-f0-9]{40}$/.test(record.source_head)) fail('repository lease source HEAD is invalid');
    assertSha256(record.source_manifest?.manifest_sha256, 'repository lease source manifest');
}

export function verifyRepositoryLeaseReleaseStructure(record: RepositoryLeaseReleaseRecord): void {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'run_id', 'lease_id', 'resume_token_sha256',
        'disposition', 'terminal_state',
    ], 'repository lease release');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !/^[a-f0-9-]{36}$/.test(record.lease_id)
        || !['completed', 'abandoned'].includes(record.disposition)
        || record.terminal_state !== (record.disposition === 'completed' ? 'RELEASED' : 'ABORTED')) {
        fail('repository lease release is invalid');
    }
    assertRunId(record.run_id);
    assertSha256(record.resume_token_sha256, 'repository lease release resume token');
}
