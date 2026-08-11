import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    ensureDirectoryNoFollow,
    fail,
    fsyncDirectory,
    readJson,
    repairInterruptedImmutableWrite,
    sha256,
    writeImmutableJson,
} from './contracts.js';
import {
    LeaseOwner,
    OwnedRepositoryLease,
    RepositoryLeaseDisposition,
    RepositoryLeaseIntent,
    RepositoryLeaseRecord,
    RepositoryLeaseReleaseRecord,
    RepositoryOperationRecord,
    assertGovernedPaths,
    assertLeaseOwner,
    assertResumeToken,
    repositoryLeaseIntentFromRecord,
    validateRepositoryLeaseIntent,
    verifyRepositoryLeaseRecordStructure,
    verifyRepositoryLeaseReleaseStructure,
} from './repository_lease_contract.js';
import { receiptPairState, sealReceipt } from './receipt_seal.js';
import { attestSource, gitCommonDirectory, repositoryRoot } from './source_attestation.js';

export * from './repository_lease_contract.js';

type LeaseAuthorityInput = {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
};

function lockPath(repoRoot: string): string {
    return path.join(gitCommonDirectory(repoRoot), 'cstar-council-autoresearch.lock');
}

function operationLockPath(repoRoot: string): string {
    return `${lockPath(repoRoot)}.operation`;
}

function runReceiptDirectory(controlRoot: string, runId: string): string {
    return path.join(controlRoot, 'council-autoresearch', runId);
}

function releaseReceiptPath(controlRoot: string, runId: string): string {
    return path.join(runReceiptDirectory(controlRoot, runId), '50-source-release.json');
}

function fileExists(file: string): boolean {
    repairInterruptedImmutableWrite(file);
    try {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) fail(`invalid durable file: ${file}`);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

function overlaps(left: string, right: string): boolean {
    return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function assertSeparated(candidate: string, repoRoot: string, commonDirectory: string, label: string): void {
    if (overlaps(candidate, repoRoot) || overlaps(candidate, commonDirectory)) {
        fail(`${label} must not contain or be contained by the governed repository`);
    }
}

function assertIntentAuthority(intent: RepositoryLeaseIntent, input: LeaseAuthorityInput): void {
    const repoRoot = repositoryRoot(input.repoRoot);
    const controlRoot = fs.realpathSync(input.controlRoot);
    if (intent.run_id !== input.runId
        || intent.repository_root !== repoRoot
        || intent.git_common_directory !== gitCommonDirectory(repoRoot)
        || intent.control_root !== controlRoot
        || intent.resume_token_sha256 !== sha256(input.resumeToken)) {
        fail('repository lease identity mismatch');
    }
}

function readAuthorizedReceipt(input: LeaseAuthorityInput): RepositoryLeaseRecord {
    assertRunId(input.runId);
    assertResumeToken(input.resumeToken);
    const controlRoot = fs.realpathSync(input.controlRoot);
    const receipt = readJson<RepositoryLeaseRecord>(path.join(
        runReceiptDirectory(controlRoot, input.runId), '00-source-lease.json',
    ));
    verifyRepositoryLeaseRecordStructure(receipt);
    assertIntentAuthority(repositoryLeaseIntentFromRecord(receipt), input);
    if (receiptPairState(path.join(
        runReceiptDirectory(controlRoot, input.runId), '00-source-lease.json',
    ), receipt) !== 'sealed') fail('repository lease receipt is not sealed');
    return receipt;
}

function readActiveIntent(input: LeaseAuthorityInput, allowUnsealedRelease = false): RepositoryLeaseIntent {
    const repoRoot = repositoryRoot(input.repoRoot);
    const intent = readJson<RepositoryLeaseIntent>(lockPath(repoRoot));
    validateRepositoryLeaseIntent(intent);
    assertIntentAuthority(intent, input);
    const releaseState = receiptPairState(releaseReceiptPath(intent.control_root, intent.run_id));
    if (releaseState === 'sealed' || (releaseState === 'body-only' && !allowUnsealedRelease)) {
        fail('repository lease has a terminal release receipt');
    }
    return intent;
}

function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function unlinkOwnedJson(file: string, expected: fs.BigIntStats, idKey: string, id: string): void {
    const current = fs.lstatSync(file, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || !sameInode(current, expected)) {
        fail(`owned durable file changed before cleanup: ${file}`);
    }
    const value = readJson<Record<string, unknown>>(file);
    if (value[idKey] !== id) fail(`owned durable file identity changed before cleanup: ${file}`);
    const finalCheck = fs.lstatSync(file, { bigint: true });
    if (!sameInode(finalCheck, expected)) fail(`owned durable file was replaced before cleanup: ${file}`);
    fs.unlinkSync(file);
    fsyncDirectory(path.dirname(file));
}

export function acquireRepositoryLease(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    resumeToken: string;
    hostname?: string;
}): OwnedRepositoryLease {
    assertRunId(input.runId);
    assertResumeToken(input.resumeToken);
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const controlRoot = ensureDirectoryNoFollow(path.resolve(input.controlRoot));
    assertSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
    const receiptDirectory = ensureDirectoryNoFollow(runReceiptDirectory(controlRoot, input.runId));
    assertSeparated(receiptDirectory, repoRoot, commonDirectory, 'receipt directory');
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);

    if (fileExists(operationLockPath(repoRoot))) fail('repository operation recovery is required before acquisition');
    if (fileExists(releaseReceiptPath(controlRoot, input.runId))) fail('run already has a terminal release receipt');

    const receiptFile = path.join(receiptDirectory, '00-source-lease.json');
    let existingRecord: RepositoryLeaseRecord | undefined;
    if (fileExists(receiptFile)) {
        existingRecord = readJson<RepositoryLeaseRecord>(receiptFile);
        verifyRepositoryLeaseRecordStructure(existingRecord);
    }
    const expectedScope = {
        run_id: input.runId,
        repository_root: repoRoot,
        git_common_directory: commonDirectory,
        control_root: controlRoot,
        governed_paths: governedPaths,
        resume_token_sha256: sha256(input.resumeToken),
    };
    let intent: RepositoryLeaseIntent = existingRecord ? repositoryLeaseIntentFromRecord(existingRecord) : {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        lease_id: randomUUID(),
        ...expectedScope,
        owner: { pid: process.pid, hostname: input.hostname ?? process.env.HOSTNAME ?? 'unreported' },
        acquired_at: new Date().toISOString(),
    };
    const assertExpected = (candidate: RepositoryLeaseIntent): void => {
        validateRepositoryLeaseIntent(candidate);
        for (const [key, expected] of Object.entries(expectedScope)) {
            if (canonicalJson(candidate[key as keyof RepositoryLeaseIntent]) !== canonicalJson(expected)) {
                fail('repository lease belongs to a different acquisition request');
            }
        }
    };
    assertExpected(intent);

    const file = lockPath(repoRoot);
    if (fileExists(file)) {
        const active = readJson<RepositoryLeaseIntent>(file);
        assertExpected(active);
        intent = active;
    } else {
        try {
            writeImmutableJson(file, intent);
        } catch (error) {
            if (!fileExists(file)) throw error;
            const winner = readJson<RepositoryLeaseIntent>(file);
            assertExpected(winner);
            intent = winner;
        }
    }
    if (existingRecord && canonicalJson(repositoryLeaseIntentFromRecord(existingRecord)) !== canonicalJson(intent)) {
        fail('repository lease intent conflicts with its source receipt');
    }
    if (fileExists(operationLockPath(repoRoot))) fail('repository operation began during acquisition');

    const attestation = attestSource(repoRoot, governedPaths, 'source');
    const record: RepositoryLeaseRecord = {
        ...intent,
        source_head: attestation.head,
        source_manifest: attestation.manifest,
    };
    const persisted = writeImmutableJson(receiptFile, record);
    const durable = readJson<RepositoryLeaseRecord>(receiptFile);
    verifyRepositoryLeaseRecordStructure(durable);
    if (canonicalJson(durable) !== canonicalJson(record)) fail('repository lease source receipt conflicts');
    const post = attestSource(repoRoot, governedPaths, durable.source_manifest.root_label);
    if (post.head !== durable.source_head || canonicalJson(post.manifest) !== canonicalJson(durable.source_manifest)) {
        fail('repository source changed before lease seal');
    }
    sealReceipt(receiptFile, durable);
    return { record: durable, lock_file: file, created: persisted.created };
}

export function verifyRepositoryLease(
    input: LeaseAuthorityInput,
    allowUnsealedRelease = false,
): RepositoryLeaseRecord {
    const record = readAuthorizedReceipt(input);
    const intent = readActiveIntent(input, allowUnsealedRelease);
    if (canonicalJson(repositoryLeaseIntentFromRecord(record)) !== canonicalJson(intent)) {
        fail('repository lease receipt does not match the active intent');
    }
    const attestation = attestSource(
        record.repository_root,
        record.governed_paths,
        record.source_manifest.root_label,
    );
    if (record.source_head !== attestation.head
        || canonicalJson(record.source_manifest) !== canonicalJson(attestation.manifest)) {
        fail('repository source attestation changed while leased');
    }
    return record;
}

function operationOwner(hostname?: string): LeaseOwner {
    return { pid: process.pid, hostname: hostname ?? process.env.HOSTNAME ?? 'unreported' };
}

function validateOperation(record: RepositoryOperationRecord): void {
    assertExactObjectKeys(record, [
        'schema_version', 'runner_version', 'operation_id', 'lease_id', 'run_id',
        'receipt_name', 'resume_token_sha256', 'owner', 'acquired_at',
    ], 'repository operation');
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || !/^[a-f0-9-]{36}$/.test(record.operation_id)
        || !/^[a-f0-9-]{36}$/.test(record.lease_id)
        || !/^(00-source-lease|10-packet|20-ratings|25-mapping-reveal|30-decision|40-publication|50-source-release)\.json$/.test(record.receipt_name)) {
        fail('repository operation identity is invalid');
    }
    assertRunId(record.run_id);
    assertSha256(record.resume_token_sha256, 'repository operation resume token');
    assertLeaseOwner(record.owner, 'repository operation owner');
}

function createOperationGuard(record: RepositoryLeaseRecord, receiptFile: string): {
    file: string;
    record: RepositoryOperationRecord;
    stat: fs.BigIntStats;
} {
    const file = operationLockPath(record.repository_root);
    const operation: RepositoryOperationRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_id: randomUUID(),
        lease_id: record.lease_id,
        run_id: record.run_id,
        receipt_name: path.basename(receiptFile),
        resume_token_sha256: record.resume_token_sha256,
        owner: operationOwner(),
        acquired_at: new Date().toISOString(),
    };
    validateOperation(operation);
    try {
        writeImmutableJson(file, operation);
    } catch (error) {
        if (fileExists(file)) fail('repository operation is already active; explicit recovery may be required');
        throw error;
    }
    return { file, record: operation, stat: fs.lstatSync(file, { bigint: true }) };
}

export function withRepositoryLeaseOperation<T>(
    input: LeaseAuthorityInput,
    receiptFile: string,
    prepare: (record: RepositoryLeaseRecord) => () => T,
): T {
    const before = verifyRepositoryLease(input);
    const guard = createOperationGuard(before, receiptFile);
    try {
        const active = verifyRepositoryLease(input);
        if (active.lease_id !== before.lease_id) fail('repository lease changed before the operation');
        const commit = prepare(before);
        const after = verifyRepositoryLease(input);
        if (after.lease_id !== before.lease_id) fail('repository lease changed during the operation');
        const result = commit();
        const committed = verifyRepositoryLease(input, path.basename(receiptFile) === '50-source-release.json');
        if (committed.lease_id !== before.lease_id) fail('repository lease changed after receipt commit');
        sealReceipt(receiptFile, committed);
        return result;
    } finally {
        unlinkOwnedJson(guard.file, guard.stat, 'operation_id', guard.record.operation_id);
    }
}

function processDefinitelyDead(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return false;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
}

export function recoverRepositoryLeaseOperation(input: LeaseAuthorityInput & { hostname?: string }): {
    recovered: boolean;
    operation?: RepositoryOperationRecord;
} {
    const receipt = readAuthorizedReceipt(input);
    const file = operationLockPath(receipt.repository_root);
    if (!fileExists(file)) return { recovered: false };
    const operation = readJson<RepositoryOperationRecord>(file);
    validateOperation(operation);
    if (operation.lease_id !== receipt.lease_id
        || operation.run_id !== receipt.run_id
        || operation.resume_token_sha256 !== receipt.resume_token_sha256) {
        fail('repository operation does not belong to the authorized lease');
    }
    const currentHostname = input.hostname ?? process.env.HOSTNAME ?? 'unreported';
    if (operation.owner.hostname !== currentHostname) fail('cross-host operation recovery is not automatic');
    if (!processDefinitelyDead(operation.owner.pid)) fail('repository operation owner is still alive');
    const receiptFile = path.join(runReceiptDirectory(receipt.control_root, receipt.run_id), operation.receipt_name);
    if (receiptPairState(receiptFile, receipt) !== 'sealed') {
        verifyRepositoryLease(input, operation.receipt_name === '50-source-release.json');
    }
    const stat = fs.lstatSync(file, { bigint: true });
    unlinkOwnedJson(file, stat, 'operation_id', operation.operation_id);
    return { recovered: true, operation };
}

export function releaseRepositoryLease(input: LeaseAuthorityInput & {
    disposition: RepositoryLeaseDisposition;
}): { record: RepositoryLeaseRecord; release: RepositoryLeaseReleaseRecord; created: boolean } {
    const record = readAuthorizedReceipt(input);
    const release: RepositoryLeaseReleaseRecord = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: record.run_id,
        lease_id: record.lease_id,
        resume_token_sha256: record.resume_token_sha256,
        disposition: input.disposition,
        terminal_state: input.disposition === 'completed' ? 'RELEASED' : 'ABORTED',
    };
    verifyRepositoryLeaseReleaseStructure(release);
    const releaseFile = releaseReceiptPath(record.control_root, record.run_id);
    const releaseState = receiptPairState(releaseFile, record);
    const bodyCommitted = releaseState !== 'absent';
    const alreadySealed = releaseState === 'sealed';
    if (bodyCommitted) {
        const durable = readJson<RepositoryLeaseReleaseRecord>(releaseFile);
        verifyRepositoryLeaseReleaseStructure(durable);
        if (canonicalJson(durable) !== canonicalJson(release)) fail('repository release replay conflicts');
    }
    const operationFile = operationLockPath(record.repository_root);
    if (fileExists(operationFile)) {
        recoverRepositoryLeaseOperation(input);
    }
    const anchor = lockPath(record.repository_root);
    if (!fileExists(anchor)) {
        if (!alreadySealed) fail('active repository lease intent is missing');
        return { record, release, created: false };
    }
    if (input.disposition === 'completed') {
        const publication = path.join(runReceiptDirectory(record.control_root, record.run_id), '40-publication.json');
        if (receiptPairState(publication, record) !== 'sealed') {
            fail('completed release requires a durable publication receipt');
        }
    }

    let active: RepositoryLeaseRecord;
    if (alreadySealed) {
        const intent = readJson<RepositoryLeaseIntent>(anchor);
        validateRepositoryLeaseIntent(intent);
        assertIntentAuthority(intent, input);
        if (canonicalJson(repositoryLeaseIntentFromRecord(record)) !== canonicalJson(intent)) {
            fail('terminal release does not match the remaining lease intent');
        }
        active = record;
    } else {
        active = verifyRepositoryLease(input, bodyCommitted);
    }
    const guard = createOperationGuard(active, releaseFile);
    try {
        const intent = alreadySealed
            ? readJson<RepositoryLeaseIntent>(anchor)
            : readActiveIntent(input, bodyCommitted);
        validateRepositoryLeaseIntent(intent);
        if (intent.lease_id !== active.lease_id) fail('repository lease changed before release');
        if (!alreadySealed && verifyRepositoryLease(input, bodyCommitted).lease_id !== active.lease_id) {
            fail('repository source changed before release commit');
        }
        const persisted = writeImmutableJson(releaseFile, release);
        if (!alreadySealed) {
            const committed = verifyRepositoryLease(input, true);
            if (committed.lease_id !== active.lease_id) fail('repository source changed after release receipt commit');
            sealReceipt(releaseFile, committed);
        }
        const anchorStat = fs.lstatSync(anchor, { bigint: true });
        unlinkOwnedJson(anchor, anchorStat, 'lease_id', active.lease_id);
        return { record, release, created: persisted.created };
    } finally {
        unlinkOwnedJson(guard.file, guard.stat, 'operation_id', guard.record.operation_id);
    }
}
