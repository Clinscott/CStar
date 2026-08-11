import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    fail,
    sha256,
    type ArtifactManifest,
} from './contracts.js';

export const OPERATION_GUARD_MAX_BYTES = 64 * 1024;
export const UUID_V4_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const DECIMAL_BIGINT_PATTERN = /^(?:0|[1-9][0-9]*)$/;

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

export type RepositoryOperationKind =
    | 'lease-acquisition'
    | 'lease-command'
    | 'lease-release';

interface RepositoryOperationBase {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    operation_kind: RepositoryOperationKind;
    operation_id: string;
    lease_id: string;
    run_id: string;
    resume_token_sha256: string;
    owner: RepositoryOperationOwner;
    acquired_at: string;
}

export interface RepositoryLeaseAcquisitionOperationRecord extends RepositoryOperationBase {
    operation_kind: 'lease-acquisition';
    repository_root: string;
    git_common_directory: string;
    control_root: string;
    governed_paths_sha256: string;
}

export interface RepositoryLeaseCommandOperationRecord extends RepositoryOperationBase {
    operation_kind: 'lease-command';
}

export interface RepositoryLeaseReleaseOperationRecord extends RepositoryOperationBase {
    operation_kind: 'lease-release';
}

export type RepositoryOperationRecord =
    | RepositoryLeaseAcquisitionOperationRecord
    | RepositoryLeaseCommandOperationRecord
    | RepositoryLeaseReleaseOperationRecord;

export interface RepositoryOperationRecoveryTarget {
    operation_kind: RepositoryOperationKind;
    operation_id: string;
    guard_sha256: string;
    guard_device: string;
    guard_inode: string;
}

export interface RepositoryOperationRecoveryOwnerRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    recovery_id: string;
    target: RepositoryOperationRecoveryTarget;
    owner: RepositoryOperationOwner;
    acquired_at: string;
}

export interface RepositoryOperationGuardSnapshot {
    content: Buffer;
    digest: string;
    record: RepositoryOperationRecord;
    stat: fs.BigIntStats;
}

export type RepositoryOperationRecoveryOutcome =
    | 'acquisition-not-committed'
    | 'acquisition-active'
    | 'command-guard-removed'
    | 'release-not-committed'
    | 'release-committed';

export type RepositoryOperationRecovery =
    | { recovered: false }
    | {
        recovered: true;
        outcome: RepositoryOperationRecoveryOutcome;
        operation: RepositoryOperationRecord;
    };

export function governedPathsSha256(governedPaths: readonly string[]): string {
    return sha256(canonicalJson(governedPaths));
}

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

function operationKind(record: unknown): RepositoryOperationKind {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        fail('repository operation guard must be an object');
    }
    const kind = (record as { operation_kind?: unknown }).operation_kind;
    if (kind !== 'lease-acquisition' && kind !== 'lease-command' && kind !== 'lease-release') {
        fail('repository operation guard kind is invalid');
    }
    return kind;
}

export function validateRepositoryOperationRecord(
    record: unknown,
): asserts record is RepositoryOperationRecord {
    const kind = operationKind(record);
    const acquisitionKeys = kind === 'lease-acquisition'
        ? ['repository_root', 'git_common_directory', 'control_root', 'governed_paths_sha256']
        : [];
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'operation_kind', 'operation_id',
        'lease_id', 'run_id', 'resume_token_sha256', 'owner', 'acquired_at',
        ...acquisitionKeys,
    ], 'repository operation guard');
    const value = record as RepositoryOperationRecord;
    if (value.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || value.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !UUID_V4_PATTERN.test(value.operation_id)
        || !UUID_V4_PATTERN.test(value.lease_id)
        || !TIMESTAMP_PATTERN.test(value.acquired_at)) {
        fail('repository operation guard identity is invalid');
    }
    assertRunId(value.run_id);
    assertSha256(value.resume_token_sha256, 'repository operation guard resume token hash');
    assertRepositoryOperationOwner(value.owner, 'repository operation guard owner');
    if (value.operation_kind === 'lease-acquisition') {
        if (![value.repository_root, value.git_common_directory, value.control_root].every(
            (candidate) => typeof candidate === 'string'
                && path.isAbsolute(candidate)
                && path.resolve(candidate) === candidate
                && !/[\r\n\0]/.test(candidate),
        )) {
            fail('repository lease acquisition guard paths are invalid');
        }
        assertSha256(
            value.governed_paths_sha256,
            'repository lease acquisition guard governed paths hash',
        );
    }
}

export function assertOperationBindsLease(
    record: RepositoryOperationRecord,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
    allowedKinds: readonly RepositoryOperationKind[],
): void {
    validateRepositoryOperationRecord(record);
    if (!allowedKinds.includes(record.operation_kind)
        || record.lease_id !== lease.lease_id
        || record.run_id !== lease.run_id
        || record.resume_token_sha256 !== sha256(resumeToken)) {
        fail('repository operation guard does not bind the authorized lease');
    }
    if (record.operation_kind === 'lease-acquisition'
        && (record.repository_root !== lease.repository_root
            || record.git_common_directory !== lease.git_common_directory
            || record.control_root !== lease.control_root
            || record.governed_paths_sha256 !== governedPathsSha256(lease.governed_paths))) {
        fail('repository lease acquisition guard does not bind the authorized lease scope');
    }
}

export function assertAcquisitionBindsInput(
    record: RepositoryOperationRecord,
    input: {
        operationId: string;
        runId: string;
        repositoryRoot: string;
        gitCommonDirectory: string;
        controlRoot: string;
        governedPaths: readonly string[];
    },
): asserts record is RepositoryLeaseAcquisitionOperationRecord {
    validateRepositoryOperationRecord(record);
    if (record.operation_kind !== 'lease-acquisition'
        || record.operation_id !== input.operationId
        || record.run_id !== input.runId
        || record.repository_root !== input.repositoryRoot
        || record.git_common_directory !== input.gitCommonDirectory
        || record.control_root !== input.controlRoot
        || record.governed_paths_sha256 !== governedPathsSha256(input.governedPaths)) {
        fail('repository lease acquisition guard does not bind the recovery input');
    }
}

export function assertPrivateOperationGuard(
    stat: fs.BigIntStats,
    allowedLinks: readonly bigint[] = [1n],
): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || !allowedLinks.includes(stat.nlink)
        || (stat.mode & 0o7777n) !== 0o600n || stat.uid !== BigInt(uid)) {
        fail('repository operation guard must be an exact private owned regular file');
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

function readStablePrivateFile(
    file: string,
    label: string,
    allowedLinks: readonly bigint[],
): { content: Buffer; stat: fs.BigIntStats } {
    if (typeof fs.constants.O_NONBLOCK !== 'number') {
        fail(`${label} requires nonblocking descriptor support`);
    }
    const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(before, allowedLinks);
        if (before.size < 1n || before.size > BigInt(OPERATION_GUARD_MAX_BYTES)) {
            fail(`${label} exceeds its byte limit`);
        }
        const content = Buffer.allocUnsafe(Number(before.size));
        let offset = 0;
        while (offset < content.length) {
            const count = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (count === 0) fail(`${label} changed while it was read`);
            offset += count;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        assertPrivateOperationGuard(after, allowedLinks);
        assertSameOperationGuard(before, after, `${label} changed while it was read`);
        const linked = fs.lstatSync(file, { bigint: true });
        assertPrivateOperationGuard(linked, allowedLinks);
        assertSameOperationGuard(after, linked, `${label} path changed while it was read`);
        return { content, stat: linked };
    } finally {
        fs.closeSync(descriptor);
    }
}

export function readOperationGuard(
    file: string,
    allowedLinks: readonly bigint[] = [1n],
): RepositoryOperationGuardSnapshot {
    const snapshot = readStablePrivateFile(file, 'repository operation guard', allowedLinks);
    let record: unknown;
    try {
        record = JSON.parse(snapshot.content.toString('utf8'));
    } catch (error) {
        fail(`repository operation guard is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
        }`);
    }
    validateRepositoryOperationRecord(record);
    return {
        ...snapshot,
        digest: sha256(snapshot.content),
        record,
    };
}

export function operationRecoveryTarget(
    snapshot: RepositoryOperationGuardSnapshot,
): RepositoryOperationRecoveryTarget {
    return {
        operation_kind: snapshot.record.operation_kind,
        operation_id: snapshot.record.operation_id,
        guard_sha256: snapshot.digest,
        guard_device: snapshot.stat.dev.toString(),
        guard_inode: snapshot.stat.ino.toString(),
    };
}

export function validateRecoveryOwnerRecord(
    record: unknown,
): asserts record is RepositoryOperationRecoveryOwnerRecord {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'recovery_id', 'target', 'owner', 'acquired_at',
    ], 'repository operation recovery owner');
    const value = record as RepositoryOperationRecoveryOwnerRecord;
    if (value.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || value.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !UUID_V4_PATTERN.test(value.recovery_id)
        || !TIMESTAMP_PATTERN.test(value.acquired_at)) {
        fail('repository operation recovery owner identity is invalid');
    }
    assertExactObjectKeys(value.target, [
        'operation_kind', 'operation_id', 'guard_sha256', 'guard_device', 'guard_inode',
    ], 'repository operation recovery target');
    if (!['lease-acquisition', 'lease-command', 'lease-release'].includes(
        value.target.operation_kind,
    ) || !UUID_V4_PATTERN.test(value.target.operation_id)
        || !DECIMAL_BIGINT_PATTERN.test(value.target.guard_device)
        || !DECIMAL_BIGINT_PATTERN.test(value.target.guard_inode)) {
        fail('repository operation recovery target is invalid');
    }
    assertSha256(value.target.guard_sha256, 'repository operation recovery target guard hash');
    assertRepositoryOperationOwner(value.owner, 'repository operation recovery owner identity');
}

export function readRecoveryOwner(
    file: string,
    allowedLinks: readonly bigint[] = [1n],
): {
    content: Buffer;
    record: RepositoryOperationRecoveryOwnerRecord;
    stat: fs.BigIntStats;
} {
    const snapshot = readStablePrivateFile(
        file,
        'repository operation recovery owner',
        allowedLinks,
    );
    let record: unknown;
    try {
        record = JSON.parse(snapshot.content.toString('utf8'));
    } catch (error) {
        fail(`repository operation recovery owner is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
        }`);
    }
    validateRecoveryOwnerRecord(record);
    return { content: snapshot.content, record, stat: snapshot.stat };
}

export function assertRecoveryOwnerTargets(
    record: RepositoryOperationRecoveryOwnerRecord,
    target: RepositoryOperationRecoveryTarget,
): void {
    validateRecoveryOwnerRecord(record);
    if (canonicalJson(record.target) !== canonicalJson(target)) {
        fail('repository operation recovery owner does not bind the exact guard');
    }
}
