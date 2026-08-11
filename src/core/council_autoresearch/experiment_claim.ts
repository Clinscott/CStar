import fs from 'node:fs';
import path from 'node:path';

import {
    MAX_JSON_FILE_BYTES,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalPrivateDirectory,
    fail,
    fsyncDirectory,
    sha256,
} from './contracts.js';
import { UUID_V4_PATTERN } from './repository_lease_contract.js';
import {
    atomicPrivateTemporaryPath,
    closeOwnedPrivateFile,
    openPrivateJson,
    optionalStat,
} from './repository_private_file.js';
import type { RepositoryReceiptRecoveryTarget } from './repository_receipt_recovery.js';

export const EXPERIMENT_CLAIM_SCHEMA = '2.2.0' as const;
export const EXPERIMENT_CLAIM_RUNNER = '2.2.0' as const;

export interface ExperimentClaimV22 {
    readonly schema_version: typeof EXPERIMENT_CLAIM_SCHEMA;
    readonly runner_version: typeof EXPERIMENT_CLAIM_RUNNER;
    readonly experiment_sha256: string;
    readonly run_id: string;
    readonly lease_id: string;
    readonly packet_sha256: string;
    readonly source_lease_sha256: string;
}

interface LegacyExperimentClaimV21 {
    schema_version: '2.1.0';
    experiment_sha256: string;
    run_id: string;
    packet_sha256: string;
}

export interface ExperimentClaimPaths {
    readonly controlRoot: string;
    readonly councilRoot: string;
    readonly experimentsRoot: string;
    readonly digestRoot: string;
    readonly firstShard: string;
    readonly secondShard: string;
    readonly claimDirectory: string;
    readonly claimFile: string;
    readonly legacyFile: string;
}

export type ExperimentClaimPreflight =
    | { readonly state: 'absent' }
    | { readonly state: 'exact-replay'; readonly claim_sha256: string };

export interface ExperimentClaimOperationIdentity {
    readonly ownerPid: number;
    readonly operationId: string;
}

const V22_KEYS = Object.freeze([
    'schema_version', 'runner_version', 'experiment_sha256', 'run_id', 'lease_id',
    'packet_sha256', 'source_lease_sha256',
] as const);
const LEGACY_KEYS = Object.freeze([
    'schema_version', 'experiment_sha256', 'run_id', 'packet_sha256',
] as const);
const DIRECTORY_STAT_KEYS = Object.freeze([
    'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
] as const);
const CLAIM_NAME = 'claim.json';
const LEAF_ENTRY_LIMIT = 2;

type DirectoryStat = Readonly<Pick<fs.BigIntStats, typeof DIRECTORY_STAT_KEYS[number]>>;
interface ExistingDirectoryPrefix {
    readonly depth: number;
    readonly stats: readonly DirectoryStat[];
}

function privateDirectory(directory: string, label: string, create = false): string {
    const canonical = canonicalPrivateDirectory(directory, label, create);
    if (canonical !== directory) fail(`${label} is not the exact canonical directory`);
    const stat = fs.lstatSync(canonical, { bigint: true });
    if ((stat.mode & 0o7777n) !== 0o700n) {
        fail(`${label} must have exact mode 0700`);
    }
    return canonical;
}

function directoryStat(directory: string, label: string): DirectoryStat {
    privateDirectory(directory, label);
    const stat = fs.lstatSync(directory, { bigint: true });
    return Object.freeze(Object.fromEntries(
        DIRECTORY_STAT_KEYS.map((key) => [key, stat[key]]),
    )) as unknown as DirectoryStat;
}

function assertSameDirectory(
    expected: DirectoryStat,
    directory: string,
    label: string,
): void {
    const actual = directoryStat(directory, label);
    for (const key of DIRECTORY_STAT_KEYS) {
        if (expected[key] !== actual[key]) fail(`${label} changed while its inventory was read`);
    }
}

function fixedDirectories(paths: ExperimentClaimPaths): readonly string[] {
    return [
        paths.councilRoot,
        paths.experimentsRoot,
        paths.digestRoot,
        paths.firstShard,
        paths.secondShard,
        paths.claimDirectory,
    ];
}

function trackedDirectories(paths: ExperimentClaimPaths): readonly string[] {
    return [paths.controlRoot, ...fixedDirectories(paths)];
}

function snapshotDirectories(paths: ExperimentClaimPaths): readonly DirectoryStat[] {
    return Object.freeze(trackedDirectories(paths).map(
        (directory) => directoryStat(directory, 'experiment claim namespace'),
    ));
}

function assertSameDirectories(
    paths: ExperimentClaimPaths,
    expected: readonly DirectoryStat[],
): void {
    const directories = trackedDirectories(paths);
    if (expected.length !== directories.length) fail('experiment claim namespace is incomplete');
    directories.forEach((directory, index) => {
        assertSameDirectory(expected[index], directory, 'experiment claim namespace');
    });
}

function snapshotExistingDirectoryPrefix(paths: ExperimentClaimPaths): ExistingDirectoryPrefix {
    const directories = fixedDirectories(paths);
    const stats: DirectoryStat[] = [directoryStat(
        paths.controlRoot,
        'experiment claim control root',
    )];
    for (let index = 0; index < directories.length; index += 1) {
        if (optionalStat(directories[index]) === undefined) {
            return Object.freeze({ depth: index, stats: Object.freeze(stats) });
        }
        stats.push(directoryStat(directories[index], 'experiment claim namespace'));
    }
    return Object.freeze({ depth: directories.length, stats: Object.freeze(stats) });
}

function assertSameExistingDirectoryPrefix(
    paths: ExperimentClaimPaths,
    expected: ExistingDirectoryPrefix,
): void {
    const actual = snapshotExistingDirectoryPrefix(paths);
    if (actual.depth !== expected.depth || actual.stats.length !== expected.stats.length) {
        fail('experiment claim namespace changed during preflight');
    }
    for (let index = 0; index < expected.stats.length; index += 1) {
        for (const key of DIRECTORY_STAT_KEYS) {
            if (expected.stats[index][key] !== actual.stats[index][key]) {
                fail('experiment claim namespace changed during preflight');
            }
        }
    }
}

function expectedTemporary(
    paths: ExperimentClaimPaths,
    identity?: ExperimentClaimOperationIdentity,
): string | undefined {
    if (identity === undefined) return undefined;
    return atomicPrivateTemporaryPath(
        paths.claimFile,
        identity.ownerPid,
        identity.operationId,
    );
}

function assertLeafInventory(
    paths: ExperimentClaimPaths,
    identity?: ExperimentClaimOperationIdentity,
): void {
    const before = directoryStat(paths.claimDirectory, 'experiment claim leaf');
    const allowed = new Set([CLAIM_NAME]);
    const temporary = expectedTemporary(paths, identity);
    if (temporary !== undefined) allowed.add(path.basename(temporary));
    const directory = fs.opendirSync(paths.claimDirectory);
    let count = 0;
    try {
        for (;;) {
            const entry = directory.readSync();
            if (entry === null) break;
            count += 1;
            if (count > LEAF_ENTRY_LIMIT) {
                fail('experiment claim leaf exceeds its entry limit');
            }
            if (!allowed.has(entry.name)) {
                fail('experiment claim leaf contains a foreign artifact');
            }
        }
    } finally {
        directory.closeSync();
    }
    assertSameDirectory(before, paths.claimDirectory, 'experiment claim leaf');
}

function validateV22Claim(value: unknown, label: string): asserts value is ExperimentClaimV22 {
    assertExactObjectKeys(value, V22_KEYS, label);
    const claim = value as ExperimentClaimV22;
    if (claim.schema_version !== EXPERIMENT_CLAIM_SCHEMA
        || claim.runner_version !== EXPERIMENT_CLAIM_RUNNER
        || !UUID_V4_PATTERN.test(claim.lease_id)) {
        fail(`${label} identity is invalid`);
    }
    assertSha256(claim.experiment_sha256, `${label}.experiment_sha256`);
    assertRunId(claim.run_id, `${label}.run_id`);
    assertSha256(claim.packet_sha256, `${label}.packet_sha256`);
    assertSha256(claim.source_lease_sha256, `${label}.source_lease_sha256`);
}

function validateLegacyClaim(
    value: unknown,
    experimentSha256: string,
): asserts value is LegacyExperimentClaimV21 {
    assertExactObjectKeys(value, LEGACY_KEYS, 'legacy experiment claim');
    const claim = value as LegacyExperimentClaimV21;
    if (claim.schema_version !== '2.1.0') fail('legacy experiment claim version is invalid');
    assertSha256(claim.experiment_sha256, 'legacy experiment claim identity');
    assertRunId(claim.run_id, 'legacy experiment claim run_id');
    assertSha256(claim.packet_sha256, 'legacy experiment claim packet hash');
    if (claim.experiment_sha256 !== experimentSha256) {
        fail('legacy experiment claim does not match its digest path');
    }
}

function serializeClaim(claim: ExperimentClaimV22): Buffer {
    return Buffer.from(`${JSON.stringify(claim, null, 2)}\n`);
}

function assertNoLegacyClaim(paths: ExperimentClaimPaths): void {
    if (optionalStat(paths.legacyFile) === undefined) return;
    privateDirectory(paths.experimentsRoot, 'legacy experiment claim directory');
    const opened = openPrivateJson<unknown>(
        paths.legacyFile,
        paths.experimentsRoot,
        'legacy experiment claim',
        MAX_JSON_FILE_BYTES,
    );
    try {
        validateLegacyClaim(opened.record, path.basename(paths.legacyFile, '.json'));
    } finally {
        closeOwnedPrivateFile(opened, 'legacy experiment claim');
    }
    fail('experiment identity is already claimed by a legacy run');
}

function openCurrentClaim(paths: ExperimentClaimPaths): Buffer | undefined {
    if (optionalStat(paths.claimFile) === undefined) return undefined;
    const opened = openPrivateJson<unknown>(
        paths.claimFile,
        paths.claimDirectory,
        'experiment claim',
        MAX_JSON_FILE_BYTES,
    );
    try {
        validateV22Claim(opened.record, 'experiment claim');
        if (opened.record.experiment_sha256
            !== path.basename(paths.claimDirectory)) {
            fail('experiment claim does not match its digest path');
        }
        return Buffer.from(opened.content);
    } finally {
        closeOwnedPrivateFile(opened, 'experiment claim');
    }
}

function stableCurrentClaim(paths: ExperimentClaimPaths): Buffer | undefined {
    assertLeafInventory(paths);
    const before = openCurrentClaim(paths);
    assertLeafInventory(paths);
    const after = openCurrentClaim(paths);
    assertLeafInventory(paths);
    if ((before === undefined) !== (after === undefined)
        || (before !== undefined && after !== undefined && !before.equals(after))) {
        fail('experiment claim changed while it was inspected');
    }
    return after;
}

export function deriveExperimentClaimPaths(
    controlRootInput: string,
    experimentSha256: string,
): ExperimentClaimPaths {
    assertSha256(experimentSha256, 'experiment claim digest');
    const controlRoot = privateDirectory(controlRootInput, 'experiment claim control root');
    const councilRoot = path.join(controlRoot, 'council-autoresearch');
    const experimentsRoot = path.join(councilRoot, 'experiments');
    const digestRoot = path.join(experimentsRoot, 'by-sha256');
    const firstShard = path.join(digestRoot, experimentSha256.slice(0, 2));
    const secondShard = path.join(firstShard, experimentSha256.slice(2, 4));
    const claimDirectory = path.join(secondShard, experimentSha256);
    return Object.freeze({
        controlRoot,
        councilRoot,
        experimentsRoot,
        digestRoot,
        firstShard,
        secondShard,
        claimDirectory,
        claimFile: path.join(claimDirectory, CLAIM_NAME),
        legacyFile: path.join(experimentsRoot, `${experimentSha256}.json`),
    });
}

export function buildExperimentClaimV22(input: {
    experimentSha256: string;
    runId: string;
    leaseId: string;
    packetSha256: string;
    sourceLeaseSha256: string;
}): ExperimentClaimV22 {
    const claim = Object.freeze({
        schema_version: EXPERIMENT_CLAIM_SCHEMA,
        runner_version: EXPERIMENT_CLAIM_RUNNER,
        experiment_sha256: input.experimentSha256,
        run_id: input.runId,
        lease_id: input.leaseId,
        packet_sha256: input.packetSha256,
        source_lease_sha256: input.sourceLeaseSha256,
    });
    validateV22Claim(claim, 'expected experiment claim');
    return claim;
}

export function experimentClaimContent(claim: ExperimentClaimV22): Buffer {
    validateV22Claim(claim, 'expected experiment claim');
    return serializeClaim(claim);
}

export function prepareExperimentClaimNamespace(
    controlRoot: string,
    experimentSha256: string,
): ExperimentClaimPaths {
    const paths = deriveExperimentClaimPaths(controlRoot, experimentSha256);
    const existing = snapshotExistingDirectoryPrefix(paths).depth;
    assertNoLegacyClaim(paths);
    if (existing === fixedDirectories(paths).length) assertLeafInventory(paths);
    for (const directory of fixedDirectories(paths)) {
        privateDirectory(directory, 'experiment claim namespace', true);
    }
    const prepared = snapshotDirectories(paths);
    for (const directory of [...fixedDirectories(paths)].reverse()) {
        fsyncDirectory(directory);
    }
    fsyncDirectory(paths.controlRoot);
    if (snapshotExistingDirectoryPrefix(paths).depth !== fixedDirectories(paths).length) {
        fail('experiment claim namespace preparation is incomplete');
    }
    assertLeafInventory(paths);
    assertNoLegacyClaim(paths);
    assertSameDirectories(paths, prepared);
    return paths;
}

export function preflightExperimentClaim(input: {
    controlRoot: string;
    expected: ExperimentClaimV22;
}): ExperimentClaimPreflight {
    validateV22Claim(input.expected, 'expected experiment claim');
    const paths = deriveExperimentClaimPaths(
        input.controlRoot,
        input.expected.experiment_sha256,
    );
    const prefix = snapshotExistingDirectoryPrefix(paths);
    assertNoLegacyClaim(paths);
    if (prefix.depth !== fixedDirectories(paths).length) {
        assertSameExistingDirectoryPrefix(paths, prefix);
        assertNoLegacyClaim(paths);
        assertSameExistingDirectoryPrefix(paths, prefix);
        return Object.freeze({ state: 'absent' });
    }
    const directories = snapshotDirectories(paths);
    const actual = stableCurrentClaim(paths);
    assertNoLegacyClaim(paths);
    assertSameDirectories(paths, directories);
    if (actual === undefined) return Object.freeze({ state: 'absent' });
    const expectedContent = serializeClaim(input.expected);
    if (!actual.equals(expectedContent)) {
        fail('experiment identity is already claimed by a different run');
    }
    return Object.freeze({
        state: 'exact-replay',
        claim_sha256: sha256(actual),
    });
}

export function verifyExperimentClaim(input: {
    controlRoot: string;
    expected: ExperimentClaimV22;
}): { readonly claim_sha256: string } {
    const result = preflightExperimentClaim(input);
    if (result.state !== 'exact-replay') fail('experiment claim is missing');
    return Object.freeze({ claim_sha256: result.claim_sha256 });
}

export function experimentClaimRecoveryTarget(input: {
    controlRoot: string;
    experimentSha256: string;
    ownerPid: number;
    operationId: string;
}): RepositoryReceiptRecoveryTarget {
    const paths = deriveExperimentClaimPaths(input.controlRoot, input.experimentSha256);
    const identity = Object.freeze({
        ownerPid: input.ownerPid,
        operationId: input.operationId,
    });
    expectedTemporary(paths, identity);
    const existing = snapshotExistingDirectoryPrefix(paths).depth;
    assertNoLegacyClaim(paths);
    if (existing !== fixedDirectories(paths).length) {
        fail('experiment claim recovery namespace is missing');
    }
    const directories = snapshotDirectories(paths);
    assertLeafInventory(paths, identity);
    assertNoLegacyClaim(paths);
    if (snapshotExistingDirectoryPrefix(paths).depth !== existing) {
        fail('experiment claim recovery namespace changed');
    }
    assertLeafInventory(paths, identity);
    assertSameDirectories(paths, directories);
    return Object.freeze({
        file: paths.claimFile,
        directory: paths.claimDirectory,
        label: 'experiment claim',
    });
}
