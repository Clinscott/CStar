import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    canonicalJson,
    currentOperationOwner,
    recoverRepositoryLeaseAcquisition,
    recoverRepositoryLeaseOperation,
    releaseRepositoryLease,
    sha256,
    verifyRepositoryLease,
    withRepositoryLeaseOperation,
} from '../../../src/core/council_autoresearch/index.js';
import {
    cleanup,
    git,
    repository,
    temporary,
} from './test_helpers.js';

afterEach(cleanup);

function lifecyclePaths(repo: string): {
    common: string;
    lock: string;
    guard: string;
    claim: string;
    recoveryOwner: string;
} {
    const common = fs.realpathSync(path.resolve(
        repo,
        git(repo, ['rev-parse', '--git-common-dir']),
    ));
    const lock = path.join(common, 'cstar-council-autoresearch.lock');
    const guard = `${lock}.operation`;
    return {
        common,
        lock,
        guard,
        claim: `${guard}.recovery-claim`,
        recoveryOwner: `${guard}.recovery-owner`,
    };
}

function deadOwner(): ReturnType<typeof currentOperationOwner> {
    const owner = currentOperationOwner();
    return {
        ...owner,
        process_start_ticks: (BigInt(owner.process_start_ticks) + 1n).toString(),
    };
}

function writePrivateJson(file: string, value: unknown): void {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function acquisitionGuard(input: {
    repo: string;
    control: string;
    runId: string;
    operationId: string;
    leaseId: string;
    resumeTokenSha256: string;
    owner: ReturnType<typeof currentOperationOwner>;
}): Record<string, unknown> {
    const paths = lifecyclePaths(input.repo);
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: 'lease-acquisition',
        operation_id: input.operationId,
        lease_id: input.leaseId,
        run_id: input.runId,
        resume_token_sha256: input.resumeTokenSha256,
        owner: input.owner,
        acquired_at: new Date().toISOString(),
        repository_root: fs.realpathSync(input.repo),
        git_common_directory: paths.common,
        control_root: path.resolve(input.control),
        governed_paths_sha256: sha256(canonicalJson(['src'])),
    };
}

describe('Council autoresearch repository lifecycle serialization', () => {
    it('blocks acquisition through the committed-release guard window', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-old-run',
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        writePrivateJson(paths.guard, {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            operation_kind: 'lease-release',
            operation_id: '00000000-0000-4000-8000-000000000101',
            lease_id: lease.record.lease_id,
            run_id: lease.record.run_id,
            resume_token_sha256: sha256(lease.resume_token),
            owner: deadOwner(),
            acquired_at: new Date().toISOString(),
        });
        fs.unlinkSync(paths.lock);

        const newParent = temporary('cstar-council-new-control-parent-');
        const newControl = path.join(newParent, 'control');
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: 'council-new-run',
            governedPaths: ['src'],
        }), /operation guard already exists|explicit recovery/i);
        assert.equal(fs.existsSync(newControl), false);
        assert.equal(fs.existsSync(paths.lock), false);

        const recovered = recoverRepositoryLeaseOperation({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: lease.resume_token,
        });
        assert.equal(recovered.recovered, true);
        if (recovered.recovered) assert.equal(recovered.outcome, 'release-committed');
        assert.equal(fs.existsSync(paths.guard), false);

        const replacement = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: 'council-new-run',
            governedPaths: ['src'],
        });
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: replacement.record.run_id,
            resumeToken: replacement.resume_token,
        });
    });

    it('rejects a stale old-lease command before effects and preserves the replacement lease', () => {
        const repo = repository();
        const oldControl = temporary('cstar-council-old-control-');
        const oldLease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: oldControl,
            runId: 'council-old-run',
            governedPaths: ['src'],
        });
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: oldControl,
            runId: oldLease.record.run_id,
            resumeToken: oldLease.resume_token,
        });

        const newControl = temporary('cstar-council-new-control-');
        const replacement = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: 'council-new-run',
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const before = fs.lstatSync(paths.lock, { bigint: true });
        const bytes = fs.readFileSync(paths.lock);
        let effect = false;
        assert.throws(() => withRepositoryLeaseOperation({
            repoRoot: repo,
            controlRoot: oldControl,
            runId: oldLease.record.run_id,
            resumeToken: oldLease.resume_token,
        }, () => {
            effect = true;
        }), /lease identity mismatch|receipt does not match/i);
        assert.equal(effect, false);
        assert.equal(fs.existsSync(paths.guard), false);
        assert.deepEqual(fs.readFileSync(paths.lock), bytes);
        const after = fs.lstatSync(paths.lock, { bigint: true });
        assert.equal(after.dev, before.dev);
        assert.equal(after.ino, before.ino);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: replacement.record.run_id,
            resumeToken: replacement.resume_token,
        }));
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: newControl,
            runId: replacement.record.run_id,
            resumeToken: replacement.resume_token,
        });
    });

    it('does not wedge when a released run already has an immutable source receipt', () => {
        const repo = repository();
        const control = temporary('cstar-council-reused-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-reused-run',
            governedPaths: ['src'],
        });
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: lease.resume_token,
        });
        const paths = lifecyclePaths(repo);
        const receipt = path.join(
            control,
            'council-autoresearch',
            lease.record.run_id,
            '00-source-lease.json',
        );
        const receiptBytes = fs.readFileSync(receipt);
        const receiptStat = fs.lstatSync(receipt, { bigint: true });

        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            governedPaths: ['src'],
        }), /source lease receipt already exists/i);
        assert.equal(fs.existsSync(paths.lock), false);
        assert.equal(fs.existsSync(paths.guard), false);
        assert.deepEqual(fs.readFileSync(receipt), receiptBytes);
        const preserved = fs.lstatSync(receipt, { bigint: true });
        assert.equal(preserved.dev, receiptStat.dev);
        assert.equal(preserved.ino, receiptStat.ino);
    });

    it('recovers a dead guard-only acquisition without creating lease effects', () => {
        const repo = repository();
        const controlParent = temporary('cstar-council-acquire-control-parent-');
        const control = path.join(controlParent, 'control');
        const paths = lifecyclePaths(repo);
        const operationId = '00000000-0000-4000-8000-000000000201';
        writePrivateJson(paths.guard, acquisitionGuard({
            repo,
            control,
            runId: 'council-acquire-run',
            operationId,
            leaseId: '00000000-0000-4000-8000-000000000202',
            resumeTokenSha256: 'a'.repeat(64),
            owner: deadOwner(),
        }));

        assert.throws(() => recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-acquire-run',
            governedPaths: ['src'],
            operationId: '00000000-0000-4000-8000-000000000299',
        }), /does not bind the recovery input/i);
        assert.equal(fs.existsSync(paths.guard), true);
        assert.equal(fs.existsSync(control), false);
        assert.equal(fs.existsSync(paths.lock), false);

        const recovered = recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-acquire-run',
            governedPaths: ['src'],
            operationId,
        });
        assert.equal(recovered.recovered, true);
        if (recovered.recovered) {
            assert.equal(recovered.outcome, 'acquisition-not-committed');
        }
        assert.equal(fs.existsSync(paths.guard), false);
        assert.equal(fs.existsSync(paths.claim), false);
        assert.equal(fs.existsSync(paths.recoveryOwner), false);
        assert.equal(fs.existsSync(control), false);
        assert.equal(fs.existsSync(paths.lock), false);
    });

    it('aborts one exact partial acquisition but preserves a receipted lease', () => {
        const repo = repository();
        const control = temporary('cstar-council-partial-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-partial-run',
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const operationId = '00000000-0000-4000-8000-000000000301';
        const liveGuard = acquisitionGuard({
            repo,
            control,
            runId: lease.record.run_id,
            operationId,
            leaseId: lease.record.lease_id,
            resumeTokenSha256: sha256(lease.resume_token),
            owner: currentOperationOwner(),
        });
        const receipt = path.join(
            control,
            'council-autoresearch',
            lease.record.run_id,
            '00-source-lease.json',
        );
        fs.unlinkSync(receipt);
        writePrivateJson(paths.guard, liveGuard);
        const liveLockStat = fs.lstatSync(paths.lock, { bigint: true });
        const liveLockBytes = fs.readFileSync(paths.lock);
        assert.throws(() => recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            governedPaths: ['src'],
            operationId,
        }), /operation is active/i);
        assert.equal(fs.existsSync(paths.guard), true);
        assert.equal(fs.existsSync(paths.recoveryOwner), false);
        assert.deepEqual(fs.readFileSync(paths.lock), liveLockBytes);
        const preservedLockStat = fs.lstatSync(paths.lock, { bigint: true });
        assert.equal(preservedLockStat.dev, liveLockStat.dev);
        assert.equal(preservedLockStat.ino, liveLockStat.ino);

        fs.unlinkSync(paths.guard);
        writePrivateJson(paths.guard, {
            ...liveGuard,
            owner: deadOwner(),
        });

        const aborted = recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            governedPaths: ['src'],
            operationId,
        });
        assert.equal(aborted.recovered, true);
        assert.equal(fs.existsSync(paths.lock), false);
        assert.equal(fs.existsSync(paths.guard), false);

        const active = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-active-control-'),
            runId: 'council-active-run',
            governedPaths: ['src'],
        });
        writePrivateJson(paths.guard, acquisitionGuard({
            repo,
            control: active.record.control_root,
            runId: active.record.run_id,
            operationId: '00000000-0000-4000-8000-000000000302',
            leaseId: active.record.lease_id,
            resumeTokenSha256: sha256(active.resume_token),
            owner: deadOwner(),
        }));
        assert.throws(() => recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: active.record.control_root,
            runId: active.record.run_id,
            governedPaths: ['src'],
            operationId: '00000000-0000-4000-8000-000000000302',
        }), /receipted repository lease requires resume-token recovery/i);
        assert.equal(fs.existsSync(paths.guard), true);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: active.record.control_root,
            runId: active.record.run_id,
            resumeToken: active.resume_token,
        }));

        const completed = recoverRepositoryLeaseOperation({
            repoRoot: repo,
            controlRoot: active.record.control_root,
            runId: active.record.run_id,
            resumeToken: active.resume_token,
        });
        assert.equal(completed.recovered, true);
        if (completed.recovered) assert.equal(completed.outcome, 'acquisition-active');
        assert.equal(fs.existsSync(paths.guard), false);
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: active.record.control_root,
            runId: active.record.run_id,
            resumeToken: active.resume_token,
        });
    });
});
