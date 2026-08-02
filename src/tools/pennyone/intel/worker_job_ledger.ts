import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
    ExecutableWorkerJobContract,
    WorkerJobArtifactExpectation,
    WorkerJobDispatchReservation,
    WorkerJobLeaseGrant,
    WorkerJobLeaseRecord,
    WorkerJobProgressPhase,
    WorkerJobProviderEvidence,
    WorkerJobRecord,
    WorkerJobSpendEvidence,
    WorkerJobState,
} from '../../../types/worker_job.js';
import { WORKER_JOB_ATTEMPT_CEILING } from '../../../types/worker_job.js';
import { WorkerJobLedgerError } from './worker_job_errors.js';
import { assertCurrentWorkerJobLedgerSchema } from './worker_job_subordinate_migration.js';
import {
    boundedDetail,
    normalizeWorkerJobContract,
    requireExecutableAt,
    sha256,
    validateMonotonicExecutionEvidence,
    workerJobContractSha256,
} from './worker_job_validation.js';

type Row = Record<string, unknown>;

function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : Number(value);
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function materializeJob(row: Row): WorkerJobRecord {
    const attemptId = String(row.attempt_id);
    const expectations = JSON.parse(
        String(row.expected_artifacts_json),
    ) as WorkerJobArtifactExpectation[];
    return {
        job_id: String(row.job_id),
        worker_kind: row.worker_kind as WorkerJobRecord['worker_kind'],
        bead_id: String(row.bead_id),
        decision_id: String(row.decision_id),
        canonical_request_id: String(row.canonical_request_id),
        canonical_request_sha256: String(row.canonical_request_sha256),
        authorization_id: String(row.authorization_id),
        authorization_expires_at: Number(row.authorization_expires_at),
        adapter_runtime_binding_sha256: String(row.adapter_runtime_binding_sha256),
        idempotency_key: String(row.idempotency_key),
        execution_deadline_at: Number(row.execution_deadline_at),
        attempt_id: attemptId,
        objective: String(row.objective),
        expected_artifacts: expectations,
        provider_evidence: {
            attempt_id: attemptId,
            provider_started: Number(row.provider_started) === 1,
            provider_requests_started: Number(row.provider_requests_started),
            observed_at: Number(row.provider_evidence_observed_at),
            evidence_sha256: String(row.provider_evidence_sha256),
        },
        spend_evidence: {
            attempt_id: attemptId,
            spend_uncertain: Number(row.spend_uncertain) === 1,
            known_spend_observed: Number(row.known_spend_observed) === 1,
            observed_at: Number(row.spend_evidence_observed_at),
            evidence_sha256: String(row.spend_evidence_sha256),
        },
        contract_sha256: String(row.contract_sha256),
        state: row.state as WorkerJobState,
        progress_percent: Number(row.progress_percent),
        progress_phase: row.progress_phase as WorkerJobProgressPhase,
        cancel_requested_at: optionalNumber(row.cancel_requested_at),
        cancel_reason: optionalString(row.cancel_reason),
        failure_code: optionalString(row.failure_code),
        failure_summary: optionalString(row.failure_summary),
        version: Number(row.version),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
        terminal_at: optionalNumber(row.terminal_at),
    };
}

export function requireWorkerJobRecord(
    db: Database.Database,
    jobId: string,
): WorkerJobRecord {
    const row = db.prepare('SELECT * FROM hall_worker_jobs WHERE job_id = ?')
        .get(jobId) as Row | undefined;
    if (!row) {
        throw new WorkerJobLedgerError('WORKER_JOB_NOT_FOUND', `Worker job not found: ${jobId}`);
    }
    return materializeJob(row);
}

export function appendWorkerJobEvent(
    db: Database.Database,
    job: WorkerJobRecord,
    kind: string,
    evidenceSha256?: string,
    detail?: string,
): void {
    db.prepare(`
        INSERT INTO hall_worker_job_events (
            event_id, job_id, attempt_id, event_kind, state, progress_percent,
            progress_phase, evidence_sha256, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        `worker-job-event-${crypto.randomUUID()}`,
        job.job_id,
        job.attempt_id,
        kind,
        job.state,
        job.progress_percent,
        job.progress_phase,
        evidenceSha256 ?? null,
        boundedDetail(detail, 512) ?? null,
        job.updated_at,
    );
}

function tokenMatches(rawToken: string, expectedSha256: string): boolean {
    const actual = Buffer.from(sha256(rawToken), 'hex');
    const expected = Buffer.from(expectedSha256, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function requireWorkerJobLease(
    db: Database.Database,
    job: WorkerJobRecord,
    rawToken: string,
    now: number,
): WorkerJobLeaseRecord {
    const row = db.prepare('SELECT * FROM hall_worker_job_leases WHERE job_id = ?')
        .get(job.job_id) as Row | undefined;
    if (!row || String(row.attempt_id) !== job.attempt_id
        || !tokenMatches(rawToken, String(row.lease_token_sha256))) {
        throw new WorkerJobLedgerError('WORKER_JOB_LEASE_INVALID', 'Worker-job lease is invalid.');
    }
    const lease: WorkerJobLeaseRecord = {
        job_id: job.job_id,
        attempt_id: job.attempt_id,
        lease_owner_id: String(row.lease_owner_id),
        lease_token_sha256: String(row.lease_token_sha256),
        leased_at: Number(row.leased_at),
        lease_expires_at: Number(row.lease_expires_at),
        heartbeat_at: Number(row.heartbeat_at),
    };
    if (lease.lease_expires_at <= now) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_LEASE_EXPIRED',
            'Worker-job lease expired and requires explicit recovery.',
        );
    }
    requireExecutableAt(job, now);
    return lease;
}

export function requireWorkerJobLeaseDuration(durationMs: number): void {
    if (!Number.isSafeInteger(durationMs) || durationMs < 1_000 || durationMs > 900_000) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_LEASE_DURATION_INVALID',
            'Lease duration must be an integer from 1000 to 900000 milliseconds.',
        );
    }
}

export function createWorkerJob(
    db: Database.Database,
    input: ExecutableWorkerJobContract,
    now = Date.now(),
): { job: WorkerJobRecord; deduplicated: boolean } {
    assertCurrentWorkerJobLedgerSchema(db);
    const contract = normalizeWorkerJobContract(input);
    const contractSha256 = workerJobContractSha256(contract);
    const create = db.transaction(() => {
        const existing = db.prepare(
            'SELECT * FROM hall_worker_jobs WHERE idempotency_key = ?',
        ).get(contract.idempotency_key) as Row | undefined;
        if (existing) {
            const job = materializeJob(existing);
            if (job.contract_sha256 !== contractSha256) {
                throw new WorkerJobLedgerError(
                    'WORKER_JOB_IDEMPOTENCY_CONFLICT',
                    'Idempotency key is bound to a different executable contract.',
                );
            }
            return { job, deduplicated: true };
        }
        const reserved = Number((db.prepare(`
            SELECT COUNT(*) AS count FROM hall_worker_jobs
            WHERE canonical_request_id = ?
        `).get(contract.canonical_request_id) as { count?: number }).count ?? 0);
        if (reserved >= WORKER_JOB_ATTEMPT_CEILING) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_ATTEMPT_CEILING_EXCEEDED',
                'Only one provider-bearing attempt may be reserved for a canonical request.',
            );
        }
        requireExecutableAt(contract, now);
        const jobId = `worker-job-${crypto.randomUUID()}`;
        db.prepare(`
            INSERT INTO hall_worker_jobs (
                job_id, worker_kind, bead_id, decision_id, canonical_request_id,
                canonical_request_sha256, authorization_id, authorization_expires_at,
                adapter_runtime_binding_sha256, idempotency_key, execution_deadline_at,
                attempt_id, objective, expected_artifacts_json, contract_sha256,
                state, progress_percent, progress_phase, provider_started,
                provider_requests_started, provider_evidence_sha256,
                provider_evidence_observed_at, spend_uncertain, known_spend_observed,
                spend_evidence_sha256, spend_evidence_observed_at, version,
                created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'QUEUED', 0, 'queued', 0, 0, ?, ?, 0, 0, ?, ?, 1, ?, ?
            )
        `).run(
            jobId,
            contract.worker_kind,
            contract.bead_id,
            contract.decision_id,
            contract.canonical_request_id,
            contract.canonical_request_sha256,
            contract.authorization_id,
            contract.authorization_expires_at,
            contract.adapter_runtime_binding_sha256,
            contract.idempotency_key,
            contract.execution_deadline_at,
            contract.attempt_id,
            contract.objective,
            JSON.stringify(contract.expected_artifacts),
            contractSha256,
            contract.provider_evidence.evidence_sha256,
            contract.provider_evidence.observed_at,
            contract.spend_evidence.evidence_sha256,
            contract.spend_evidence.observed_at,
            now,
            now,
        );
        const job = requireWorkerJobRecord(db, jobId);
        appendWorkerJobEvent(
            db,
            job,
            'queued',
            contractSha256,
            `request=${contract.canonical_request_id} authorization=${contract.authorization_id}`,
        );
        return { job, deduplicated: false };
    });
    try {
        return create.immediate();
    } catch (error) {
        if (error instanceof Error && /attempt_id/.test(error.message)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_ATTEMPT_CONFLICT',
                'Attempt identity is already bound to another worker job.',
            );
        }
        throw error;
    }
}

export function getWorkerJob(
    db: Database.Database,
    jobId: string,
): WorkerJobRecord | null {
    assertCurrentWorkerJobLedgerSchema(db);
    const row = db.prepare('SELECT * FROM hall_worker_jobs WHERE job_id = ?')
        .get(jobId) as Row | undefined;
    return row ? materializeJob(row) : null;
}

export function leaseWorkerJob(
    db: Database.Database,
    jobId: string,
    leaseOwnerId: string,
    leaseDurationMs: number,
    now = Date.now(),
): WorkerJobLeaseGrant {
    assertCurrentWorkerJobLedgerSchema(db);
    requireWorkerJobLeaseDuration(leaseDurationMs);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/.test(leaseOwnerId)) {
        throw new WorkerJobLedgerError('WORKER_JOB_LEASE_OWNER_INVALID', 'Lease owner is invalid.');
    }
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        if (job.state !== 'QUEUED') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_LEASE_STATE_INVALID',
                `Cannot lease a ${job.state} worker job.`,
            );
        }
        requireExecutableAt(job, now);
        const leaseExpiresAt = Math.min(
            now + leaseDurationMs,
            job.execution_deadline_at,
            job.authorization_expires_at,
        );
        const leaseToken = crypto.randomBytes(32).toString('base64url');
        db.prepare(`
            INSERT INTO hall_worker_job_leases (
                job_id, attempt_id, lease_owner_id, lease_token_sha256,
                leased_at, lease_expires_at, heartbeat_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            job.job_id,
            job.attempt_id,
            leaseOwnerId,
            sha256(leaseToken),
            now,
            leaseExpiresAt,
            now,
        );
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = 'LEASED', progress_phase = 'preparing',
                updated_at = ?, version = version + 1
            WHERE job_id = ? AND state = 'QUEUED'
        `).run(now, job.job_id);
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, updated, 'leased');
        appendWorkerJobEvent(
            db,
            updated,
            'dispatch_reserved',
            undefined,
            'host_launch_required=true cstar_launch=false',
        );
        return { job: updated, lease_token: leaseToken, lease_expires_at: leaseExpiresAt };
    }).immediate();
}

/**
 * Reserve one durable dispatch handoff. This records ownership of the lease;
 * the returned host handoff never launches a worker or provider in CStar.
 */
export function reserveWorkerJobDispatch(
    db: Database.Database,
    jobId: string,
    hostOwnerId: string,
    leaseDurationMs: number,
    now = Date.now(),
): WorkerJobDispatchReservation {
    const grant = leaseWorkerJob(db, jobId, hostOwnerId, leaseDurationMs, now);
    return {
        ...grant,
        dispatch_id: workerJobDispatchId(grant.job.job_id),
        host_launch_required: true,
        cstar_launch: false,
    };
}

export function workerJobDispatchId(jobId: string): string {
    return `worker-dispatch-${sha256(jobId).slice(0, 32)}`;
}

export function markWorkerJobRunning(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        requireWorkerJobLease(db, job, leaseToken, now);
        if (job.state !== 'LEASED') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_START_STATE_INVALID',
                `Cannot start a ${job.state} worker job.`,
            );
        }
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = 'RUNNING', progress_phase = 'working',
                updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(now, job.job_id);
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, updated, 'running');
        return updated;
    }).immediate();
}

export function recordWorkerJobExecutionEvidence(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    provider: WorkerJobProviderEvidence,
    spend: WorkerJobSpendEvidence,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        requireWorkerJobLease(db, job, leaseToken, now);
        if (job.state !== 'RUNNING') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_EVIDENCE_STATE_INVALID',
                'Execution evidence requires a running worker job.',
            );
        }
        validateMonotonicExecutionEvidence(job, provider, spend);
        if (provider.observed_at > now || spend.observed_at > now) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_EVIDENCE_TIME_INVALID',
                'Execution evidence cannot be observed in the future.',
            );
        }
        db.prepare(`
            UPDATE hall_worker_jobs SET
                provider_started = CASE WHEN provider_started = 1 OR ? = 1 THEN 1 ELSE 0 END,
                provider_requests_started = MAX(provider_requests_started, ?),
                provider_evidence_sha256 = ?, provider_evidence_observed_at =
                    MAX(provider_evidence_observed_at, ?),
                spend_uncertain = CASE WHEN spend_uncertain = 1 OR ? = 1 THEN 1 ELSE 0 END,
                known_spend_observed = CASE WHEN known_spend_observed = 1 OR ? = 1 THEN 1 ELSE 0 END,
                spend_evidence_sha256 = ?, spend_evidence_observed_at =
                    MAX(spend_evidence_observed_at, ?),
                updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            provider.provider_started ? 1 : 0,
            provider.provider_requests_started,
            provider.evidence_sha256,
            provider.observed_at,
            spend.spend_uncertain ? 1 : 0,
            spend.known_spend_observed ? 1 : 0,
            spend.evidence_sha256,
            spend.observed_at,
            now,
            job.job_id,
        );
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, updated, 'provider_started', provider.evidence_sha256);
        return updated;
    }).immediate();
}
