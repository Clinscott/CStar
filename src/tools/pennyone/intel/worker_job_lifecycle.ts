import type Database from 'better-sqlite3';
import type {
    WorkerJobEventRecord,
    WorkerJobLeaseRecord,
    WorkerJobProgressPhase,
    WorkerJobRepairInput,
    WorkerJobRecord,
    WorkerJobReplayAuthorization,
    WorkerJobState,
    WorkerJobZeroProviderProof,
} from '../../../types/worker_job.js';
import { WORKER_JOB_ZERO_PROVIDER_REPLAY_CEILING } from '../../../types/worker_job.js';
import { workerJobZeroProviderProofSchema } from '../../cstar-kernel-mcp/contracts/worker_jobs.js';
import { WorkerJobLedgerError } from './worker_job_errors.js';
import {
    appendWorkerJobEvent,
    requireWorkerJobLease,
    requireWorkerJobLeaseDuration,
    requireWorkerJobRecord,
} from './worker_job_ledger.js';
import { assertCurrentWorkerJobLedgerSchema } from './worker_job_subordinate_migration.js';
import {
    boundedDetail,
    sha256,
    validateRepairInput,
} from './worker_job_validation.js';

type Row = Record<string, unknown>;
const ACTIVE_STATES: WorkerJobState[] = ['LEASED', 'RUNNING', 'CANCEL_REQUESTED'];

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rejectStagedArtifacts(db: Database.Database, jobId: string, now: number): void {
    db.prepare(`
        UPDATE hall_worker_job_artifacts
        SET status = 'REJECTED', updated_at = ?
        WHERE job_id = ? AND status = 'STAGED'
    `).run(now, jobId);
}

export function heartbeatWorkerJobLease(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    leaseDurationMs: number,
    now = Date.now(),
): WorkerJobLeaseRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    requireWorkerJobLeaseDuration(leaseDurationMs);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        const lease = requireWorkerJobLease(db, job, leaseToken, now);
        if (!ACTIVE_STATES.includes(job.state)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_HEARTBEAT_STATE_INVALID',
                `Cannot heartbeat a ${job.state} worker job.`,
            );
        }
        const expires = Math.min(
            now + leaseDurationMs,
            job.execution_deadline_at,
            job.authorization_expires_at,
        );
        db.prepare(`
            UPDATE hall_worker_job_leases
            SET lease_expires_at = ?, heartbeat_at = ?
            WHERE job_id = ?
        `).run(expires, now, job.job_id);
        return { ...lease, lease_expires_at: expires, heartbeat_at: now };
    }).immediate();
}

export function reportWorkerJobProgress(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    percent: number,
    phase: Exclude<WorkerJobProgressPhase, 'queued' | 'complete' | 'unknown'>,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    if (!Number.isSafeInteger(percent) || percent < 0 || percent > 99
        || !['preparing', 'working', 'validating', 'finalizing'].includes(phase)) {
        throw new WorkerJobLedgerError('WORKER_JOB_PROGRESS_INVALID', 'Progress is invalid.');
    }
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        requireWorkerJobLease(db, job, leaseToken, now);
        if (!['RUNNING', 'CANCEL_REQUESTED'].includes(job.state)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_PROGRESS_STATE_INVALID',
                `Cannot report progress for a ${job.state} worker job.`,
            );
        }
        if (percent < job.progress_percent) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_PROGRESS_REGRESSION',
                'Worker-job progress cannot move backwards.',
            );
        }
        db.prepare(`
            UPDATE hall_worker_jobs
            SET progress_percent = ?, progress_phase = ?,
                updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(percent, phase, now, job.job_id);
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, updated, 'progress');
        return updated;
    }).immediate();
}

export function requestWorkerJobCancellation(
    db: Database.Database,
    jobId: string,
    reason?: string,
    now = Date.now(),
): { job: WorkerJobRecord; changed: boolean } {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        if (['CANCELLED', 'CANCEL_REQUESTED'].includes(job.state)) {
            return { job, changed: false };
        }
        if (['DELIVERED_UNVERIFIED', 'DELIVERED', 'VALIDATING', 'ACCEPTED',
            'REPAIR_QUEUED', 'NEEDS_INPUT', 'DOMAIN_TERMINAL', 'FAILED', 'UNKNOWN']
            .includes(job.state)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_CANCEL_STATE_INVALID',
                `Cannot cancel a ${job.state} worker job.`,
            );
        }
        const state: WorkerJobState = job.state === 'QUEUED' ? 'CANCELLED' : 'CANCEL_REQUESTED';
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, cancel_requested_at = ?, cancel_reason = ?,
                progress_phase = ?, terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            state,
            now,
            boundedDetail(reason, 500) ?? null,
            state === 'CANCELLED' ? 'complete' : job.progress_phase,
            state === 'CANCELLED' ? now : null,
            now,
            job.job_id,
        );
        if (state === 'CANCELLED') {
            db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        }
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(
            db,
            updated,
            state === 'CANCELLED' ? 'cancelled' : 'cancel_requested',
        );
        return { job: updated, changed: true };
    }).immediate();
}

export function failWorkerJob(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    failureCode: string,
    failureSummary?: string,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        requireWorkerJobLease(db, job, leaseToken, now);
        if (!ACTIVE_STATES.includes(job.state)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_FAIL_STATE_INVALID',
                `Cannot fail a ${job.state} worker job.`,
            );
        }
        const cancelled = job.state === 'CANCEL_REQUESTED';
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, progress_phase = 'complete', failure_code = ?,
                failure_summary = ?, terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            cancelled ? 'CANCELLED' : 'FAILED',
            cancelled ? null : boundedDetail(failureCode, 80) ?? 'WORKER_JOB_FAILED',
            cancelled ? null : boundedDetail(failureSummary, 512) ?? null,
            now,
            now,
            job.job_id,
        );
        rejectStagedArtifacts(db, job.job_id, now);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, updated, cancelled ? 'cancelled' : 'failed');
        return updated;
    }).immediate();
}

export function recoverExpiredWorkerJobLease(
    db: Database.Database,
    jobId: string,
    proof: WorkerJobZeroProviderProof | undefined,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        const lease = db.prepare('SELECT * FROM hall_worker_job_leases WHERE job_id = ?')
            .get(job.job_id) as Row | undefined;
        if (!lease || Number(lease.lease_expires_at) > now) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_LEASE_NOT_RECOVERABLE',
                'Worker-job lease is absent or has not expired.',
            );
        }
        const parsed = proof ? workerJobZeroProviderProofSchema.safeParse(proof) : undefined;
        const exactZeroProof = parsed?.success === true
            && parsed.data.attempt_id === job.attempt_id
            && parsed.data.observed_at >= Number(lease.lease_expires_at)
            && parsed.data.observed_at <= now
            && !job.provider_evidence.provider_started
            && job.provider_evidence.provider_requests_started === 0
            && !job.spend_evidence.spend_uncertain
            && !job.spend_evidence.known_spend_observed;
        const state: WorkerJobState = exactZeroProof
            ? job.state === 'CANCEL_REQUESTED' ? 'CANCELLED' : 'FAILED'
            : 'UNKNOWN';
        const evidence = exactZeroProof ? parsed.data.evidence_sha256 : undefined;
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, progress_phase = ?, failure_code = ?,
                failure_summary = ?, terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            state,
            state === 'UNKNOWN' ? 'unknown' : 'complete',
            state === 'UNKNOWN'
                ? 'LEASE_EXPIRED_PROVIDER_OR_SPEND_UNKNOWN'
                : state === 'FAILED' ? 'LEASE_EXPIRED_ZERO_PROVIDER' : null,
            state === 'UNKNOWN'
                ? 'Lease recovery lacked exact zero-provider and zero-spend proof.'
                : state === 'FAILED' ? 'Lease expired before any provider request or spend.' : null,
            now,
            now,
            job.job_id,
        );
        rejectStagedArtifacts(db, job.job_id, now);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        const updated = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(
            db,
            updated,
            state === 'UNKNOWN' ? 'lease_recovery_unknown' : 'lease_recovered_zero_provider',
            evidence,
        );
        return updated;
    }).immediate();
}

export function listWorkerJobEvents(
    db: Database.Database,
    jobId: string,
): WorkerJobEventRecord[] {
    assertCurrentWorkerJobLedgerSchema(db);
    requireWorkerJobRecord(db, jobId);
    return (db.prepare(`
        SELECT * FROM hall_worker_job_events
        WHERE job_id = ? ORDER BY created_at, event_id
    `).all(jobId) as Row[]).map((row) => ({
        event_id: String(row.event_id),
        job_id: String(row.job_id),
        attempt_id: String(row.attempt_id),
        event_kind: String(row.event_kind),
        state: row.state as WorkerJobState,
        progress_percent: Number(row.progress_percent),
        progress_phase: row.progress_phase as WorkerJobProgressPhase,
        evidence_sha256: optionalString(row.evidence_sha256),
        detail: optionalString(row.detail),
        created_at: Number(row.created_at),
    }));
}

function requireExactZeroProviderProof(
    job: WorkerJobRecord,
    proof: WorkerJobZeroProviderProof,
    now: number,
): void {
    const parsed = workerJobZeroProviderProofSchema.safeParse(proof);
    if (!parsed.success || parsed.data.attempt_id !== job.attempt_id
        || parsed.data.observed_at > now || parsed.data.observed_at < job.created_at
        || job.provider_evidence.provider_started
        || job.provider_evidence.provider_requests_started !== 0
        || job.spend_evidence.spend_uncertain || job.spend_evidence.known_spend_observed) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_REPAIR_NOT_ALLOWED',
            'Repair or replay requires exact zero-provider and zero-spend proof.',
        );
    }
}

function retryWindow(db: Database.Database, jobId: string): [number, number] {
    const row = db.prepare(
        'SELECT retry_count, retry_ceiling FROM hall_worker_jobs WHERE job_id = ?',
    ).get(jobId) as { retry_count?: number; retry_ceiling?: number } | undefined;
    return [Number(row?.retry_count ?? 0), Number(row?.retry_ceiling ?? 0)];
}

/** Queue a recoverable local failure on the same mission and batch. */
export function queueWorkerJobRepair(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    input: WorkerJobRepairInput,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    validateRepairInput(input);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        if (job.state === 'REPAIR_QUEUED') {
            if (job.failure_code === boundedDetail(input.failure_code, 80)) return job;
            throw new WorkerJobLedgerError(
                'WORKER_JOB_VALIDATION_CONFLICT',
                'A different repair is already queued for this worker job.',
            );
        }
        if (job.state === 'UNKNOWN') throw new WorkerJobLedgerError(
            'WORKER_JOB_DISPATCH_FROZEN', 'UNKNOWN worker jobs cannot be repaired or retried.',
        );
        if (!ACTIVE_STATES.includes(job.state)) throw new WorkerJobLedgerError(
            'WORKER_JOB_REPAIR_NOT_ALLOWED', `Cannot queue repair for a ${job.state} worker job.`,
        );
        requireWorkerJobLease(db, job, leaseToken, now);
        requireExactZeroProviderProof(job, input.zero_provider_proof, now);
        const [count, ceiling] = retryWindow(db, job.job_id);
        if (count >= ceiling) throw new WorkerJobLedgerError(
            'WORKER_JOB_RETRY_CEILING_EXCEEDED', 'The bounded repair ceiling is exhausted.',
        );
        db.prepare(`
            UPDATE hall_worker_jobs SET state = 'REPAIR_QUEUED', progress_phase = 'repair_queued',
                failure_code = ?, failure_summary = ?, terminal_at = NULL,
                updated_at = ?, version = version + 1 WHERE job_id = ?
        `).run(boundedDetail(input.failure_code, 80), boundedDetail(input.failure_summary, 512) ?? null,
            now, job.job_id);
        const repaired = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, repaired, 'repair_queued', input.zero_provider_proof.evidence_sha256,
            `same_mission=${job.bead_id} same_batch=${job.decision_id}`);
        return repaired;
    }).immediate();
}

/** Requeue once with exact zero-provider and current-owner lease proof; UNKNOWN is frozen. */
export function replayWorkerJobAfterZeroProvider(
    db: Database.Database,
    jobId: string,
    proof: WorkerJobZeroProviderProof,
    authorization: WorkerJobReplayAuthorization,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        if (job.state === 'UNKNOWN') throw new WorkerJobLedgerError(
            'WORKER_JOB_DISPATCH_FROZEN', 'UNKNOWN worker jobs cannot be replayed.',
        );
        if (!['FAILED', 'REPAIR_QUEUED'].includes(job.state)) throw new WorkerJobLedgerError(
            'WORKER_JOB_DISPATCH_STATE_INVALID', `Cannot replay a ${job.state} worker job.`,
        );
        if (!authorization || typeof authorization.lease_owner_id !== 'string'
            || typeof authorization.lease_token !== 'string') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_REPLAY_AUTHORIZATION_INVALID',
                'Replay requires an exact lease owner and replay token.',
            );
        }
        const lease = requireWorkerJobLease(db, job, authorization.lease_token, now);
        const owner = db.prepare(
            'SELECT dispatch_owner_id FROM hall_worker_jobs WHERE job_id = ?',
        ).pluck().get(job.job_id);
        if (lease.lease_owner_id !== authorization.lease_owner_id
            || owner !== authorization.lease_owner_id) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_OWNER_TRANSFER_NOT_AUTHORIZED',
                'Only the exact repair owner may replay this worker job.',
            );
        }
        requireExactZeroProviderProof(job, proof, now);
        const [count, ceiling] = retryWindow(db, job.job_id);
        if (count >= Math.min(ceiling, WORKER_JOB_ZERO_PROVIDER_REPLAY_CEILING)) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_RETRY_CEILING_EXCEEDED', 'The bounded replay ceiling is exhausted.',
            );
        }
        const transition = db.prepare(`
            UPDATE hall_worker_jobs SET state = 'QUEUED', progress_phase = 'queued',
                progress_percent = 0, retry_count = retry_count + 1,
                failure_code = NULL, failure_summary = NULL, terminal_at = NULL,
                updated_at = ?, version = version + 1
            WHERE job_id = ? AND state IN ('FAILED', 'REPAIR_QUEUED')
                AND retry_count = ?
        `).run(now, job.job_id, count);
        if (transition.changes !== 1) throw new WorkerJobLedgerError(
            'WORKER_JOB_DISPATCH_STATE_INVALID',
            'Worker-job replay lost its atomic one-use transition.',
        );
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        const replay = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, replay, 'zero_provider_replay_queued', proof.evidence_sha256,
            `same_mission=${job.bead_id} same_batch=${job.decision_id}`);
        return replay;
    }).immediate();
}

export function freezeWorkerJobUnknown(
    db: Database.Database,
    jobId: string,
    failureCode: string,
    failureSummary?: string,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireWorkerJobRecord(db, jobId);
        if (job.state === 'UNKNOWN') return job;
        if (job.state === 'ACCEPTED') throw new WorkerJobLedgerError(
            'WORKER_JOB_DISPATCH_STATE_INVALID', 'An accepted job cannot become UNKNOWN.',
        );
        db.prepare(`
            UPDATE hall_worker_jobs SET state = 'UNKNOWN', progress_phase = 'unknown',
                failure_code = ?, failure_summary = ?, terminal_at = ?,
                updated_at = ?, version = version + 1 WHERE job_id = ?
        `).run(boundedDetail(failureCode, 80) ?? 'WORKER_JOB_UNKNOWN',
            boundedDetail(failureSummary, 512) ?? null, now, now, job.job_id);
        rejectStagedArtifacts(db, job.job_id, now);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        const frozen = requireWorkerJobRecord(db, job.job_id);
        appendWorkerJobEvent(db, frozen, 'unknown_frozen', sha256(failureCode), failureSummary);
        return frozen;
    }).immediate();
}
