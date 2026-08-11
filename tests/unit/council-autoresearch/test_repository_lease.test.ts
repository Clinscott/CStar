import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    assertCouncilRuntimePlatform,
    buildArtifactManifest,
    councilRunStatus,
    currentOperationOwner,
    evaluateCouncilRatings,
    freezeCouncilPacket,
    freezeMappingReveal,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    recoverRepositoryLeaseOperation,
    releaseRepositoryLease,
    sha256,
    sha256File,
    verifyArtifactManifest,
    verifyPublication,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture,
    cleanup,
    git,
    provisionTrustPolicy,
    repository,
    resumeToken,
    signedRatings,
    temporary,
    writeJson,
} from './test_helpers.js';

afterEach(cleanup);

describe('Council autoresearch source lease and artifact manifests', () => {
    it('requires the exact worktree top-level and a trusted absolute Git executable', () => {
        const repo = repository();
        assert.throws(() => acquireRepositoryLease({
            repoRoot: path.join(repo, 'src'),
            controlRoot: temporary('cstar-council-control-'),
            runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'),
            governedPaths: ['site.txt'],
        }), /Git worktree top-level/i);

        const fakeBin = temporary('cstar-council-fake-git-');
        const fakeGit = path.join(fakeBin, 'git');
        fs.writeFileSync(fakeGit, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
        const previousPath = process.env.PATH;
        process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
        try {
            const control = temporary('cstar-council-control-');
            const lease = acquireRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: 'council-test-run-2',
                resumeToken: resumeToken('council-test-run-2'),
                governedPaths: ['src'],
            });
            releaseRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: lease.record.run_id,
                resumeToken: resumeToken(lease.record.run_id),
            });
        } finally {
            if (previousPath === undefined) delete process.env.PATH;
            else process.env.PATH = previousPath;
        }
    });

    it('rejects inherited Git topology overrides before lease effects', () => {
        const repo = repository();
        for (const name of ['GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
            const previous = process.env[name];
            process.env[name] = path.join(repo, `attacker-${name.toLowerCase()}`);
            try {
                assert.throws(() => acquireRepositoryLease({
                    repoRoot: repo,
                    controlRoot: temporary('cstar-council-control-'),
                    runId: `council-${name.toLowerCase()}-test`,
                    resumeToken: resumeToken(`council-${name.toLowerCase()}-test`),
                    governedPaths: ['src'],
                }), new RegExp(`ambient Git topology override.*${name}`, 'i'));
            } finally {
                if (previous === undefined) delete process.env[name];
                else process.env[name] = previous;
            }
        }
    });

    it('keeps an acquired lock when contenders and wrong-root tokens fail', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('council-test-run-1');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1',
            resumeToken: token, governedPaths: ['src'],
        });
        assert.equal('resume_token' in lease, false);
        assert.equal(JSON.stringify(lease).includes(token), false);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-contender-'),
            runId: 'council-test-run-2',
            resumeToken: resumeToken('council-test-run-2'),
            governedPaths: ['src'],
        }), /EEXIST|exist|lock|identity|control|token/i);
        const commonDirectory = fs.realpathSync(path.resolve(
            repo, git(repo, ['rev-parse', '--git-common-dir']),
        ));
        assert.equal(fs.existsSync(path.join(
            commonDirectory,
            'cstar-council-autoresearch.lock.operation',
        )), false);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }));
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-wrong-control-'),
            runId: lease.record.run_id,
            resumeToken: token,
        }), /identity|control/i);
        assert.throws(() => releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: resumeToken('wrong-release-token'),
        }), /token/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'drift\n');
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }), /uncommitted|mismatch|differ from HEAD/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        });
    });

    it('requires explicit recovery of an exact definitely-dead operation guard', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('council-test-run-1');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1',
            resumeToken: token, governedPaths: ['src'],
        });
        const commonDirectory = fs.realpathSync(path.resolve(
            repo, git(repo, ['rev-parse', '--git-common-dir']),
        ));
        const guard = path.join(commonDirectory, 'cstar-council-autoresearch.lock.operation');
        const claim = `${guard}.recovery-claim`;
        const currentOwner = currentOperationOwner();
        const record = (owner: ReturnType<typeof currentOperationOwner>) => ({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            operation_kind: 'lease-command',
            operation_id: '00000000-0000-4000-8000-000000000001',
            lease_id: lease.record.lease_id,
            run_id: lease.record.run_id,
            resume_token_sha256: sha256(token),
            owner,
            acquired_at: new Date().toISOString(),
        });
        const recoveryInput = {
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: token,
        };
        const staleOwner = {
            ...currentOwner,
            process_start_ticks: (BigInt(currentOwner.process_start_ticks) + 1n).toString(),
        };
        const recoveryOwnerFile = `${guard}.recovery-owner`;
        const recoveryOwnerRecord = (owner: ReturnType<typeof currentOperationOwner>) => ({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            recovery_id: '00000000-0000-4000-8000-000000000002',
            target: {
                operation_kind: 'lease-command',
                operation_id: '00000000-0000-4000-8000-000000000001',
                guard_sha256: '0'.repeat(64),
                guard_device: '1',
                guard_inode: '1',
            },
            owner,
            acquired_at: new Date().toISOString(),
        });
        fs.writeFileSync(guard, `${JSON.stringify(record(currentOwner), null, 2)}\n`, { mode: 0o600 });
        assert.throws(() => releaseRepositoryLease(recoveryInput), /explicit recovery is required/i);
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /operation is active/i);
        assert.equal(fs.existsSync(guard), true);
        fs.unlinkSync(guard);

        fs.writeFileSync(
            recoveryOwnerFile,
            `${JSON.stringify(recoveryOwnerRecord(currentOwner), null, 2)}\n`,
            { mode: 0o600 },
        );
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /recovery is active/i);
        assert.throws(() => releaseRepositoryLease(recoveryInput), /recovery claim requires explicit completion/i);
        assert.equal(fs.existsSync(recoveryOwnerFile), true);
        fs.unlinkSync(recoveryOwnerFile);

        fs.writeFileSync(
            recoveryOwnerFile,
            `${JSON.stringify(recoveryOwnerRecord(staleOwner), null, 2)}\n`,
            { mode: 0o600 },
        );
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /interrupted.*operator investigation/i);
        assert.equal(fs.existsSync(recoveryOwnerFile), true);
        fs.unlinkSync(recoveryOwnerFile);

        fs.writeFileSync(guard, `${JSON.stringify({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            lease_id: lease.record.lease_id,
            run_id: lease.record.run_id,
            resume_token_sha256: sha256(token),
            owner: { pid: process.pid, hostname: currentOwner.hostname },
            acquired_at: new Date().toISOString(),
        }, null, 2)}\n`, { mode: 0o600 });
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /guard kind|unexpected or missing fields/i);
        assert.equal(fs.existsSync(guard), true);
        fs.unlinkSync(guard);

        const stale = record(staleOwner);
        fs.writeFileSync(guard, `${JSON.stringify({
            ...stale,
            lease_id: '00000000-0000-4000-8000-000000000099',
        }, null, 2)}\n`, { mode: 0o600 });
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /does not bind the authorized lease/i);
        assert.equal(fs.existsSync(guard), true);
        fs.unlinkSync(guard);

        fs.writeFileSync(guard, `${JSON.stringify(stale, null, 2)}\n`, { mode: 0o600 });
        const unexplainedAlias = `${guard}.unexplained-alias`;
        fs.linkSync(guard, unexplainedAlias);
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /publication state is ambiguous/i);
        assert.equal(fs.existsSync(guard), true);
        fs.unlinkSync(unexplainedAlias);

        fs.chmodSync(guard, 0o644);
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /exact private.*owned/i);
        assert.equal(fs.existsSync(guard), true);
        fs.chmodSync(guard, 0o600);

        fs.linkSync(guard, claim);
        fs.unlinkSync(guard);
        fs.writeFileSync(guard, `${JSON.stringify(record(currentOwner), null, 2)}\n`, { mode: 0o600 });
        const interrupted = recoverRepositoryLeaseOperation(recoveryInput);
        assert.equal(interrupted.recovered, true);
        assert.equal(fs.existsSync(claim), false);
        assert.equal(fs.existsSync(guard), true);
        assert.throws(() => recoverRepositoryLeaseOperation(recoveryInput), /operation is active/i);
        fs.unlinkSync(guard);

        fs.writeFileSync(guard, `${JSON.stringify(stale, null, 2)}\n`, { mode: 0o600 });
        assert.throws(() => releaseRepositoryLease(recoveryInput), /explicit recovery is required/i);
        const recovered = recoverRepositoryLeaseOperation(recoveryInput);
        assert.equal(recovered.recovered, true);
        if (recovered.recovered) {
            assert.equal(recovered.outcome, 'command-guard-removed');
            assert.equal(recovered.operation.operation_id, stale.operation_id);
        }
        assert.equal(fs.existsSync(guard), false);
        assert.deepEqual(recoverRepositoryLeaseOperation(recoveryInput), { recovered: false });
        assert.doesNotThrow(() => verifyRepositoryLease(recoveryInput));
        assert.doesNotThrow(() => releaseRepositoryLease(recoveryInput));
    });

    it('recursively binds nested files and rejects symlinks and content drift', () => {
        const root = temporary('cstar-council-manifest-');
        fs.mkdirSync(path.join(root, 'evidence', 'nested'), { recursive: true });
        fs.writeFileSync(path.join(root, 'evidence', 'nested', 'proof.bin'), Buffer.from([1, 2, 3]));
        const manifest = buildArtifactManifest({ root, rootLabel: 'evidence', includedPaths: ['evidence'] });
        assert.deepEqual(manifest.entries.map(({ path: file }) => file), ['evidence/nested/proof.bin']);
        verifyArtifactManifest(manifest, root);
        fs.writeFileSync(path.join(root, 'evidence', 'nested', 'proof.bin'), Buffer.from([1, 2, 4]));
        assert.throws(() => verifyArtifactManifest(manifest, root), /mismatch/i);
        fs.unlinkSync(path.join(root, 'evidence', 'nested', 'proof.bin'));
        fs.symlinkSync('missing', path.join(root, 'evidence', 'link'));
        assert.throws(() => buildArtifactManifest({
            root, rootLabel: 'evidence', includedPaths: ['evidence'],
        }), /symbolic link/i);
    });

    it('rejects worktree bytes hidden by assume-unchanged index flags', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'), governedPaths: ['src'],
        });
        git(repo, ['update-index', '--assume-unchanged', 'src/site.txt']);
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: resumeToken(lease.record.run_id),
        }), /hidden or unsupported flags/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'hidden drift\n');
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: resumeToken(lease.record.run_id),
        }), /hidden or unsupported flags/i);
        git(repo, ['update-index', '--no-assume-unchanged', 'src/site.txt']);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: resumeToken(lease.record.run_id),
        });
    });

    it('rejects symlinked and non-private control roots before lock acquisition', () => {
        const repo = repository();
        const parent = temporary('cstar-council-control-parent-');
        const real = path.join(parent, 'real');
        const linked = path.join(parent, 'linked');
        fs.mkdirSync(real, { mode: 0o700 });
        fs.symlinkSync(real, linked);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo, controlRoot: linked, runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'), governedPaths: ['src'],
        }), /real directory|symbolic-link/i);
        const missingBelowLink = path.join(linked, 'missing');
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: missingBelowLink,
            runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'),
            governedPaths: ['src'],
        }), /real directory|symbolic-link/i);
        assert.equal(fs.existsSync(path.join(real, 'missing')), false);
        const publicRoot = temporary('cstar-council-public-control-');
        fs.chmodSync(publicRoot, 0o755);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo, controlRoot: publicRoot, runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'), governedPaths: ['src'],
        }), /private real directory/i);
    });

    it('rejects a missing repository-overlapping control root without creating it', () => {
        const repo = repository();
        const invalidParent = path.join(repo, 'missing-control');
        const invalidTarget = path.join(invalidParent, 'nested');
        assert.equal(fs.existsSync(invalidParent), false);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: invalidTarget,
            runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'),
            governedPaths: ['src'],
        }), /must not contain or be contained/i);
        assert.equal(fs.existsSync(invalidParent), false);
    });

    it('creates a valid missing control root as private real components', () => {
        const repo = repository();
        const parent = temporary('cstar-council-missing-control-parent-');
        const first = path.join(parent, 'first');
        const control = path.join(first, 'control');
        assert.equal(fs.existsSync(first), false);
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-test-run-1',
            resumeToken: resumeToken('council-test-run-1'),
            governedPaths: ['src'],
        });
        assert.equal(lease.record.control_root, fs.realpathSync(control));
        assert.equal(fs.lstatSync(first).mode & 0o077, 0);
        assert.equal(fs.lstatSync(control).mode & 0o077, 0);
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: resumeToken(lease.record.run_id),
        });
    });

    it('normalizes POSIX modes and explicitly rejects unsupported Windows execution', () => {
        const root = temporary('cstar-council-mode-');
        fs.writeFileSync(path.join(root, 'artifact.txt'), 'mode normalized\n');
        fs.chmodSync(path.join(root, 'artifact.txt'), 0o664);
        const regular = buildArtifactManifest({
            root, rootLabel: 'mode', includedPaths: ['artifact.txt'],
        });
        assert.equal(regular.entries[0].mode, 0o644);
        fs.chmodSync(path.join(root, 'artifact.txt'), 0o744);
        const executable = buildArtifactManifest({
            root, rootLabel: 'mode', includedPaths: ['artifact.txt'],
        });
        assert.equal(executable.entries[0].mode, 0o755);
        assert.throws(() => assertCouncilRuntimePlatform('win32'), /POSIX runtime/i);
    });
});
