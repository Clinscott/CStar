import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    currentOperationOwner,
    recoverRepositoryLeaseAcquisition,
    recoverRepositoryLeaseOperation,
    receiptSealPath,
    releaseRepositoryLease,
    sha256,
} from '../../../src/core/council_autoresearch/index.js';
import {
    readOperationGuard,
    readRecoveryOwner,
} from '../../../src/core/council_autoresearch/repository_lease_contract.js';
import { cleanup, git, repository, resumeToken, temporary } from './test_helpers.js';

afterEach(cleanup);

interface Paths {
    common: string;
    lock: string;
    guard: string;
    recoveryOwner: string;
}

function lifecyclePaths(repo: string): Paths {
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
    fs.chmodSync(file, 0o600);
}

function commandGuard(
    lease: ReturnType<typeof acquireRepositoryLease>,
    resumeToken: string,
    owner: ReturnType<typeof currentOperationOwner>,
    operationId = '00000000-0000-4000-8000-000000000601',
): Record<string, unknown> {
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: 'lease-command',
        operation_id: operationId,
        lease_id: lease.record.lease_id,
        run_id: lease.record.run_id,
        resume_token_sha256: sha256(resumeToken),
        owner,
        acquired_at: new Date().toISOString(),
    };
}

function recoveryInput(lease: ReturnType<typeof acquireRepositoryLease>, token: string): {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
} {
    return {
        repoRoot: lease.record.repository_root,
        controlRoot: lease.record.control_root,
        runId: lease.record.run_id,
        resumeToken: token,
    };
}

type Interruption = {
    repo: string;
    control: string;
    paths: Paths;
    operationId: string;
    intentTemporary: string;
    resumeToken: string;
};

function interruptSourcePublication(
    kind: 'staged' | 'committed' | 'cleanup-fsync',
    runId: string,
): Interruption {
    const repo = repository();
    const control = temporary(`cstar-council-${kind}-`);
    const paths = lifecyclePaths(repo);
    const originalLink = fs.linkSync;
    const originalUnlink = fs.unlinkSync;
    const originalFsync = fs.fsyncSync;
    let intentTemporary = '';
    let failNextFsync = false;
    fs.linkSync = ((existing: fs.PathLike, created: fs.PathLike) => {
        if (path.resolve(String(created)) === paths.lock && kind !== 'committed') {
            intentTemporary = path.resolve(String(existing));
            throw new Error('injected source publication failure');
        }
        return originalLink(existing, created);
    }) as typeof fs.linkSync;
    fs.unlinkSync = ((target: fs.PathLike) => {
        const resolved = path.resolve(String(target));
        if (resolved.startsWith(`${paths.lock}.tmp-`)) {
            intentTemporary = resolved;
            if (kind === 'cleanup-fsync') {
                originalUnlink(target);
                failNextFsync = true;
                return;
            }
            throw new Error(`injected ${kind} source alias interruption`);
        }
        return originalUnlink(target);
    }) as typeof fs.unlinkSync;
    fs.fsyncSync = ((descriptor: number) => {
        if (failNextFsync) {
            failNextFsync = false;
            throw new Error('injected directory fsync failure');
        }
        return originalFsync(descriptor);
    }) as typeof fs.fsyncSync;
    try {
        const token = resumeToken(runId);
        const expected = kind === 'cleanup-fsync'
            ? /namespace durability is uncertain/i
            : new RegExp(`injected ${kind} source alias interruption`, 'i');
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId,
            resumeToken: token,
            governedPaths: ['src'],
        }), expected);
    } finally {
        fs.linkSync = originalLink;
        fs.unlinkSync = originalUnlink;
        fs.fsyncSync = originalFsync;
    }
    assert.notEqual(intentTemporary, '');
    const operation = JSON.parse(fs.readFileSync(paths.guard, 'utf8')) as {
        operation_id: string;
    };
    return {
        repo, control, paths, operationId: operation.operation_id,
        intentTemporary, resumeToken: resumeToken(runId),
    };
}

function recoverInterruptedAcquisition(interrupted: Interruption): void {
    const guard = JSON.parse(fs.readFileSync(interrupted.paths.guard, 'utf8')) as {
        owner: ReturnType<typeof currentOperationOwner>;
    };
    writePrivateJson(interrupted.paths.guard, { ...guard, owner: deadOwner() });
    const recovered = recoverRepositoryLeaseAcquisition({
        repoRoot: interrupted.repo,
        controlRoot: interrupted.control,
        runId: JSON.parse(fs.readFileSync(interrupted.paths.guard, 'utf8')).run_id as string,
        governedPaths: ['src'],
        operationId: interrupted.operationId,
        resumeToken: interrupted.resumeToken,
    });
    assert.equal(recovered.recovered, true);
    if (recovered.recovered) assert.equal(recovered.outcome, 'acquisition-not-committed');
    assert.equal(fs.existsSync(interrupted.paths.guard), false);
}

describe('Council autoresearch crash-safe private repository files', () => {
    it('rejects guard and recovery-owner FIFOs without waiting for a writer', () => {
        const paths = lifecyclePaths(repository());
        const originalOpen = fs.openSync;
        let targetedOpens = 0;
        fs.openSync = ((file, flags, mode) => {
            if ([paths.guard, paths.recoveryOwner].includes(path.resolve(String(file)))) {
                targetedOpens += 1;
                assert.equal(typeof flags, 'number');
                assert.notEqual((flags as number) & fs.constants.O_NONBLOCK, 0);
            }
            return originalOpen(file, flags, mode);
        }) as typeof fs.openSync;
        try {
            for (const [file, read] of [
                [paths.guard, readOperationGuard],
                [paths.recoveryOwner, readRecoveryOwner],
            ] as const) {
                assert.equal(spawnSync('/usr/bin/mkfifo', [file]).status, 0);
                fs.chmodSync(file, 0o600);
                assert.throws(() => read(file), /exact private owned regular file/i);
                assert.equal(fs.existsSync(file), true);
                fs.unlinkSync(file);
            }
        } finally {
            fs.openSync = originalOpen;
        }
        assert.equal(targetedOpens, 2);
    });

    it('normalizes private lifecycle files under a hostile umask', () => {
        const repo = repository();
        const control = temporary('cstar-council-hostile-umask-');
        fs.mkdirSync(path.join(
            control,
            'council-autoresearch',
            'council-hostile-umask-run',
        ), { recursive: true, mode: 0o700 });
        const previous = process.umask(0o777);
        try {
            const token = resumeToken('council-hostile-umask-run');
            const lease = acquireRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: 'council-hostile-umask-run',
                resumeToken: token,
                governedPaths: ['src'],
            });
            const paths = lifecyclePaths(repo);
            const receipt = path.join(
                control,
                'council-autoresearch',
                lease.record.run_id,
                '00-source-lease.json',
            );
            assert.equal(fs.statSync(paths.lock).mode & 0o777, 0o600);
            assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
            assert.equal(fs.statSync(receiptSealPath(receipt)).mode & 0o777, 0o600);
            releaseRepositoryLease(recoveryInput(lease, token));
        } finally {
            process.umask(previous);
        }
    });

    it('preserves a live two-link guard and repairs only its dead exact alias', () => {
        const repo = repository();
        const control = temporary('cstar-council-live-guard-');
        const token = resumeToken('council-live-guard-run');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-live-guard-run',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const operationId = '00000000-0000-4000-8000-000000000602';
        const owner = currentOperationOwner();
        writePrivateJson(paths.guard, commandGuard(lease, token, owner, operationId));
        const alias = `${paths.guard}.tmp-${owner.pid}-${operationId}`;
        fs.linkSync(paths.guard, alias);

        assert.throws(
            () => recoverRepositoryLeaseOperation(recoveryInput(lease, token)),
            /operation is active/i,
        );
        assert.equal(fs.existsSync(paths.guard), true);
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.lstatSync(paths.guard).nlink, 2);

        writePrivateJson(paths.guard, commandGuard(lease, token, deadOwner(), operationId));
        const recovered = recoverRepositoryLeaseOperation(recoveryInput(lease, token));
        assert.equal(recovered.recovered, true);
        assert.equal(fs.existsSync(paths.guard), false);
        assert.equal(fs.existsSync(alias), false);
        releaseRepositoryLease(recoveryInput(lease, token));
    });

    it('never repairs a live recovery owner alias and normalizes a dead one fail-closed', () => {
        const repo = repository();
        const control = temporary('cstar-council-recovery-owner-');
        const token = resumeToken('council-recovery-owner-run');
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-recovery-owner-run',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const paths = lifecyclePaths(repo);
        const operationId = '00000000-0000-4000-8000-000000000603';
        writePrivateJson(paths.guard, commandGuard(lease, token, deadOwner(), operationId));
        const guardBytes = fs.readFileSync(paths.guard);
        const guardStat = fs.lstatSync(paths.guard, { bigint: true });
        const recoveryId = '00000000-0000-4000-8000-000000000604';
        const owner = currentOperationOwner();
        const target = {
            operation_kind: 'lease-command',
            operation_id: operationId,
            guard_sha256: sha256(guardBytes),
            guard_device: guardStat.dev.toString(),
            guard_inode: guardStat.ino.toString(),
        };
        const ownerRecord = {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            recovery_id: recoveryId,
            target,
            owner,
            acquired_at: new Date().toISOString(),
        };
        writePrivateJson(paths.recoveryOwner, ownerRecord);
        const alias = `${paths.recoveryOwner}.tmp-${owner.pid}-${recoveryId}`;
        fs.linkSync(paths.recoveryOwner, alias);

        assert.throws(
            () => recoverRepositoryLeaseOperation(recoveryInput(lease, token)),
            /recovery is active/i,
        );
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.lstatSync(paths.recoveryOwner).nlink, 2);

        writePrivateJson(paths.recoveryOwner, { ...ownerRecord, owner: deadOwner() });
        assert.throws(
            () => recoverRepositoryLeaseOperation(recoveryInput(lease, token)),
            /interrupted.*operator investigation/i,
        );
        assert.equal(fs.existsSync(alias), false);
        assert.equal(fs.lstatSync(paths.recoveryOwner).nlink, 1);
        fs.unlinkSync(paths.recoveryOwner);
        fs.unlinkSync(paths.guard);
        releaseRepositoryLease(recoveryInput(lease, token));
    });

    it('repairs a committed source alias only after validating its acquisition', () => {
        const interrupted = interruptSourcePublication(
            'committed',
            'council-committed-source-run',
        );
        assert.equal(fs.existsSync(interrupted.paths.lock), true);
        assert.equal(fs.existsSync(interrupted.intentTemporary), true);
        assert.equal(fs.lstatSync(interrupted.paths.lock).nlink, 2);
        recoverInterruptedAcquisition(interrupted);
        assert.equal(fs.existsSync(interrupted.paths.lock), true);
        assert.equal(fs.lstatSync(interrupted.paths.lock).nlink, 1);
        assert.equal(fs.existsSync(interrupted.intentTemporary), false);
    });

    it('preserves the guard when unpublished-temp cleanup durability is uncertain', () => {
        const interrupted = interruptSourcePublication(
            'cleanup-fsync',
            'council-cleanup-fsync-run',
        );
        assert.equal(fs.existsSync(interrupted.paths.lock), false);
        assert.equal(fs.existsSync(interrupted.intentTemporary), false);
        assert.equal(fs.existsSync(interrupted.paths.guard), true);
        recoverInterruptedAcquisition(interrupted);
    });

    it('rejects staged source byte and metadata drift before exact recovery', () => {
        const interrupted = interruptSourcePublication('staged', 'council-staged-source-run');
        const sourceBytes = fs.readFileSync(interrupted.intentTemporary);
        const guard = JSON.parse(fs.readFileSync(interrupted.paths.guard, 'utf8')) as {
            owner: ReturnType<typeof currentOperationOwner>;
        };
        writePrivateJson(interrupted.paths.guard, { ...guard, owner: deadOwner() });
        const input = {
            repoRoot: interrupted.repo,
            controlRoot: interrupted.control,
            runId: 'council-staged-source-run',
            governedPaths: ['src'],
            operationId: interrupted.operationId,
            resumeToken: interrupted.resumeToken,
        };

        writePrivateJson(interrupted.intentTemporary, { unrelated: true });
        assert.throws(() => recoverRepositoryLeaseAcquisition(input), /does not bind the acquisition/i);
        assert.equal(fs.existsSync(interrupted.intentTemporary), true);
        assert.equal(fs.existsSync(interrupted.paths.guard), true);

        fs.writeFileSync(interrupted.intentTemporary, sourceBytes);
        fs.chmodSync(interrupted.intentTemporary, 0o644);
        assert.throws(() => recoverRepositoryLeaseAcquisition(input), /publication state is ambiguous/i);
        assert.equal(fs.existsSync(interrupted.intentTemporary), true);
        assert.equal(fs.existsSync(interrupted.paths.guard), true);

        fs.chmodSync(interrupted.intentTemporary, 0o600);
        const recovered = recoverRepositoryLeaseAcquisition(input);
        assert.equal(recovered.recovered, true);
        assert.equal(fs.existsSync(interrupted.intentTemporary), false);
        assert.equal(fs.existsSync(interrupted.paths.guard), false);
    });
});
