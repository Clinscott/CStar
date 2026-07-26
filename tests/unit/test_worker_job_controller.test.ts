import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
    claimNextWorkerJob,
    createWorkerJob,
    getWorkerJob,
    getWorkerJobArtifact,
    heartbeatWorkerJobLease,
    listWorkerJobArtifacts,
    markWorkerJobRunning,
    recoverExpiredWorkerJobLeases,
    reportWorkerJobProgress,
    requestWorkerJobCancellation,
    WorkerJobControllerError,
} from '../../src/tools/pennyone/intel/worker_job_controller.js';
import {
    completeWorkerJob,
    failWorkerJob,
    saveWorkerJobArtifact,
} from '../../src/tools/pennyone/intel/worker_job_completion_controller.js';
import { database } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import {
    handleFetchWorkerArtifact,
    handleGetWorkerJob,
    handleStartWorkerJob,
} from '../../src/tools/cstar-kernel-mcp/tools/worker_jobs.js';

const previousRoot = registry.getRoot();
const previousFlag = process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
let tmpRoot = '';

function jobInput(idempotencyKey: string, objective = 'Prepare a bounded change.') {
    return {
        worker_kind: 'forge' as const,
        objective,
        workspace_ref: 'cstar-main',
        expected_artifacts: [
            { name: 'report.md', artifact_kind: 'report' as const, required: true },
            { name: 'bundle.zip', artifact_kind: 'package' as const, required: false },
        ],
        idempotency_key: idempotencyKey,
    };
}

function assertControllerCode(code: string) {
    return (error: unknown): boolean => {
        assert.ok(error instanceof WorkerJobControllerError);
        assert.equal(error.code, code);
        return true;
    };
}

describe('durable Worker Jobs v2 controller', () => {
    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-worker-jobs-'));
        registry.setRoot(tmpRoot);
        process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2 = '1';
    });

    afterEach(() => {
        database.close();
        registry.setRoot(previousRoot);
        if (previousFlag === undefined) delete process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
        else process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2 = previousFlag;
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('persists a queued job and binds exact retries to one idempotency key', () => {
        const input = jobInput('worker-replay-0001');
        const first = createWorkerJob(input);
        const replay = createWorkerJob(input);

        assert.equal(first.job.state, 'QUEUED');
        assert.equal(first.job.attempt_count, 0);
        assert.equal(first.deduplicated, false);
        assert.equal(replay.deduplicated, true);
        assert.equal(replay.job.job_id, first.job.job_id);
        assert.throws(
            () => createWorkerJob(jobInput('worker-replay-0001', 'A different request.')),
            assertControllerCode('IDEMPOTENCY_CONFLICT'),
        );
        assert.throws(
            () => createWorkerJob({
                ...jobInput('worker-duplicate-artifacts-0001'),
                expected_artifacts: [
                    { name: 'same.md', artifact_kind: 'report', required: true },
                    { name: 'same.md', artifact_kind: 'report', required: false },
                ],
            }),
            assertControllerCode('ARTIFACT_CONTRACT_INVALID'),
        );
        assert.deepEqual(listWorkerJobArtifacts(first.job.job_id, tmpRoot, []), []);

        const row = database.getDb(tmpRoot).prepare(`
            SELECT idempotency_key_hash, request_fingerprint
            FROM hall_worker_jobs WHERE job_id = ?
        `).get(first.job.job_id) as Record<string, string>;
        assert.equal(row.idempotency_key_hash.length, 64);
        assert.equal(row.request_fingerprint.length, 64);
        assert.notEqual(row.idempotency_key_hash, input.idempotency_key);

        database.close();
        assert.equal(getWorkerJob(first.job.job_id)?.state, 'QUEUED');
    });

    it('keeps start inert and returns only model-safe structured job state', async () => {
        const result = await handleStartWorkerJob(jobInput('worker-public-0001'));
        const payload = (result as any).structuredContent as Record<string, any>;

        assert.equal(result.isError, undefined);
        assert.equal(payload.status, 'queued');
        assert.equal(payload.execution_available, false);
        assert.equal(payload.job.state, 'QUEUED');
        assert.equal(payload.job.attempt_count, 0);
        const replay = await handleStartWorkerJob(jobInput('worker-public-0001'));
        assert.equal((replay as any).structuredContent.status, 'existing');
        assert.equal((replay as any).structuredContent.job.state, 'QUEUED');
        const serialized = JSON.stringify(result);
        for (const privateField of [
            'lease_token',
            'lease_owner_id',
            'storage_ref',
            'idempotency_key_hash',
            'request_fingerprint',
            'provider',
            'credential',
            'profile',
            'command',
            'host_path',
        ]) {
            assert.equal(serialized.includes(`"${privateField}"`), false);
        }

        const read = await handleGetWorkerJob({ job_id: payload.job.job_id });
        assert.deepEqual((read as any).structuredContent, {
            status: 'ok',
            execution_available: false,
            job: payload.job,
        });
    });

    it('enforces leases, monotonic progress, bounded artifacts, and atomic completion', async () => {
        const queued = createWorkerJob(jobInput('worker-lifecycle-0001')).job;
        assert.throws(
            () => claimNextWorkerJob('forge', '../worker', 10_000),
            assertControllerCode('LEASE_OWNER_INVALID'),
        );
        assert.throws(
            () => claimNextWorkerJob('forge', 'local-worker-1', 999),
            assertControllerCode('LEASE_DURATION_INVALID'),
        );
        const lease = claimNextWorkerJob('forge', 'local-worker-1', 10_000);
        assert.ok(lease);
        assert.equal(lease.job.job_id, queued.job_id);
        assert.equal(lease.job.state, 'LEASED');

        markWorkerJobRunning(queued.job_id, lease.lease_token);
        reportWorkerJobProgress(queued.job_id, lease.lease_token, 40, 'working');
        assert.throws(
            () => reportWorkerJobProgress(queued.job_id, lease.lease_token, 30, 'working'),
            assertControllerCode('INVALID_PROGRESS'),
        );
        assert.throws(
            () => reportWorkerJobProgress(queued.job_id, lease.lease_token, 40.5, 'working'),
            assertControllerCode('INVALID_PROGRESS'),
        );
        assert.throws(
            () => reportWorkerJobProgress(
                queued.job_id,
                lease.lease_token,
                50,
                'queued' as any,
            ),
            assertControllerCode('INVALID_PROGRESS'),
        );
        assert.throws(
            () => completeWorkerJob(queued.job_id, lease.lease_token),
            assertControllerCode('REQUIRED_ARTIFACT_MISSING'),
        );
        assert.throws(
            () => saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
                name: 'bundle.zip',
                artifact_kind: 'package',
                media_type: 'application/zip',
                storage_ref: '/tmp/private.zip',
                byte_count: 120,
                sha256: 'a'.repeat(64),
            }),
            assertControllerCode('STORAGE_REF_INVALID'),
        );
        assert.throws(
            () => saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
                name: 'report.md',
                artifact_kind: 'report',
                media_type: 'text/markdown',
                inline_text: 'x'.repeat(256 * 1024 + 1),
            }),
            assertControllerCode('INLINE_ARTIFACT_TOO_LARGE'),
        );

        const report = saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
            name: 'report.md',
            artifact_kind: 'report',
            media_type: 'text/markdown',
            inline_text: '# Result\nDone.',
        });
        assert.equal(
            saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
                name: 'report.md',
                artifact_kind: 'report',
                media_type: 'text/markdown',
                inline_text: '# Result\nDone.',
            }).artifact_id,
            report.artifact_id,
        );
        assert.throws(
            () => saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
                name: 'report.md',
                artifact_kind: 'report',
                media_type: 'text/markdown',
                inline_text: '# Different result',
            }),
            assertControllerCode('ARTIFACT_CONFLICT'),
        );
        const bundle = saveWorkerJobArtifact(queued.job_id, lease.lease_token, {
            name: 'bundle.zip',
            artifact_kind: 'package',
            media_type: 'application/zip',
            storage_ref: 'cstar-storage:bundle-001',
            byte_count: 120,
            sha256: 'a'.repeat(64),
        });
        assert.equal(getWorkerJobArtifact(queued.job_id, report.artifact_id), null);

        const completed = completeWorkerJob(queued.job_id, lease.lease_token);
        assert.equal(completed.state, 'SUCCEEDED');
        assert.equal(completed.progress_percent, 100);
        assert.equal(getWorkerJobArtifact(queued.job_id, report.artifact_id)?.status, 'READY');

        const read = await handleGetWorkerJob({ job_id: queued.job_id });
        const serialized = JSON.stringify(read);
        assert.equal(serialized.includes('cstar-storage:bundle-001'), false);
        assert.equal(serialized.includes('"storage_ref"'), false);
        const fetched = await handleFetchWorkerArtifact({
            job_id: queued.job_id,
            artifact_id: report.artifact_id,
        });
        assert.equal((fetched as any).structuredContent.delivery.text, '# Result\nDone.');
        const privateFetch = await handleFetchWorkerArtifact({
            job_id: queued.job_id,
            artifact_id: bundle.artifact_id,
        });
        assert.equal(privateFetch.isError, true);
        assert.equal(privateFetch.content[0]?.text.includes('cstar-storage:bundle-001'), false);
    });

    it('makes cancellation win and recovers expired leases without execution', async () => {
        const active = createWorkerJob(jobInput('worker-cancel-0001')).job;
        const activeLease = claimNextWorkerJob('forge', 'local-worker-1', 10_000);
        assert.ok(activeLease);
        markWorkerJobRunning(active.job_id, activeLease.lease_token);
        const cancel = requestWorkerJobCancellation(active.job_id, 'Stop this work.', undefined);
        assert.equal(cancel.job.state, 'CANCEL_REQUESTED');
        assert.throws(
            () => heartbeatWorkerJobLease(active.job_id, activeLease.lease_token, 10_000),
            assertControllerCode('CANCEL_REQUESTED'),
        );
        assert.equal(completeWorkerJob(active.job_id, activeLease.lease_token).state, 'CANCELLED');

        const retrying = createWorkerJob(jobInput('worker-recover-0001')).job;
        const retryLease = claimNextWorkerJob('forge', 'local-worker-2', 1_000);
        assert.ok(retryLease);
        markWorkerJobRunning(retrying.job_id, retryLease.lease_token);
        reportWorkerJobProgress(retrying.job_id, retryLease.lease_token, 80, 'working');
        assert.deepEqual(
            recoverExpiredWorkerJobLeases(tmpRoot, retryLease.lease_expires_at + 1),
            [retrying.job_id],
        );
        assert.equal(getWorkerJob(retrying.job_id)?.state, 'QUEUED');
        assert.equal(getWorkerJob(retrying.job_id)?.progress_percent, 0);
        assert.throws(
            () => markWorkerJobRunning(retrying.job_id, retryLease.lease_token),
            assertControllerCode('LEASE_INVALID'),
        );

        const failedLease = claimNextWorkerJob('forge', 'local-worker-3', 10_000);
        assert.ok(failedLease);
        markWorkerJobRunning(retrying.job_id, failedLease.lease_token);
        reportWorkerJobProgress(retrying.job_id, failedLease.lease_token, 60, 'validating');
        const requeued = failWorkerJob(
                retrying.job_id,
                failedLease.lease_token,
                'WORKER_TRANSIENT',
                'Retry later.',
                true,
            );
        assert.equal(requeued.state, 'QUEUED');
        assert.equal(requeued.progress_percent, 0);

        const queued = createWorkerJob(jobInput('worker-queued-cancel-0001')).job;
        const immediate = requestWorkerJobCancellation(queued.job_id, undefined, queued.version);
        assert.equal(immediate.job.state, 'CANCELLED');
        assert.equal(immediate.changed, true);
        assert.equal(
            requestWorkerJobCancellation(queued.job_id, undefined, queued.version).changed,
            false,
        );
        const replay = await handleStartWorkerJob(jobInput('worker-queued-cancel-0001'));
        assert.equal((replay as any).structuredContent.status, 'existing');
        assert.equal((replay as any).structuredContent.job.state, 'CANCELLED');
    });
});
