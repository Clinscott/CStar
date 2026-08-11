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
    receiptSealPath,
    releaseRepositoryLease,
    repositoryLeaseIntentFromRecord,
    sha256,
    verifyRepositoryLease,
    withRepositoryLeaseOperation,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, git, repository, resumeToken, temporary } from './test_helpers.js';

afterEach(cleanup);

function lifecyclePaths(repo: string): {
    common: string;
    lock: string;
    guard: string;
    recoveryOwner: string;
} {
    const common = fs.realpathSync(path.resolve(
        repo,
        git(repo, ['rev-parse', '--git-common-dir']),
    ));
    const lock = path.join(common, 'cstar-council-autoresearch.lock');
    const guard = `${lock}.operation`;
    return { common, lock, guard, recoveryOwner: `${guard}.recovery-owner` };
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
    leaseIntentSha256: string;
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
        lease_intent_sha256: input.leaseIntentSha256,
        owner: deadOwner(),
        acquired_at: new Date().toISOString(),
        repository_root: fs.realpathSync(input.repo),
        git_common_directory: paths.common,
        control_root: path.resolve(input.control),
        governed_paths_sha256: sha256(canonicalJson(['src'])),
    };
}

describe('Council autoresearch repository lifecycle adversarial boundaries', () => {
    it('preserves the lock and guard after an immutable receipt commits before cleanup fails', () => {
        const repo = repository();
        const control = temporary('cstar-council-receipt-alias-');
        const paths = lifecyclePaths(repo);
        const token = resumeToken('council-receipt-alias-run');
        const originalUnlink = fs.unlinkSync;
        let injected = false;
        fs.unlinkSync = ((target: fs.PathLike) => {
            if (!injected && path.basename(String(target)).startsWith(
                '00-source-lease.json.tmp-',
            )) {
                injected = true;
                throw new Error('injected receipt alias cleanup failure');
            }
            return originalUnlink(target);
        }) as typeof fs.unlinkSync;
        try {
            assert.throws(() => acquireRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: 'council-receipt-alias-run',
                resumeToken: token,
                governedPaths: ['src'],
            }), /injected receipt alias cleanup failure/i);
        } finally {
            fs.unlinkSync = originalUnlink;
        }

        const receipt = path.join(
            control,
            'council-autoresearch',
            'council-receipt-alias-run',
            '00-source-lease.json',
        );
        assert.equal(injected, true);
        assert.equal(fs.existsSync(paths.lock), true);
        assert.equal(fs.existsSync(paths.guard), true);
        assert.equal(fs.lstatSync(receipt).nlink, 2);
        const lockBytes = fs.readFileSync(paths.lock);
        const intent = JSON.parse(lockBytes.toString('utf8'));
        const record = JSON.parse(fs.readFileSync(receipt, 'utf8'));
        assert.deepEqual(repositoryLeaseIntentFromRecord(record), intent);
        const guard = JSON.parse(fs.readFileSync(paths.guard, 'utf8')) as {
            lease_id: string;
            lease_intent_sha256: string;
            operation_id: string;
        };
        assert.equal(guard.lease_id, record.lease_id);
        assert.equal(guard.lease_intent_sha256, sha256(canonicalJson(intent)));
        writePrivateJson(paths.guard, {
            ...JSON.parse(fs.readFileSync(paths.guard, 'utf8')),
            owner: deadOwner(),
        });
        const recovered = recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: record.run_id,
            governedPaths: ['src'],
            operationId: guard.operation_id,
            resumeToken: token,
        });
        assert.equal(recovered.recovered, true);
        if (recovered.recovered) assert.equal(recovered.outcome, 'acquisition-not-committed');
        assert.equal(fs.lstatSync(receipt).nlink, 1);
        assert.equal(fs.existsSync(paths.guard), false);

        const replay = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: record.run_id,
            resumeToken: token,
            governedPaths: ['src'],
        });
        assert.equal(replay.record.lease_id, record.lease_id);
        assert.equal(replay.created, false);
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: record.run_id,
            resumeToken: token,
        });
    });

    it('leaves the lifecycle guard when a thenable continues after rejection', async () => {
        const repo = repository();
        const control = temporary('cstar-council-thenable-');
        const token = resumeToken('council-thenable-run');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-thenable-run',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const input = {
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: token,
        };
        let resumed = false;
        assert.throws(() => withRepositoryLeaseOperation(input, async () => {
            await Promise.resolve();
            resumed = true;
        }), /must be synchronous/i);
        await Promise.resolve();

        const paths = lifecyclePaths(repo);
        assert.equal(resumed, true);
        assert.equal(fs.existsSync(paths.guard), true);
        assert.throws(() => releaseRepositoryLease(input), /explicit recovery is required/i);
    });

    it('keeps acquisition-only scope mismatches locked during token recovery', () => {
        const repo = repository();
        const control = temporary('cstar-council-scope-active-');
        const token = resumeToken('council-scope-active-run');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-scope-active-run',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const base = acquisitionGuard({
            repo,
            control,
            runId: lease.record.run_id,
            operationId: '00000000-0000-4000-8000-000000000401',
            leaseId: lease.record.lease_id,
            resumeTokenSha256: sha256(token),
            leaseIntentSha256: sha256(canonicalJson(repositoryLeaseIntentFromRecord(lease.record))),
        });
        const alternate = temporary('cstar-council-scope-other-');
        for (const [field, value] of [
            ['repository_root', alternate],
            ['git_common_directory', path.join(alternate, 'common')],
            ['control_root', path.join(alternate, 'control')],
            ['governed_paths_sha256', 'f'.repeat(64)],
            ['lease_intent_sha256', 'e'.repeat(64)],
        ] as const) {
            writePrivateJson(paths.guard, { ...base, [field]: value });
            assert.throws(() => recoverRepositoryLeaseOperation({
                repoRoot: repo,
                controlRoot: control,
                runId: lease.record.run_id,
                resumeToken: token,
            }), /does not bind the authorized lease (?:scope|intent)/i);
            assert.equal(fs.existsSync(paths.guard), true);
            assert.equal(fs.existsSync(paths.recoveryOwner), false);
            fs.unlinkSync(paths.guard);
        }
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: token,
        });
    });

    it('removes a dead contender guard without changing a valid active lease', () => {
        const repo = repository();
        const activeControl = temporary('cstar-council-foreign-active-');
        const activeToken = resumeToken('council-foreign-active-run');
        const active = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: activeControl,
            runId: 'council-foreign-active-run',
            resumeToken: activeToken,
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const before = fs.lstatSync(paths.lock, { bigint: true });
        const bytes = fs.readFileSync(paths.lock);
        const activeReceipt = path.join(
            activeControl, 'council-autoresearch', active.record.run_id, '00-source-lease.json',
        );
        const activeSeal = receiptSealPath(activeReceipt);
        const receiptBefore = fs.lstatSync(activeReceipt, { bigint: true });
        const receiptBytes = fs.readFileSync(activeReceipt);
        const sealBefore = fs.lstatSync(activeSeal, { bigint: true });
        const sealBytes = fs.readFileSync(activeSeal);
        const deadControl = temporary('cstar-council-dead-contender-');
        const operationId = '00000000-0000-4000-8000-000000000402';
        const contenderToken = resumeToken('council-dead-contender-run');
        writePrivateJson(paths.guard, acquisitionGuard({
            repo,
            control: deadControl,
            runId: 'council-dead-contender-run',
            operationId,
            leaseId: '00000000-0000-4000-8000-000000000403',
            resumeTokenSha256: sha256(contenderToken),
            leaseIntentSha256: 'a'.repeat(64),
        }));

        const recovered = recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: deadControl,
            runId: 'council-dead-contender-run',
            governedPaths: ['src'],
            operationId,
            resumeToken: contenderToken,
        });
        assert.equal(recovered.recovered, true);
        assert.equal(fs.existsSync(paths.guard), false);
        assert.deepEqual(fs.readFileSync(paths.lock), bytes);
        const after = fs.lstatSync(paths.lock, { bigint: true });
        assert.equal(after.dev, before.dev);
        assert.equal(after.ino, before.ino);
        assert.deepEqual(fs.readFileSync(activeReceipt), receiptBytes);
        assert.deepEqual(fs.readFileSync(activeSeal), sealBytes);
        assert.equal(fs.lstatSync(activeReceipt, { bigint: true }).ino, receiptBefore.ino);
        assert.equal(fs.lstatSync(activeSeal, { bigint: true }).ino, sealBefore.ino);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: activeControl,
            runId: active.record.run_id,
            resumeToken: activeToken,
        }));
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: activeControl,
            runId: active.record.run_id,
            resumeToken: activeToken,
        });
    });

    it('preserves an old released receipt while clearing a newer dead guard', () => {
        const repo = repository();
        const control = temporary('cstar-council-old-receipt-');
        const oldToken = resumeToken('council-old-receipt-run');
        const old = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-old-receipt-run',
            resumeToken: oldToken,
            governedPaths: ['src'],
        });
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: old.record.run_id,
            resumeToken: oldToken,
        });
        const paths = lifecyclePaths(repo);
        const receipt = path.join(
            control,
            'council-autoresearch',
            old.record.run_id,
            '00-source-lease.json',
        );
        const receiptBytes = fs.readFileSync(receipt);
        const receiptStat = fs.lstatSync(receipt, { bigint: true });
        const seal = receiptSealPath(receipt);
        const sealBytes = fs.readFileSync(seal);
        const sealStat = fs.lstatSync(seal, { bigint: true });
        const operationId = '00000000-0000-4000-8000-000000000404';
        const contenderToken = resumeToken('council-old-receipt-contender');
        writePrivateJson(paths.guard, acquisitionGuard({
            repo,
            control,
            runId: old.record.run_id,
            operationId,
            leaseId: '00000000-0000-4000-8000-000000000405',
            resumeTokenSha256: sha256(contenderToken),
            leaseIntentSha256: 'd'.repeat(64),
        }));

        const recovered = recoverRepositoryLeaseAcquisition({
            repoRoot: repo,
            controlRoot: control,
            runId: old.record.run_id,
            governedPaths: ['src'],
            operationId,
            resumeToken: contenderToken,
        });
        assert.equal(recovered.recovered, true);
        assert.equal(fs.existsSync(paths.guard), false);
        assert.deepEqual(fs.readFileSync(receipt), receiptBytes);
        const after = fs.lstatSync(receipt, { bigint: true });
        assert.equal(after.dev, receiptStat.dev);
        assert.equal(after.ino, receiptStat.ino);
        assert.deepEqual(fs.readFileSync(seal), sealBytes);
        const sealAfter = fs.lstatSync(seal, { bigint: true });
        assert.equal(sealAfter.dev, sealStat.dev);
        assert.equal(sealAfter.ino, sealStat.ino);
    });

    it('recovers a release that failed before the source lock unlink', () => {
        const repo = repository();
        const control = temporary('cstar-council-release-before-unlink-');
        const token = resumeToken('council-release-before-unlink-run');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-release-before-unlink-run',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const originalUnlink = fs.unlinkSync;
        let injected = false;
        fs.unlinkSync = ((target: fs.PathLike) => {
            if (!injected && path.resolve(String(target)) === paths.lock) {
                injected = true;
                throw new Error('injected source lock unlink failure');
            }
            return originalUnlink(target);
        }) as typeof fs.unlinkSync;
        const input = {
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: token,
        };
        try {
            assert.throws(
                () => releaseRepositoryLease(input),
                /injected source lock unlink failure/i,
            );
        } finally {
            fs.unlinkSync = originalUnlink;
        }
        assert.equal(injected, true);
        assert.equal(fs.existsSync(paths.lock), true);
        assert.equal(fs.existsSync(paths.guard), true);
        const interrupted = JSON.parse(fs.readFileSync(paths.guard, 'utf8')) as {
            owner: ReturnType<typeof currentOperationOwner>;
        };
        writePrivateJson(paths.guard, { ...interrupted, owner: deadOwner() });
        const recovered = recoverRepositoryLeaseOperation(input);
        assert.equal(recovered.recovered, true);
        if (recovered.recovered) assert.equal(recovered.outcome, 'release-not-committed');
        releaseRepositoryLease(input);
    });
});
