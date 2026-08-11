import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    EXPERIMENT_CLAIM_RUNNER,
    EXPERIMENT_CLAIM_SCHEMA,
    buildExperimentClaimV22,
    deriveExperimentClaimPaths,
    experimentClaimContent,
    experimentClaimRecoveryTarget,
    prepareExperimentClaimNamespace,
    preflightExperimentClaim,
    verifyExperimentClaim,
    type ExperimentClaimV22,
} from '../../../src/core/council_autoresearch/experiment_claim.js';
import { atomicPrivateTemporaryPath } from '../../../src/core/council_autoresearch/repository_private_file.js';
import { cleanup, temporary } from './test_helpers.js';

afterEach(cleanup);

const EXPERIMENT = 'a'.repeat(64);
const PACKET = 'b'.repeat(64);
const SOURCE_LEASE = 'c'.repeat(64);
const LEASE = '00000000-0000-4000-8000-000000000111';
const OPERATION = '00000000-0000-4000-8000-000000000222';

function expected(overrides: Partial<{
    experimentSha256: string;
    runId: string;
    leaseId: string;
    packetSha256: string;
    sourceLeaseSha256: string;
}> = {}): ExperimentClaimV22 {
    return buildExperimentClaimV22({
        experimentSha256: EXPERIMENT,
        runId: 'council-claim-run-1',
        leaseId: LEASE,
        packetSha256: PACKET,
        sourceLeaseSha256: SOURCE_LEASE,
        ...overrides,
    });
}

function control(label: string): string {
    return temporary(label);
}

function privateJson(file: string, value: unknown): void {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
}

function prepare(controlRoot: string, claim = expected()) {
    return prepareExperimentClaimNamespace(controlRoot, claim.experiment_sha256);
}

function legacyDirectory(controlRoot: string): string {
    const directory = path.join(controlRoot, 'council-autoresearch', 'experiments');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(path.join(controlRoot, 'council-autoresearch'), 0o700);
    fs.chmodSync(directory, 0o700);
    return directory;
}

describe('schema-2.2 experiment claim namespace', () => {
    it('derives the exact sharded path and builds the exact frozen claim schema', () => {
        const controlRoot = control('cstar-experiment-claim-path-');
        const claim = expected();
        const paths = deriveExperimentClaimPaths(controlRoot, EXPERIMENT);

        assert.equal(paths.claimFile, path.join(
            controlRoot,
            'council-autoresearch',
            'experiments',
            'by-sha256',
            'aa',
            'aa',
            EXPERIMENT,
            'claim.json',
        ));
        assert.equal(paths.legacyFile, path.join(
            controlRoot, 'council-autoresearch', 'experiments', `${EXPERIMENT}.json`,
        ));
        assert.deepEqual(Object.keys(claim).sort(), [
            'experiment_sha256', 'lease_id', 'packet_sha256', 'run_id',
            'runner_version', 'schema_version', 'source_lease_sha256',
        ]);
        assert.equal(claim.schema_version, EXPERIMENT_CLAIM_SCHEMA);
        assert.equal(claim.runner_version, EXPERIMENT_CLAIM_RUNNER);
        assert.equal(Object.isFrozen(claim), true);
        assert.throws(
            () => deriveExperimentClaimPaths(controlRoot, EXPERIMENT.toUpperCase()),
            /lowercase SHA-256/i,
        );
        assert.throws(
            () => expected({ leaseId: 'not-a-lease' }),
            /identity is invalid/i,
        );
    });

    it('keeps absent preflight and verification read-only, then prepares exact private directories', () => {
        const controlRoot = control('cstar-experiment-claim-prepare-');
        const claim = expected();
        assert.deepEqual(preflightExperimentClaim({ controlRoot, expected: claim }), {
            state: 'absent',
        });
        assert.throws(
            () => verifyExperimentClaim({ controlRoot, expected: claim }),
            /claim is missing/i,
        );
        assert.equal(fs.existsSync(path.join(controlRoot, 'council-autoresearch')), false);
        assert.throws(() => experimentClaimRecoveryTarget({
            controlRoot,
            experimentSha256: EXPERIMENT,
            ownerPid: process.pid,
            operationId: OPERATION,
        }), /recovery namespace is missing/i);
        assert.equal(fs.existsSync(path.join(controlRoot, 'council-autoresearch')), false);

        const paths = prepare(controlRoot, claim);
        const directories = [
            paths.councilRoot, paths.experimentsRoot, paths.digestRoot,
            paths.firstShard, paths.secondShard, paths.claimDirectory,
        ];
        const inodes = directories.map((directory) => {
            const stat = fs.lstatSync(directory, { bigint: true });
            assert.equal(stat.isDirectory(), true);
            assert.equal(stat.isSymbolicLink(), false);
            assert.equal(Number(stat.mode) & 0o7777, 0o700);
            assert.equal(stat.uid, BigInt(process.getuid!()));
            assert.equal(fs.realpathSync(directory), directory);
            return stat.ino;
        });
        assert.equal(fs.existsSync(paths.claimFile), false);
        prepare(controlRoot, claim);
        assert.deepEqual(
            directories.map((directory) => fs.lstatSync(directory, { bigint: true }).ino),
            inodes,
        );
    });

    it('rejects same-depth namespace replacement during absent preflight', () => {
        const controlRoot = control('cstar-experiment-claim-prefix-race-');
        const paths = deriveExperimentClaimPaths(controlRoot, EXPERIMENT);
        fs.mkdirSync(paths.experimentsRoot, { recursive: true, mode: 0o700 });
        fs.chmodSync(paths.councilRoot, 0o700);
        fs.chmodSync(paths.experimentsRoot, 0o700);
        const originalInode = fs.lstatSync(paths.experimentsRoot, { bigint: true }).ino;
        const displaced = path.join(paths.councilRoot, 'experiments-displaced');
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.lstatSync;
        let injected = false;
        mutable.lstatSync = ((...args: unknown[]) => {
            if (!injected && path.resolve(String(args[0])) === paths.legacyFile) {
                injected = true;
                fs.renameSync(paths.experimentsRoot, displaced);
                fs.mkdirSync(paths.experimentsRoot, { mode: 0o700 });
            }
            return Reflect.apply(original, mutable, args);
        }) as typeof fs.lstatSync;
        syncBuiltinESMExports();
        try {
            assert.throws(
                () => preflightExperimentClaim({ controlRoot, expected: expected() }),
                /namespace changed during preflight/i,
            );
        } finally {
            mutable.lstatSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        assert.notEqual(
            fs.lstatSync(paths.experimentsRoot, { bigint: true }).ino,
            originalInode,
        );
        assert.equal(fs.existsSync(displaced), true);
        assert.equal(fs.existsSync(paths.digestRoot), false);
    });

    it('replays safely after a directory fsync interruption', () => {
        const controlRoot = control('cstar-experiment-claim-fsync-');
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.fsyncSync;
        let injected = false;
        mutable.fsyncSync = ((descriptor: number) => {
            if (!injected && fs.fstatSync(descriptor).isDirectory()
                && fs.existsSync(path.join(controlRoot, 'council-autoresearch'))) {
                injected = true;
                throw new Error('injected namespace fsync interruption');
            }
            return original(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(
                () => prepare(controlRoot),
                /injected namespace fsync interruption/i,
            );
        } finally {
            mutable.fsyncSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        const paths = prepare(controlRoot);
        assert.equal(fs.existsSync(paths.claimDirectory), true);
        assert.equal(fs.existsSync(paths.claimFile), false);
    });

    it('recognizes byte-exact replay and rejects a different run without changing the claim', () => {
        const controlRoot = control('cstar-experiment-claim-replay-');
        const claim = expected();
        const paths = prepare(controlRoot, claim);
        fs.writeFileSync(paths.claimFile, experimentClaimContent(claim), { mode: 0o600 });
        fs.chmodSync(paths.claimFile, 0o600);
        const before = fs.readFileSync(paths.claimFile);

        const replay = preflightExperimentClaim({ controlRoot, expected: claim });
        assert.equal(replay.state, 'exact-replay');
        assert.deepEqual(verifyExperimentClaim({ controlRoot, expected: claim }), {
            claim_sha256: replay.state === 'exact-replay' ? replay.claim_sha256 : '',
        });
        assert.throws(
            () => preflightExperimentClaim({
                controlRoot,
                expected: expected({ runId: 'council-claim-run-2' }),
            }),
            /already claimed by a different run/i,
        );
        assert.deepEqual(fs.readFileSync(paths.claimFile), before);
    });

    it('fails closed when a foreign leaf artifact appears during claim inspection', () => {
        const controlRoot = control('cstar-experiment-claim-race-');
        const claim = expected();
        const paths = prepare(controlRoot, claim);
        fs.writeFileSync(paths.claimFile, experimentClaimContent(claim), { mode: 0o600 });
        fs.chmodSync(paths.claimFile, 0o600);
        const foreign = `${paths.claimFile}.tmp-${process.pid}-`
            + '00000000-0000-4000-8000-000000000333';
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.openSync;
        let injected = false;
        mutable.openSync = ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
            if (!injected && path.resolve(String(file)) === paths.claimFile) {
                injected = true;
                fs.writeFileSync(foreign, Buffer.from('{}'), { mode: 0o600 });
            }
            return original(file, flags, mode);
        }) as typeof fs.openSync;
        syncBuiltinESMExports();
        try {
            assert.throws(
                () => preflightExperimentClaim({ controlRoot, expected: claim }),
                /foreign artifact/i,
            );
        } finally {
            mutable.openSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        assert.deepEqual(fs.readFileSync(paths.claimFile), experimentClaimContent(claim));
        assert.equal(fs.existsSync(foreign), true);
    });

    it('blocks a valid legacy flat claim by direct lookup without creating or migrating V22 state', () => {
        const controlRoot = control('cstar-experiment-claim-legacy-');
        const experiments = legacyDirectory(controlRoot);
        const legacy = path.join(experiments, `${EXPERIMENT}.json`);
        privateJson(legacy, {
            schema_version: '2.1.0',
            experiment_sha256: EXPERIMENT,
            run_id: 'council-legacy-run-1',
            packet_sha256: PACKET,
        });
        assert.throws(
            () => preflightExperimentClaim({ controlRoot, expected: expected() }),
            /already claimed by a legacy run/i,
        );
        assert.throws(
            () => prepare(controlRoot),
            /already claimed by a legacy run/i,
        );
        assert.equal(fs.existsSync(path.join(experiments, 'by-sha256')), false);
        assert.equal(fs.existsSync(legacy), true);
    });

    for (const hostile of ['malformed', 'hardlink', 'symlink'] as const) {
        it(`fails closed for a ${hostile} legacy flat claim`, () => {
            const controlRoot = control(`cstar-experiment-claim-legacy-${hostile}-`);
            const experiments = legacyDirectory(controlRoot);
            const legacy = path.join(experiments, `${EXPERIMENT}.json`);
            if (hostile === 'malformed') {
                privateJson(legacy, { schema_version: '2.1.0', experiment_sha256: EXPERIMENT });
            } else {
                const source = path.join(controlRoot, `legacy-${hostile}.json`);
                privateJson(source, {
                    schema_version: '2.1.0', experiment_sha256: EXPERIMENT,
                    run_id: 'council-legacy-run-1', packet_sha256: PACKET,
                });
                if (hostile === 'hardlink') fs.linkSync(source, legacy);
                else fs.symlinkSync(source, legacy);
            }
            assert.throws(
                () => preflightExperimentClaim({ controlRoot, expected: expected() }),
                /legacy experiment claim|ELOOP|symbolic/i,
            );
            assert.equal(fs.existsSync(legacy), true);
            assert.equal(fs.existsSync(path.join(experiments, 'by-sha256')), false);
        });
    }

    it('rejects hostile V22 directory, file mode, links, and symlinks without mutation', () => {
        for (const hostile of [
            'public-leaf', 'nonexact-leaf', 'public-file', 'hardlink', 'symlink',
        ] as const) {
            const controlRoot = control(`cstar-experiment-claim-v22-${hostile}-`);
            const paths = prepare(controlRoot);
            if (hostile === 'public-leaf') {
                fs.chmodSync(paths.claimDirectory, 0o755);
            } else if (hostile === 'nonexact-leaf') {
                fs.chmodSync(paths.claimDirectory, 0o500);
            } else if (hostile === 'public-file') {
                fs.writeFileSync(paths.claimFile, experimentClaimContent(expected()), { mode: 0o644 });
                fs.chmodSync(paths.claimFile, 0o644);
            } else {
                const source = path.join(controlRoot, `claim-${hostile}.json`);
                fs.writeFileSync(source, experimentClaimContent(expected()), { mode: 0o600 });
                fs.chmodSync(source, 0o600);
                if (hostile === 'hardlink') fs.linkSync(source, paths.claimFile);
                else fs.symlinkSync(source, paths.claimFile);
            }
            assert.throws(
                () => preflightExperimentClaim({ controlRoot, expected: expected() }),
                /private|experiment claim|symbolic|regular file/i,
            );
            assert.equal(
                fs.existsSync(paths.claimFile),
                !['public-leaf', 'nonexact-leaf'].includes(hostile),
            );
        }

        const controlRoot = control('cstar-experiment-claim-segment-symlink-');
        const outside = control('cstar-experiment-claim-outside-');
        const council = path.join(controlRoot, 'council-autoresearch');
        fs.mkdirSync(council, { mode: 0o700 });
        fs.symlinkSync(outside, path.join(council, 'experiments'));
        assert.throws(
            () => preflightExperimentClaim({ controlRoot, expected: expected() }),
            /real directory|symbolic/i,
        );
        assert.deepEqual(fs.readdirSync(outside), []);
    });

    it('allows only the exact operation temporary in the bounded claim leaf', () => {
        const controlRoot = control('cstar-experiment-claim-temporary-');
        const paths = prepare(controlRoot);
        const exactTemporary = atomicPrivateTemporaryPath(
            paths.claimFile,
            process.pid,
            OPERATION,
        );
        fs.writeFileSync(exactTemporary, Buffer.from('{'), { mode: 0o600 });
        const target = experimentClaimRecoveryTarget({
            controlRoot,
            experimentSha256: EXPERIMENT,
            ownerPid: process.pid,
            operationId: OPERATION,
        });
        assert.deepEqual(target, {
            file: paths.claimFile,
            directory: paths.claimDirectory,
            label: 'experiment claim',
        });
        assert.throws(
            () => preflightExperimentClaim({ controlRoot, expected: expected() }),
            /foreign artifact/i,
        );

        const foreign = `${paths.claimFile}.tmp-${process.pid}-`
            + '00000000-0000-4000-8000-000000000333';
        fs.writeFileSync(foreign, Buffer.from('{}'), { mode: 0o600 });
        assert.throws(() => experimentClaimRecoveryTarget({
            controlRoot,
            experimentSha256: EXPERIMENT,
            ownerPid: process.pid,
            operationId: OPERATION,
        }), /entry limit|foreign artifact/i);
        assert.equal(fs.existsSync(exactTemporary), true);
        assert.equal(fs.existsSync(foreign), true);
    });

    it('does not enumerate a shard parent containing more than 4096 sibling experiments', () => {
        const controlRoot = control('cstar-experiment-claim-scalability-');
        const paths = prepare(controlRoot);
        for (let index = 0; index < 4097; index += 1) {
            fs.mkdirSync(path.join(paths.secondShard, `sibling-${index.toString(16).padStart(4, '0')}`), {
                mode: 0o700,
            });
        }
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.opendirSync;
        let leafScans = 0;
        mutable.opendirSync = ((directory: fs.PathLike, ...args: unknown[]) => {
            if (path.resolve(String(directory)) !== paths.claimDirectory) {
                throw new Error('experiment claim enumerated a parent directory');
            }
            leafScans += 1;
            return original(directory, ...(args as []));
        }) as typeof fs.opendirSync;
        syncBuiltinESMExports();
        try {
            assert.deepEqual(preflightExperimentClaim({
                controlRoot,
                expected: expected(),
            }), { state: 'absent' });
            assert.doesNotThrow(() => experimentClaimRecoveryTarget({
                controlRoot,
                experimentSha256: EXPERIMENT,
                ownerPid: process.pid,
                operationId: OPERATION,
            }));
        } finally {
            mutable.opendirSync = original;
            syncBuiltinESMExports();
        }
        assert.ok(leafScans >= 2);
    });
});
