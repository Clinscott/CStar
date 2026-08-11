import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { hostname as systemHostname } from 'node:os';
import path from 'node:path';

import {
    ArtifactManifest,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalPrivateDirectory,
    canonicalJson,
    ensureDirectoryNoFollow,
    fail,
    fsyncDirectory,
    readJson,
    sha256,
    validateDirectoryCreationTarget,
    writeImmutableJson,
} from './contracts.js';
import {
    gitCommonDirectory,
    repositoryRoot,
} from './git_trust.js';
import { assertGovernedPaths, attestSource } from './source_attestation.js';

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

interface RepositoryOperationGuardRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    lease_id: string;
    run_id: string;
    resume_token_sha256: string;
    owner: { pid: number; hostname: string };
    acquired_at: string;
}

function lockPath(repoRoot: string): string {
    const common = gitCommonDirectory(repoRoot);
    return path.join(common, 'cstar-council-autoresearch.lock');
}

function operationLockPath(repoRoot: string): string {
    return `${lockPath(repoRoot)}.operation`;
}

function overlaps(left: string, right: string): boolean {
    return left === right
        || left.startsWith(`${right}${path.sep}`)
        || right.startsWith(`${left}${path.sep}`);
}

function assertSeparated(candidate: string, repoRoot: string, commonDirectory: string, label: string): void {
    if (overlaps(candidate, repoRoot) || overlaps(candidate, commonDirectory)) {
        fail(`${label} must not contain or be contained by the governed repository`);
    }
}

function writeLeaseDescriptor(descriptor: number, record: RepositoryLeaseRecord): void {
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    fs.ftruncateSync(descriptor, 0);
    fs.writeSync(descriptor, bytes, 0, bytes.length, 0);
    fs.fsyncSync(descriptor);
}

export function acquireRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    hostname?: string;
}): OwnedRepositoryLease {
    assertRunId(input.runId);
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);
    const controlTarget = validateDirectoryCreationTarget(input.controlRoot, 'control root');
    assertSeparated(controlTarget, repoRoot, commonDirectory, 'control root');
    const controlRoot = canonicalPrivateDirectory(controlTarget, 'control root', true);
    assertSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
    const receiptTarget = path.join(controlRoot, 'council-autoresearch', input.runId);
    assertSeparated(receiptTarget, repoRoot, commonDirectory, 'receipt directory');
    const receiptDirectory = ensureDirectoryNoFollow(receiptTarget);
    assertSeparated(receiptDirectory, repoRoot, commonDirectory, 'receipt directory');
    const file = lockPath(repoRoot);
    let descriptor: number | undefined;
    let acquired = false;
    try {
        descriptor = fs.openSync(file, 'wx', 0o600);
        acquired = true;
        const resumeToken = randomBytes(32).toString('hex');
        const attestation = attestSource(repoRoot, governedPaths, 'source');
        const record: RepositoryLeaseRecord = {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            lease_id: randomUUID(),
            run_id: input.runId,
            repository_root: repoRoot,
            git_common_directory: gitCommonDirectory(repoRoot),
            control_root: controlRoot,
            source_head: attestation.head,
            governed_paths: governedPaths,
            source_manifest: attestation.manifest,
            resume_token_sha256: sha256(resumeToken),
            owner: { pid: process.pid, hostname: input.hostname ?? process.env.HOSTNAME ?? 'unreported' },
            acquired_at: new Date().toISOString(),
        };
        writeLeaseDescriptor(descriptor, record);
        fsyncDirectory(commonDirectory);
        fs.closeSync(descriptor);
        descriptor = undefined;
        const receiptFile = path.join(receiptDirectory, '00-source-lease.json');
        writeImmutableJson(receiptFile, record);
        return { record, lock_file: file, resume_token: resumeToken };
    } catch (error) {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        if (acquired) {
            try {
                fs.unlinkSync(file);
                fsyncDirectory(commonDirectory);
            } catch {
                // Only the successful acquirer reaches this cleanup branch.
            }
        }
        throw error;
    }
}

export function verifyRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
}): RepositoryLeaseRecord {
    const repoRoot = fs.realpathSync(input.repoRoot);
    const file = lockPath(repoRoot);
    const record = readJson<RepositoryLeaseRecord>(file);
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'lease_id', 'run_id', 'repository_root',
        'git_common_directory', 'control_root', 'source_head', 'governed_paths', 'source_manifest',
        'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository lease');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || record.run_id !== input.runId
        || record.repository_root !== repoRoot
        || record.git_common_directory !== gitCommonDirectory(repoRoot)
        || record.control_root !== canonicalPrivateDirectory(input.controlRoot, 'control root')
        || !/^[a-f0-9-]{36}$/.test(record.lease_id)) fail('repository lease identity mismatch');
    assertRunId(record.run_id);
    assertSha256(record.resume_token_sha256, 'resume_token_sha256');
    if (!Array.isArray(record.governed_paths) || record.governed_paths.length < 1
        || new Set(record.governed_paths).size !== record.governed_paths.length
        || JSON.stringify(record.governed_paths) !== JSON.stringify([...record.governed_paths].sort())) {
        fail('repository lease governed paths are invalid');
    }
    assertGovernedPaths(record.governed_paths);
    assertExactObjectKeys(record.owner, ['pid', 'hostname'], 'repository lease owner');
    if (record.resume_token_sha256 !== sha256(input.resumeToken)) fail('repository lease resume token mismatch');
    const attestation = attestSource(repoRoot, record.governed_paths, record.source_manifest.root_label);
    if (record.source_head !== attestation.head
        || canonicalJson(record.source_manifest) !== canonicalJson(attestation.manifest)) {
        fail('repository source attestation changed while leased');
    }
    const receipt = readJson<RepositoryLeaseRecord>(path.join(
        record.control_root, 'council-autoresearch', record.run_id, '00-source-lease.json',
    ));
    if (JSON.stringify(receipt) !== JSON.stringify(record)) fail('repository lease receipt does not match the active lock');
    return record;
}

function processIsAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid < 1) fail('repository operation guard owner is invalid');
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ESRCH') return false;
        if (code === 'EPERM') return true;
        throw error;
    }
}

function verifyOperationGuardRecord(
    record: RepositoryOperationGuardRecord,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): void {
    assertExactObjectKeys(record, [
        'schema_version', 'lease_id', 'run_id', 'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository operation guard');
    assertExactObjectKeys(record.owner, ['pid', 'hostname'], 'repository operation guard owner');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.lease_id !== lease.lease_id
        || record.run_id !== lease.run_id
        || record.resume_token_sha256 !== sha256(resumeToken)
        || typeof record.acquired_at !== 'string'
        || !record.acquired_at
        || typeof record.owner.hostname !== 'string'
        || !record.owner.hostname) {
        fail('repository operation guard does not bind the active lease');
    }
    assertSha256(record.resume_token_sha256, 'repository operation guard resume token hash');
    if (!Number.isInteger(record.owner.pid) || record.owner.pid < 1) {
        fail('repository operation guard owner is invalid');
    }
}

function recoverDeadOperationGuard(
    file: string,
    commonDirectory: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): void {
    const before = fs.lstatSync(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || (before.mode & 0o077n) !== 0n) {
        fail('repository operation guard is not a private single-link regular file');
    }
    const record = readJson<RepositoryOperationGuardRecord>(file);
    verifyOperationGuardRecord(record, lease, resumeToken);
    if (record.owner.hostname !== systemHostname()) {
        fail('repository operation guard belongs to another host');
    }
    if (processIsAlive(record.owner.pid)) fail('another repository operation is active');
    const after = fs.lstatSync(file, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const) {
        if (before[key] !== after[key]) fail('repository operation guard changed during stale-owner recovery');
    }
    fs.unlinkSync(file);
    fsyncDirectory(commonDirectory);
}

function withOperationGuard<T>(
    repoRootInput: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
    operation: () => T,
): T {
    const repoRoot = fs.realpathSync(repoRootInput);
    const file = operationLockPath(repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const record: RepositoryOperationGuardRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        lease_id: lease.lease_id,
        run_id: lease.run_id,
        resume_token_sha256: sha256(resumeToken),
        owner: { pid: process.pid, hostname: systemHostname() },
        acquired_at: new Date().toISOString(),
    };
    let descriptor: number;
    try {
        descriptor = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        recoverDeadOperationGuard(file, commonDirectory, lease, resumeToken);
        descriptor = fs.openSync(file, 'wx', 0o600);
    }
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
        fs.fsyncSync(descriptor);
        fsyncDirectory(commonDirectory);
        return operation();
    } finally {
        try {
            const owned = fs.fstatSync(descriptor, { bigint: true });
            const current = fs.lstatSync(file, { bigint: true });
            if (owned.dev !== current.dev || owned.ino !== current.ino) {
                fail('repository operation guard ownership changed before release');
            }
            fs.unlinkSync(file);
            fsyncDirectory(commonDirectory);
        } finally {
            fs.closeSync(descriptor);
        }
    }
}

export function withRepositoryLeaseOperation<T>(
    input: { repoRoot: string; controlRoot: string; runId: string; resumeToken: string },
    operation: (record: RepositoryLeaseRecord) => T,
): T {
    const preflight = verifyRepositoryLease(input);
    return withOperationGuard(input.repoRoot, preflight, input.resumeToken, () => {
        const before = verifyRepositoryLease(input);
        const result = operation(before);
        const after = verifyRepositoryLease(input);
        if (after.lease_id !== before.lease_id) fail('repository lease changed during the operation');
        return result;
    });
}

export function releaseRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
}): RepositoryLeaseRecord {
    const preflight = verifyRepositoryLease(input);
    return withOperationGuard(input.repoRoot, preflight, input.resumeToken, () => {
        const record = verifyRepositoryLease(input);
        const file = lockPath(input.repoRoot);
        const current = readJson<RepositoryLeaseRecord>(file);
        if (current.lease_id !== record.lease_id) fail('repository lease changed before release');
        fs.unlinkSync(file);
        fsyncDirectory(gitCommonDirectory(input.repoRoot));
        return record;
    });
}
