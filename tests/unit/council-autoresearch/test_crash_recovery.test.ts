import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    councilRunStatus,
    readJson,
    receiptSealPath,
    recoverRepositoryLeaseOperation,
    releaseCouncilRun,
    releaseRepositoryLease,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, repository, resumeToken, temporary, writeJson } from './test_helpers.js';

afterEach(cleanup);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const worker = path.join(projectRoot, 'tests/unit/council-autoresearch/crash_worker.ts');

function spawnWorker(request: Record<string, unknown>): { child: ReturnType<typeof spawn>; marker?: string } {
    const requestRoot = temporary('cstar-council-crash-request-');
    const requestFile = path.join(requestRoot, 'request.json');
    writeJson(requestFile, request);
    const child = spawn(process.execPath, ['--import', 'tsx', worker, requestFile], {
        cwd: projectRoot,
        stdio: 'ignore',
    });
    return { child, marker: request.marker as string | undefined };
}

async function waitForMarker(child: ReturnType<typeof spawn>, marker: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (!fs.existsSync(marker)) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error('crash worker exited before checkpoint');
        if (Date.now() > deadline) throw new Error('timed out waiting for crash checkpoint');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

function exited(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function killAtMarker(child: ReturnType<typeof spawn>, marker: string): Promise<void> {
    await waitForMarker(child, marker);
    const done = exited(child);
    child.kill('SIGKILL');
    const result = await done;
    assert.equal(result.signal, 'SIGKILL');
}

describe('Council autoresearch process-crash recovery', () => {
    it('repairs only the committed same-inode temporary alias after SIGKILL', async () => {
        const root = temporary('cstar-council-immutable-crash-');
        const target = path.join(root, '10-packet.json');
        const { child } = spawnWorker({ action: 'immutable-link', target });
        const result = await exited(child);
        assert.equal(result.signal, 'SIGKILL');
        assert.equal(fs.lstatSync(target).nlink, 2);
        assert.deepEqual(readJson(target), { durable: true });
        assert.equal(fs.lstatSync(target).nlink, 1);
        assert.deepEqual(fs.readdirSync(root), ['10-packet.json']);

        const unexplained = path.join(root, 'unexplained.json');
        fs.writeFileSync(unexplained, '{}\n');
        fs.linkSync(unexplained, path.join(root, 'ordinary-hardlink'));
        assert.throws(() => readJson(unexplained), /unexplained hard links/i);
    });

    it('resumes an intent-only crash and a lost successful acquisition response', async () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('intent-only-crash');
        const marker = path.join(temporary('cstar-council-marker-'), 'ready');
        const intentWorker = spawnWorker({
            action: 'intent-hold', repo_root: repo, control_root: control,
            run_id: 'council-crash-run-1', resume_token: token,
            governed_paths: ['src'], marker,
        }).child;
        await killAtMarker(intentWorker, marker);
        const resumed = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        assert.equal(resumed.record.lease_id, fs.readFileSync(marker, 'utf8'));
        assert.equal(resumed.created, true);
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: resumed.record.run_id,
            resumeToken: token, disposition: 'abandoned',
        });

        const secondToken = resumeToken('lost-acquire-response');
        const secondMarker = path.join(temporary('cstar-council-marker-'), 'ready');
        const acquiredWorker = spawnWorker({
            action: 'acquire-hold', repo_root: repo, control_root: control,
            run_id: 'council-crash-run-2', resume_token: secondToken,
            governed_paths: ['src'], marker: secondMarker,
        }).child;
        await killAtMarker(acquiredWorker, secondMarker);
        const replay = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-2',
            governedPaths: ['src'], resumeToken: secondToken,
        });
        assert.equal(replay.record.lease_id, fs.readFileSync(secondMarker, 'utf8'));
        assert.equal(replay.created, false);
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: replay.record.run_id,
            resumeToken: secondToken, disposition: 'abandoned',
        });
    });

    it('recovers only a dead operation owner and preserves the active lease', async () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('dead-operation');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        const marker = path.join(temporary('cstar-council-marker-'), 'ready');
        const child = spawnWorker({
            action: 'operation-hold', repo_root: repo, control_root: control,
            run_id: lease.record.run_id, resume_token: token, marker,
        }).child;
        await killAtMarker(child, marker);
        const recovered = recoverRepositoryLeaseOperation({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        });
        assert.equal(recovered.recovered, true);
        const packet = path.join(control, 'council-autoresearch', lease.record.run_id, '10-packet.json');
        assert.equal(fs.existsSync(packet), true);
        assert.equal(fs.existsSync(receiptSealPath(packet)), false);
        assert.equal(councilRunStatus({ controlRoot: control, runId: lease.record.run_id }), 'LEASED');
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }));
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: token, disposition: 'abandoned',
        });
    });

    it('preserves an unsealed receipt and its guard until governed source is restored', async () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('dead-operation-source-drift');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        const marker = path.join(temporary('cstar-council-marker-'), 'ready');
        const child = spawnWorker({
            action: 'operation-hold', repo_root: repo, control_root: control,
            run_id: lease.record.run_id, resume_token: token, marker,
        }).child;
        await killAtMarker(child, marker);
        const source = path.join(repo, 'src/site.txt');
        fs.writeFileSync(source, 'changed source\n');
        assert.throws(() => recoverRepositoryLeaseOperation({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }), /uncommitted changes|source attestation changed/i);
        assert.equal(fs.existsSync(`${lease.lock_file}.operation`), true);
        fs.writeFileSync(source, 'stable source\n');
        assert.equal(recoverRepositoryLeaseOperation({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }).recovered, true);
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: token, disposition: 'abandoned',
        });
    });

    it('rejects a receipt seal with unexpected data', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('tampered-seal');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        const body = path.join(control, 'council-autoresearch', lease.record.run_id, '00-source-lease.json');
        const seal = receiptSealPath(body);
        const tampered = { ...readJson<Record<string, unknown>>(seal), unexpected: true };
        fs.writeFileSync(seal, `${JSON.stringify(tampered)}\n`);
        assert.throws(
            () => councilRunStatus({ controlRoot: control, runId: lease.record.run_id }),
            /receipt seal contains unexpected or missing fields/i,
        );
    });

    it('replays a release killed after its terminal receipt', async () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('release-crash');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-crash-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        const child = spawnWorker({
            action: 'release-crash', repo_root: repo, control_root: control,
            run_id: lease.record.run_id, resume_token: token,
        }).child;
        const result = await exited(child);
        assert.equal(result.signal, 'SIGKILL');
        const replay = releaseCouncilRun({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: token, disposition: 'abandoned', runnerExecutionRepoRoot: repo,
        });
        assert.equal(replay.created, false);
        assert.equal(councilRunStatus({ controlRoot: control, runId: lease.record.run_id }), 'ABORTED');
        assert.equal(fs.existsSync(lease.lock_file), false);
        assert.equal(fs.existsSync(`${lease.lock_file}.operation`), false);
    });
});
