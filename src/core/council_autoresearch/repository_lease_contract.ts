import fs from 'node:fs';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    type ArtifactManifest,
    assertExactObjectKeys,
    assertSha256,
    fail,
    readJson,
    sha256,
} from './contracts.js';

export const OPERATION_GUARD_MAX_BYTES = 64 * 1024;
export const UUID_V4_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export interface RepositoryLeaseRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    lease_id: string;
    run_id: string;
    repository_root: string;
    git_common_directory: string;
    control_root: string;
    source_head: string;
    governed_paths: string[];
    source_manifest: ArtifactManifest;
    resume_token_sha256: string;
    owner: { pid: number; hostname: string };
    acquired_at: string;
}

export interface OwnedRepositoryLease {
    record: RepositoryLeaseRecord;
    lock_file: string;
    resume_token: string;
}

export interface RepositoryOperationOwner {
    pid: number;
    hostname: string;
    machine_id_sha256: string;
    boot_id_sha256: string;
    pid_namespace_sha256: string;
    process_start_ticks: string;
}

export interface RepositoryOperationRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    operation_id: string;
    lease_id: string;
    run_id: string;
    resume_token_sha256: string;
    owner: RepositoryOperationOwner;
    acquired_at: string;
}

export interface RepositoryOperationRecoveryOwnerRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    recovery_id: string;
    lease_id: string;
    run_id: string;
    resume_token_sha256: string;
    owner: RepositoryOperationOwner;
    acquired_at: string;
}

export type RepositoryOperationRecovery =
    | { recovered: false }
    | { recovered: true; operation: RepositoryOperationRecord };

export function assertRepositoryOperationOwner(
    owner: unknown,
    label = 'repository operation owner',
): asserts owner is RepositoryOperationOwner {
    assertExactObjectKeys(owner, [
        'pid', 'hostname', 'machine_id_sha256', 'boot_id_sha256',
        'pid_namespace_sha256', 'process_start_ticks',
    ], label);
    const value = owner as RepositoryOperationOwner;
    if (!Number.isSafeInteger(value.pid) || value.pid < 1
        || typeof value.hostname !== 'string' || value.hostname.length < 1
        || value.hostname.length > 255 || /[\r\n\0]/.test(value.hostname)
        || typeof value.process_start_ticks !== 'string'
        || !/^[1-9][0-9]*$/.test(value.process_start_ticks)) {
        fail(`${label} is invalid`);
    }
    assertSha256(value.machine_id_sha256, `${label}.machine_id_sha256`);
    assertSha256(value.boot_id_sha256, `${label}.boot_id_sha256`);
    assertSha256(value.pid_namespace_sha256, `${label}.pid_namespace_sha256`);
}

export function verifyOperationGuardRecord(
    record: RepositoryOperationRecord,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): void {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'operation_id', 'lease_id', 'run_id',
        'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository operation guard');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !UUID_V4_PATTERN.test(record.operation_id)
        || record.lease_id !== lease.lease_id
        || record.run_id !== lease.run_id
        || record.resume_token_sha256 !== sha256(resumeToken)
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.acquired_at)) {
        fail('repository operation guard does not bind the active lease');
    }
    assertSha256(record.resume_token_sha256, 'repository operation guard resume token hash');
    assertRepositoryOperationOwner(record.owner, 'repository operation guard owner');
}

export function assertPrivateOperationGuard(
    stat: fs.BigIntStats,
    allowedLinks: readonly bigint[] = [1n],
): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || !allowedLinks.includes(stat.nlink)
        || (stat.mode & 0o7777n) !== 0o600n || stat.uid !== BigInt(uid)) {
        fail('repository operation guard must be an exact private single-link owned regular file');
    }
}

export function assertSameOperationGuard(
    before: fs.BigIntStats,
    after: fs.BigIntStats,
    message: string,
): void {
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) {
        if (before[key] !== after[key]) fail(message);
    }
}

export function verifyRecoveryOwnerRecord(
    record: RepositoryOperationRecoveryOwnerRecord,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): void {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'recovery_id', 'lease_id', 'run_id',
        'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository operation recovery owner');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !UUID_V4_PATTERN.test(record.recovery_id)
        || record.lease_id !== lease.lease_id
        || record.run_id !== lease.run_id
        || record.resume_token_sha256 !== sha256(resumeToken)
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.acquired_at)) {
        fail('repository operation recovery owner does not bind the active lease');
    }
    assertSha256(record.resume_token_sha256, 'repository operation recovery owner token hash');
    assertRepositoryOperationOwner(record.owner, 'repository operation recovery owner identity');
}

export function readRecoveryOwner(
    file: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): { record: RepositoryOperationRecoveryOwnerRecord; stat: fs.BigIntStats } {
    const before = fs.lstatSync(file, { bigint: true });
    assertPrivateOperationGuard(before);
    const record = readJson<RepositoryOperationRecoveryOwnerRecord>(file, OPERATION_GUARD_MAX_BYTES);
    verifyRecoveryOwnerRecord(record, lease, resumeToken);
    const after = fs.lstatSync(file, { bigint: true });
    assertPrivateOperationGuard(after);
    assertSameOperationGuard(before, after, 'repository operation recovery owner changed while it was read');
    return { record, stat: after };
}

export function readBoundOperationGuard(
    file: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
    allowedLinks: readonly bigint[] = [1n],
): { record: RepositoryOperationRecord; stat: fs.BigIntStats } {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(before, allowedLinks);
        if (before.size < 1n || before.size > BigInt(OPERATION_GUARD_MAX_BYTES)) {
            fail('repository operation guard exceeds its byte limit');
        }
        const content = Buffer.allocUnsafe(Number(before.size));
        let offset = 0;
        while (offset < content.length) {
            const bytesRead = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (bytesRead === 0) fail('repository operation guard changed while it was read');
            offset += bytesRead;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(after, allowedLinks);
        assertSameOperationGuard(before, after, 'repository operation guard changed while it was read');
        const linked = fs.lstatSync(file, { bigint: true });
        assertPrivateOperationGuard(linked, allowedLinks);
        assertSameOperationGuard(after, linked, 'repository operation guard path changed while it was read');
        let record: RepositoryOperationRecord;
        try {
            record = JSON.parse(content.toString('utf8')) as RepositoryOperationRecord;
        } catch (error) {
            fail(`repository operation guard is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        verifyOperationGuardRecord(record, lease, resumeToken);
        return { record, stat: linked };
    } finally {
        fs.closeSync(descriptor);
    }
}
