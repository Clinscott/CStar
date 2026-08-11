import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
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
import {
    RepositoryOperationOwner,
    assertRepositoryOperationOwner,
    currentOperationOwner,
    operationOwnerDefinitelyDead,
} from './operation_identity.js';
import { assertGovernedPaths, attestSource } from './source_attestation.js';

const OPERATION_GUARD_MAX_BYTES = 64 * 1024;
const UUID_V4_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

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

interface RepositoryOperationRecoveryOwnerRecord {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    recovery_id: string;
    lease_id: string;
    run_id: string;
    resume_token_sha256: string;
    owner: RepositoryOperationOwner;
    acquired_at: string;
}

interface OwnedOperationRecovery {
    descriptor: number;
    file: string;
    commonDirectory: string;
    record: RepositoryOperationRecoveryOwnerRecord;
}

export type RepositoryOperationRecovery =
    | { recovered: false }
    | { recovered: true; operation: RepositoryOperationRecord };

function lockPath(repoRoot: string): string {
    const common = gitCommonDirectory(repoRoot);
    return path.join(common, 'cstar-council-autoresearch.lock');
}

function operationLockPath(repoRoot: string): string {
    return `${lockPath(repoRoot)}.operation`;
}

function operationRecoveryClaimPath(repoRoot: string): string {
    return `${operationLockPath(repoRoot)}.recovery-claim`;
}

function operationRecoveryOwnerPath(repoRoot: string): string {
    return `${operationLockPath(repoRoot)}.recovery-owner`;
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
}): OwnedRepositoryLease {
    assertRunId(input.runId);
    const leaseOwner = currentOperationOwner();
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
            owner: { pid: leaseOwner.pid, hostname: leaseOwner.hostname },
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
    if (!Number.isSafeInteger(record.owner.pid) || record.owner.pid < 1
        || typeof record.owner.hostname !== 'string' || record.owner.hostname.length < 1
        || record.owner.hostname.length > 255 || /[\r\n\0]/.test(record.owner.hostname)) {
        fail('repository lease owner is invalid');
    }
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

function verifyOperationGuardRecord(
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

function assertPrivateOperationGuard(
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

function assertSameOperationGuard(
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

function verifyRecoveryOwnerRecord(
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

function readRecoveryOwner(
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

function createRecoveryOwner(
    file: string,
    commonDirectory: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): OwnedOperationRecovery {
    const record: RepositoryOperationRecoveryOwnerRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        recovery_id: randomUUID(),
        lease_id: lease.lease_id,
        run_id: lease.run_id,
        resume_token_sha256: sha256(resumeToken),
        owner: currentOperationOwner(),
        acquired_at: new Date().toISOString(),
    };
    const descriptor = fs.openSync(file, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`);
        fs.fsyncSync(descriptor);
        fsyncDirectory(commonDirectory);
        return { descriptor, file, commonDirectory, record };
    } catch (error) {
        fs.closeSync(descriptor);
        try {
            fs.unlinkSync(file);
            fsyncDirectory(commonDirectory);
        } catch {
            // The descriptor-owning creator is the only cleanup authority here.
        }
        throw error;
    }
}

function acquireRecoveryOwner(
    file: string,
    commonDirectory: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
): OwnedOperationRecovery {
    try {
        return createRecoveryOwner(file, commonDirectory, lease, resumeToken);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const previous = readRecoveryOwner(file, lease, resumeToken);
    if (operationOwnerDefinitelyDead(previous.record.owner)) {
        fail('an interrupted repository operation recovery requires operator investigation');
    }
    fail('another repository operation recovery is active');
}

function releaseRecoveryOwner(owned: OwnedOperationRecovery): void {
    try {
        const descriptorStat = fs.fstatSync(owned.descriptor, { bigint: true });
        const pathStat = fs.lstatSync(owned.file, { bigint: true });
        assertPrivateOperationGuard(descriptorStat);
        assertPrivateOperationGuard(pathStat);
        assertSameOperationGuard(
            descriptorStat,
            pathStat,
            'repository operation recovery ownership changed before release',
        );
        fs.unlinkSync(owned.file);
        fsyncDirectory(owned.commonDirectory);
    } finally {
        fs.closeSync(owned.descriptor);
    }
}

function readBoundOperationGuard(
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
            const bytesRead = fs.readSync(
                descriptor,
                content,
                offset,
                content.length - offset,
                offset,
            );
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

function optionalStat(file: string): fs.BigIntStats | undefined {
    try {
        return fs.lstatSync(file, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function completeOperationRecoveryClaim(
    file: string,
    claim: string,
    commonDirectory: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
    expected?: RepositoryOperationRecord,
): RepositoryOperationRecovery {
    const claimed = readBoundOperationGuard(claim, lease, resumeToken, [1n, 2n]);
    if (expected !== undefined && canonicalJson(claimed.record) !== canonicalJson(expected)) {
        fail('repository operation guard changed while explicit recovery claimed it');
    }
    if (!operationOwnerDefinitelyDead(claimed.record.owner)) {
        fail('another repository operation is active');
    }

    const guardStat = optionalStat(file);
    if (claimed.stat.nlink === 2n) {
        if (guardStat === undefined) {
            fail('repository operation recovery claim has an unexplained hard link');
        }
        assertPrivateOperationGuard(guardStat, [2n]);
        if (!sameInode(claimed.stat, guardStat)) {
            fail('repository operation recovery claim does not name the guarded operation');
        }
        const finalClaim = fs.lstatSync(claim, { bigint: true });
        const finalGuard = fs.lstatSync(file, { bigint: true });
        assertPrivateOperationGuard(finalClaim, [2n]);
        assertPrivateOperationGuard(finalGuard, [2n]);
        assertSameOperationGuard(
            claimed.stat,
            finalClaim,
            'repository operation recovery claim changed before guard removal',
        );
        assertSameOperationGuard(
            finalClaim,
            finalGuard,
            'repository operation guard changed before claimed removal',
        );
        fs.unlinkSync(file);
        fsyncDirectory(commonDirectory);
    } else if (guardStat !== undefined && sameInode(claimed.stat, guardStat)) {
        fail('repository operation recovery claim link count is inconsistent');
    }

    const confirmed = readBoundOperationGuard(claim, lease, resumeToken);
    if (confirmed.record.operation_id !== claimed.record.operation_id
        || canonicalJson(confirmed.record) !== canonicalJson(claimed.record)
        || !sameInode(confirmed.stat, claimed.stat)) {
        fail('repository operation recovery claim changed before completion');
    }
    if (!operationOwnerDefinitelyDead(confirmed.record.owner)) {
        fail('another repository operation is active');
    }
    const finalStat = fs.lstatSync(claim, { bigint: true });
    assertPrivateOperationGuard(finalStat);
    assertSameOperationGuard(
        confirmed.stat,
        finalStat,
        'repository operation recovery claim changed immediately before completion',
    );
    fs.unlinkSync(claim);
    fsyncDirectory(commonDirectory);
    return { recovered: true, operation: confirmed.record };
}

export function recoverRepositoryLeaseOperation(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
}): RepositoryOperationRecovery {
    const lease = verifyRepositoryLease(input);
    const repoRoot = fs.realpathSync(input.repoRoot);
    const file = operationLockPath(repoRoot);
    const claim = operationRecoveryClaimPath(repoRoot);
    const recoveryOwnerFile = operationRecoveryOwnerPath(repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const recoveryOwner = acquireRecoveryOwner(
        recoveryOwnerFile,
        commonDirectory,
        lease,
        input.resumeToken,
    );
    try {
        if (optionalStat(claim) !== undefined) {
            return completeOperationRecoveryClaim(
                file,
                claim,
                commonDirectory,
                lease,
                input.resumeToken,
            );
        }
        if (optionalStat(file) === undefined) return { recovered: false };
        const before = readBoundOperationGuard(file, lease, input.resumeToken);
        if (!operationOwnerDefinitelyDead(before.record.owner)) {
            fail('another repository operation is active');
        }
        try {
            fs.linkSync(file, claim);
            fsyncDirectory(commonDirectory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        return completeOperationRecoveryClaim(
            file,
            claim,
            commonDirectory,
            lease,
            input.resumeToken,
            before.record,
        );
    } finally {
        releaseRecoveryOwner(recoveryOwner);
    }
}

function withOperationGuard<T>(
    repoRootInput: string,
    lease: RepositoryLeaseRecord,
    resumeToken: string,
    operation: () => T,
): T {
    const repoRoot = fs.realpathSync(repoRootInput);
    const file = operationLockPath(repoRoot);
    const claim = operationRecoveryClaimPath(repoRoot);
    const recoveryOwnerFile = operationRecoveryOwnerPath(repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    if (optionalStat(claim) !== undefined || optionalStat(recoveryOwnerFile) !== undefined) {
        fail('repository operation recovery claim requires explicit completion');
    }
    const record: RepositoryOperationRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_id: randomUUID(),
        lease_id: lease.lease_id,
        run_id: lease.run_id,
        resume_token_sha256: sha256(resumeToken),
        owner: currentOperationOwner(),
        acquired_at: new Date().toISOString(),
    };
    let descriptor: number;
    try {
        descriptor = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        fail('repository operation guard already exists; explicit recovery is required');
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
            assertPrivateOperationGuard(owned);
            assertPrivateOperationGuard(current);
            assertSameOperationGuard(
                owned,
                current,
                'repository operation guard ownership changed before release',
            );
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
