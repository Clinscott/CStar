import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    executableWorkerJobContractSchema,
    isSubordinateWorkerJobLedgerEnabled,
} from '../../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';
import { CSTAR_KERNEL_TOOL_CLASSES } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import {
    deliverWorkerJobArtifacts,
    listWorkerJobArtifacts,
    stageWorkerJobArtifact,
} from '../../../src/tools/pennyone/intel/worker_job_artifact_ledger.js';
import {
    createWorkerJob,
    leaseWorkerJob,
    markWorkerJobRunning,
    recordWorkerJobExecutionEvidence,
} from '../../../src/tools/pennyone/intel/worker_job_ledger.js';
import {
    heartbeatWorkerJobLease,
    listWorkerJobEvents,
    recoverExpiredWorkerJobLease,
    reportWorkerJobProgress,
    requestWorkerJobCancellation,
} from '../../../src/tools/pennyone/intel/worker_job_lifecycle.js';
import { migrateSyntheticWorkerJobLedger } from '../../../src/tools/pennyone/intel/worker_job_subordinate_migration.js';
import type { ExecutableWorkerJobContract } from '../../../src/types/worker_job.js';
import { WORKER_JOB_STATES } from '../../../src/types/worker_job.js';

const NOW = 1_000_000;
const hash = (character: string) => character.repeat(64);

function fixture(
    suffix = '1',
    overrides: Partial<ExecutableWorkerJobContract> = {},
): ExecutableWorkerJobContract {
    const attemptId = `forge-attempt-r4-${suffix}`;
    return {
        worker_kind: 'forge',
        bead_id: 'bead:cstar:worker-job-r4',
        decision_id: 'decision:cstar:worker-job-r4',
        canonical_request_id: `dispatch-forge-worker-job-r4-${suffix}`,
        canonical_request_sha256: hash('a'),
        authorization_id: `forge-auth-worker-job-r4-${suffix}`,
        authorization_expires_at: NOW + 20_000,
        adapter_runtime_binding_sha256: hash('b'),
        idempotency_key: `worker-job-r4-idempotency-${suffix}`,
        execution_deadline_at: NOW + 15_000,
        attempt_id: attemptId,
        objective: 'Produce the bounded R4 delivery artifact.',
        expected_artifacts: [
            { name: 'result.md', artifact_kind: 'report', required: true },
        ],
        provider_evidence: {
            attempt_id: attemptId,
            provider_started: false,
            provider_requests_started: 0,
            observed_at: NOW,
            evidence_sha256: hash('c'),
        },
        spend_evidence: {
            attempt_id: attemptId,
            spend_uncertain: false,
            known_spend_observed: false,
            observed_at: NOW,
            evidence_sha256: hash('d'),
        },
        ...overrides,
    };
}

function syntheticDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateSyntheticWorkerJobLedger(db, { now: NOW });
    return db;
}

function runningJob(
    db: Database.Database,
    contract: ExecutableWorkerJobContract,
    now = NOW,
) {
    const created = createWorkerJob(db, contract, now).job;
    const lease = leaseWorkerJob(db, created.job_id, 'synthetic-worker', 1_000, now);
    const running = markWorkerJobRunning(db, created.job_id, lease.lease_token, now + 1);
    return { created, lease, running };
}

describe('subordinate worker-job lifecycle binding', () => {
    it('is default-off, absent from the tool catalog, and requires every authority binding', () => {
        assert.equal(isSubordinateWorkerJobLedgerEnabled({}), false);
        assert.equal(isSubordinateWorkerJobLedgerEnabled({
            CSTAR_KERNEL_ENABLE_SUBORDINATE_WORKER_JOBS: 'true',
        }), false);
        assert.equal(isSubordinateWorkerJobLedgerEnabled({
            CSTAR_KERNEL_ENABLE_SUBORDINATE_WORKER_JOBS: '1',
        }), true);
        assert.deepEqual(
            Object.keys(CSTAR_KERNEL_TOOL_CLASSES)
                .filter((name) => name.includes('worker_job')),
            [],
        );
        assert.equal(executableWorkerJobContractSchema.safeParse(fixture()).success, true);
        for (const field of [
            'bead_id',
            'decision_id',
            'canonical_request_id',
            'canonical_request_sha256',
            'authorization_id',
            'authorization_expires_at',
            'adapter_runtime_binding_sha256',
            'idempotency_key',
            'execution_deadline_at',
            'attempt_id',
            'provider_evidence',
            'spend_evidence',
        ]) {
            const candidate = { ...fixture(), [field]: undefined };
            assert.equal(
                executableWorkerJobContractSchema.safeParse(candidate).success,
                false,
                field,
            );
        }
    });

    it('binds idempotency to the complete executable contract and attempt identity', () => {
        const db = syntheticDb();
        const contract = fixture();
        const first = createWorkerJob(db, contract, NOW);
        const replay = createWorkerJob(db, contract, NOW + 30_000);

        assert.equal(first.deduplicated, false);
        assert.equal(replay.deduplicated, true);
        assert.equal(replay.job.job_id, first.job.job_id);
        assert.equal(replay.job.contract_sha256, first.job.contract_sha256);
        assert.throws(
            () => createWorkerJob(db, { ...contract, objective: 'Different work.' }, NOW),
            /Idempotency key is bound to a different executable contract/,
        );
        const competing = fixture('2');
        competing.attempt_id = contract.attempt_id;
        competing.provider_evidence.attempt_id = contract.attempt_id;
        competing.spend_evidence.attempt_id = contract.attempt_id;
        assert.throws(
            () => createWorkerJob(db, competing, NOW),
            /Attempt identity is already bound/,
        );
        db.close();
    });

    it('binds lease, heartbeat, progress, and execution evidence to one attempt', () => {
        const db = syntheticDb();
        const contract = fixture();
        const { created, lease } = runningJob(db, contract);
        const heartbeat = heartbeatWorkerJobLease(
            db,
            created.job_id,
            lease.lease_token,
            2_000,
            NOW + 100,
        );
        assert.equal(heartbeat.attempt_id, contract.attempt_id);
        assert.equal(heartbeat.lease_expires_at, NOW + 2_100);

        const progress = reportWorkerJobProgress(
            db,
            created.job_id,
            lease.lease_token,
            50,
            'working',
            NOW + 200,
        );
        assert.equal(progress.progress_percent, 50);
        const evidence = recordWorkerJobExecutionEvidence(
            db,
            created.job_id,
            lease.lease_token,
            {
                attempt_id: contract.attempt_id,
                provider_started: true,
                provider_requests_started: 1,
                observed_at: NOW + 250,
                evidence_sha256: hash('e'),
            },
            {
                attempt_id: contract.attempt_id,
                spend_uncertain: true,
                known_spend_observed: false,
                observed_at: NOW + 250,
                evidence_sha256: hash('f'),
            },
            NOW + 300,
        );
        assert.equal(evidence.provider_evidence.provider_started, true);
        assert.equal(evidence.spend_evidence.spend_uncertain, true);
        db.close();
    });

    it('delivers artifacts only as DELIVERED_UNVERIFIED and exposes no success state', () => {
        const db = syntheticDb();
        const contract = fixture();
        const { created, lease } = runningJob(db, contract);
        recordWorkerJobExecutionEvidence(
            db,
            created.job_id,
            lease.lease_token,
            {
                attempt_id: contract.attempt_id,
                provider_started: true,
                provider_requests_started: 1,
                observed_at: NOW + 10,
                evidence_sha256: hash('e'),
            },
            {
                attempt_id: contract.attempt_id,
                spend_uncertain: false,
                known_spend_observed: true,
                observed_at: NOW + 10,
                evidence_sha256: hash('f'),
            },
            NOW + 20,
        );
        stageWorkerJobArtifact(
            db,
            created.job_id,
            lease.lease_token,
            {
                artifact_id: 'worker-artifact-r4-result',
                attempt_id: contract.attempt_id,
                artifact_kind: 'report',
                name: 'result.md',
                media_type: 'text/markdown',
                byte_count: 42,
                sha256: hash('1'),
                storage_ref: 'cstar-storage:synthetic/result-r4',
            },
            NOW + 30,
        );
        const delivered = deliverWorkerJobArtifacts(
            db,
            created.job_id,
            lease.lease_token,
            NOW + 40,
        );

        assert.equal(delivered.state, 'DELIVERED_UNVERIFIED');
        assert.deepEqual(
            listWorkerJobArtifacts(db, created.job_id).map((artifact) => artifact.status),
            ['DELIVERED_UNVERIFIED'],
        );
        assert.equal(
            listWorkerJobEvents(db, created.job_id).at(-1)?.event_kind,
            'delivered_unverified',
        );
        assert.equal((WORKER_JOB_STATES as readonly string[]).includes('SUCCEEDED'), false);
        assert.equal((WORKER_JOB_STATES as readonly string[]).includes('SUCCESS'), false);
        db.close();
    });

    it('terminalizes an expired lease without retry only with exact zero-provider proof', () => {
        const db = syntheticDb();
        const contract = fixture();
        const created = createWorkerJob(db, contract, NOW).job;
        leaseWorkerJob(db, created.job_id, 'synthetic-worker', 1_000, NOW);

        const recovered = recoverExpiredWorkerJobLease(
            db,
            created.job_id,
            {
                attempt_id: contract.attempt_id,
                provider_requests_started: 0,
                known_spend_observed: false,
                spend_uncertain: false,
                observed_at: NOW + 1_001,
                evidence_sha256: hash('9'),
            },
            NOW + 1_001,
        );
        assert.equal(recovered.state, 'FAILED');
        assert.equal(recovered.failure_code, 'LEASE_EXPIRED_ZERO_PROVIDER');
        assert.equal(
            db.prepare("SELECT COUNT(*) FROM hall_worker_jobs WHERE state = 'QUEUED'")
                .pluck().get(),
            0,
        );
        assert.equal(db.prepare('SELECT COUNT(*) FROM hall_worker_jobs').pluck().get(), 1);
        db.close();
    });

    it('marks recovery UNKNOWN without exact proof or after provider start', () => {
        const firstDb = syntheticDb();
        const first = runningJob(firstDb, fixture());
        const unknown = recoverExpiredWorkerJobLease(
            firstDb,
            first.created.job_id,
            undefined,
            NOW + 1_001,
        );
        assert.equal(unknown.state, 'UNKNOWN');
        assert.equal(unknown.progress_phase, 'unknown');
        firstDb.close();

        const secondDb = syntheticDb();
        const contract = fixture('2');
        const second = runningJob(secondDb, contract);
        recordWorkerJobExecutionEvidence(
            secondDb,
            second.created.job_id,
            second.lease.lease_token,
            {
                attempt_id: contract.attempt_id,
                provider_started: true,
                provider_requests_started: 1,
                observed_at: NOW + 10,
                evidence_sha256: hash('e'),
            },
            {
                attempt_id: contract.attempt_id,
                spend_uncertain: true,
                known_spend_observed: false,
                observed_at: NOW + 10,
                evidence_sha256: hash('f'),
            },
            NOW + 20,
        );
        const providerUnknown = recoverExpiredWorkerJobLease(
            secondDb,
            second.created.job_id,
            {
                attempt_id: contract.attempt_id,
                provider_requests_started: 0,
                known_spend_observed: false,
                spend_uncertain: false,
                observed_at: NOW + 1_001,
                evidence_sha256: hash('9'),
            },
            NOW + 1_001,
        );
        assert.equal(providerUnknown.state, 'UNKNOWN');
        secondDb.close();
    });

    it('enforces absolute authority deadlines and cooperative cancellation', () => {
        const db = syntheticDb();
        const contract = fixture('deadline', {
            authorization_expires_at: NOW + 2_000,
            execution_deadline_at: NOW + 1_000,
        });
        const created = createWorkerJob(db, contract, NOW).job;
        assert.throws(
            () => leaseWorkerJob(db, created.job_id, 'synthetic-worker', 1_000, NOW + 1_000),
            /absolute execution deadline has elapsed/,
        );
        const cancelled = requestWorkerJobCancellation(db, created.job_id, 'operator stop', NOW + 500);
        assert.equal(cancelled.job.state, 'CANCELLED');
        assert.equal(cancelled.job.cancel_reason, 'operator stop');
        assert.equal(
            requestWorkerJobCancellation(db, created.job_id, undefined, NOW + 600).changed,
            false,
        );
        db.close();
    });
});
