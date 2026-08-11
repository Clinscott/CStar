import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    currentOperationOwner,
    receiptSealPath,
    recoverRepositoryLeaseAcquisition,
    releaseRepositoryLease,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, git, repository, resumeToken, temporary } from './test_helpers.js';

afterEach(cleanup);

interface InterruptedAcquisition {
    repo: string;
    control: string;
    runId: string;
    token: string;
    lock: string;
    guard: string;
    recoveryOwner: string;
    receipt: string;
    seal: string;
    target: string;
    temporary: string;
    operationId: string;
    leaseId: string;
}

function lifecyclePaths(repo: string): { lock: string; guard: string; recoveryOwner: string } {
    const common = fs.realpathSync(path.resolve(
        repo,
        git(repo, ['rev-parse', '--git-common-dir']),
    ));
    const lock = path.join(common, 'cstar-council-autoresearch.lock');
    const guard = `${lock}.operation`;
    return { lock, guard, recoveryOwner: `${guard}.recovery-owner` };
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

function interruptReceiptPublication(
    artifact: 'body' | 'seal',
    state: 'staged' | 'committed',
    runId: string,
): InterruptedAcquisition {
    const repo = repository();
    const control = temporary(`cstar-council-${artifact}-${state}-`);
    const token = resumeToken(runId);
    const paths = lifecyclePaths(repo);
    const receipt = path.join(control, 'council-autoresearch', runId, '00-source-lease.json');
    const seal = receiptSealPath(receipt);
    const target = artifact === 'body' ? receipt : seal;
    const originalLink = fs.linkSync;
    const originalUnlink = fs.unlinkSync;
    let artifactTemporary = '';
    fs.linkSync = ((existing: fs.PathLike, created: fs.PathLike) => {
        if (path.resolve(String(created)) === target) {
            artifactTemporary = path.resolve(String(existing));
            if (state === 'staged') throw new Error(`injected staged ${artifact} interruption`);
        }
        return originalLink(existing, created);
    }) as typeof fs.linkSync;
    fs.unlinkSync = ((file: fs.PathLike) => {
        if (artifactTemporary !== '' && path.resolve(String(file)) === artifactTemporary) {
            throw new Error(`injected ${state} ${artifact} interruption`);
        }
        return originalUnlink(file);
    }) as typeof fs.unlinkSync;
    try {
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId,
            resumeToken: token,
            governedPaths: ['src'],
        }), new RegExp(`injected ${state} ${artifact} interruption`, 'i'));
    } finally {
        fs.linkSync = originalLink;
        fs.unlinkSync = originalUnlink;
    }
    const guard = JSON.parse(fs.readFileSync(paths.guard, 'utf8')) as {
        operation_id: string;
        lease_id: string;
        owner: ReturnType<typeof currentOperationOwner>;
    };
    assert.equal(
        artifactTemporary,
        `${target}.tmp-${guard.owner.pid}-${guard.operation_id}`,
        'interrupted artifact must be derived from the owning operation guard',
    );
    writePrivateJson(paths.guard, { ...guard, owner: deadOwner() });
    return {
        repo,
        control,
        runId,
        token,
        ...paths,
        receipt,
        seal,
        target,
        temporary: artifactTemporary,
        operationId: guard.operation_id,
        leaseId: guard.lease_id,
    };
}

function recoveryInput(interrupted: InterruptedAcquisition, token = interrupted.token) {
    return {
        repoRoot: interrupted.repo,
        controlRoot: interrupted.control,
        runId: interrupted.runId,
        governedPaths: ['src'],
        operationId: interrupted.operationId,
        resumeToken: token,
    };
}

function replay(interrupted: InterruptedAcquisition) {
    return acquireRepositoryLease({
        repoRoot: interrupted.repo,
        controlRoot: interrupted.control,
        runId: interrupted.runId,
        resumeToken: interrupted.token,
        governedPaths: ['src'],
    });
}

function release(interrupted: InterruptedAcquisition): void {
    releaseRepositoryLease({
        repoRoot: interrupted.repo,
        controlRoot: interrupted.control,
        runId: interrupted.runId,
        resumeToken: interrupted.token,
    });
}

function snapshot(file: string): { content: Buffer; stat: fs.BigIntStats } {
    return { content: fs.readFileSync(file), stat: fs.lstatSync(file, { bigint: true }) };
}

function assertSnapshot(file: string, expected: ReturnType<typeof snapshot>): void {
    assert.deepEqual(fs.readFileSync(file), expected.content);
    const actual = fs.lstatSync(file, { bigint: true });
    for (const key of [
        'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
    ] as const) assert.equal(actual[key], expected.stat[key]);
}

describe('Council autoresearch acquisition receipt crash recovery', () => {
    it('removes a staged body temporary and resumes the same lease identity', () => {
        const interrupted = interruptReceiptPublication(
            'body', 'staged', 'council-staged-body-recovery',
        );
        assert.equal(fs.existsSync(interrupted.receipt), false);
        assert.equal(fs.existsSync(interrupted.temporary), true);
        assert.equal(fs.existsSync(interrupted.seal), false);
        const recovered = recoverRepositoryLeaseAcquisition(recoveryInput(interrupted));
        assert.deepEqual(recovered.recovered && recovered.outcome, 'acquisition-not-committed');
        assert.equal(fs.existsSync(interrupted.guard), false);
        assert.equal(fs.existsSync(interrupted.temporary), false);
        assert.equal(fs.existsSync(interrupted.lock), true);
        const lease = replay(interrupted);
        assert.equal(lease.record.lease_id, interrupted.leaseId);
        assert.equal(lease.created, true);
        release(interrupted);
    });

    it('removes a staged seal temporary while preserving the exact body for replay', () => {
        const interrupted = interruptReceiptPublication(
            'seal', 'staged', 'council-staged-seal-recovery',
        );
        const body = snapshot(interrupted.receipt);
        const recovered = recoverRepositoryLeaseAcquisition(recoveryInput(interrupted));
        assert.deepEqual(recovered.recovered && recovered.outcome, 'acquisition-not-committed');
        assertSnapshot(interrupted.receipt, body);
        assert.equal(fs.existsSync(interrupted.temporary), false);
        assert.equal(fs.existsSync(interrupted.seal), false);
        const lease = replay(interrupted);
        assert.equal(lease.record.lease_id, interrupted.leaseId);
        assert.equal(lease.created, false);
        release(interrupted);
    });

    it('repairs a committed seal alias without replacing the admitted inode', () => {
        const interrupted = interruptReceiptPublication(
            'seal', 'committed', 'council-committed-seal-recovery',
        );
        const seal = snapshot(interrupted.seal);
        assert.equal(seal.stat.nlink, 2n);
        assert.equal(fs.lstatSync(interrupted.temporary, { bigint: true }).ino, seal.stat.ino);
        const recovered = recoverRepositoryLeaseAcquisition(recoveryInput(interrupted));
        assert.deepEqual(recovered.recovered && recovered.outcome, 'acquisition-active');
        assert.equal(fs.existsSync(interrupted.guard), false);
        assert.equal(fs.existsSync(interrupted.temporary), false);
        assert.equal(fs.lstatSync(interrupted.seal, { bigint: true }).ino, seal.stat.ino);
        assert.equal(fs.lstatSync(interrupted.seal, { bigint: true }).nlink, 1n);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: interrupted.repo,
            controlRoot: interrupted.control,
            runId: interrupted.runId,
            resumeToken: interrupted.token,
        }));
        assert.equal(replay(interrupted).created, false);
        release(interrupted);
    });

    it('rejects the wrong recovery token without changing lifecycle evidence', () => {
        const interrupted = interruptReceiptPublication(
            'seal', 'committed', 'council-wrong-token-recovery',
        );
        const evidence = Object.fromEntries(
            [interrupted.lock, interrupted.guard, interrupted.receipt,
                interrupted.seal, interrupted.temporary].map((file) => [file, snapshot(file)]),
        );
        assert.throws(() => recoverRepositoryLeaseAcquisition(recoveryInput(
            interrupted,
            resumeToken('different-recovery-token'),
        )), /does not bind the recovery input/i);
        for (const [file, expected] of Object.entries(evidence)) assertSnapshot(file, expected);
        assert.equal(fs.existsSync(interrupted.recoveryOwner), false);
        recoverRepositoryLeaseAcquisition(recoveryInput(interrupted));
        release(interrupted);
    });

    it('rejects source drift before repairing a committed seal alias', () => {
        const interrupted = interruptReceiptPublication(
            'seal', 'committed', 'council-source-drift-recovery',
        );
        const evidence = Object.fromEntries(
            [interrupted.lock, interrupted.guard, interrupted.receipt,
                interrupted.seal, interrupted.temporary].map((file) => [file, snapshot(file)]),
        );
        fs.writeFileSync(path.join(interrupted.repo, 'src', 'site.txt'), 'drifted source\n');
        assert.throws(
            () => recoverRepositoryLeaseAcquisition(recoveryInput(interrupted)),
            /raw worktree bytes differ|worktree file metadata changed|source attestation/i,
        );
        for (const [file, expected] of Object.entries(evidence)) assertSnapshot(file, expected);
        assert.equal(fs.existsSync(interrupted.recoveryOwner), false);
        fs.writeFileSync(path.join(interrupted.repo, 'src', 'site.txt'), 'stable source\n');
        recoverRepositoryLeaseAcquisition(recoveryInput(interrupted));
        release(interrupted);
    });
});
