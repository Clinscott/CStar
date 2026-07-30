import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
    StageWorkerJobArtifactInput,
    WorkerJobArtifactExpectation,
    WorkerJobArtifactRecord,
    WorkerJobRecord,
} from '../../../types/worker_job.js';
import { WorkerJobLedgerError } from './worker_job_errors.js';
import {
    appendWorkerJobEvent,
    getWorkerJob,
} from './worker_job_ledger.js';
import { assertCurrentWorkerJobLedgerSchema } from './worker_job_subordinate_migration.js';
import { sha256 } from './worker_job_validation.js';

type Row = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const SAFE_MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
const SAFE_STORAGE_REF = /^cstar-storage:[A-Za-z0-9._:/-]{1,240}$/;

function materializeArtifact(row: Row): WorkerJobArtifactRecord {
    return {
        artifact_id: String(row.artifact_id),
        job_id: String(row.job_id),
        attempt_id: String(row.attempt_id),
        artifact_kind: row.artifact_kind as WorkerJobArtifactRecord['artifact_kind'],
        name: String(row.name),
        media_type: String(row.media_type),
        byte_count: Number(row.byte_count),
        sha256: String(row.sha256),
        storage_ref: String(row.storage_ref),
        status: row.status as WorkerJobArtifactRecord['status'],
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function requireJob(db: Database.Database, jobId: string): WorkerJobRecord {
    const job = getWorkerJob(db, jobId);
    if (!job) {
        throw new WorkerJobLedgerError('WORKER_JOB_NOT_FOUND', `Worker job not found: ${jobId}`);
    }
    return job;
}

function requireLease(
    db: Database.Database,
    job: WorkerJobRecord,
    leaseToken: string,
    now: number,
): void {
    const row = db.prepare(`
        SELECT attempt_id, lease_token_sha256, lease_expires_at
        FROM hall_worker_job_leases WHERE job_id = ?
    `).get(job.job_id) as {
        attempt_id?: string;
        lease_token_sha256?: string;
        lease_expires_at?: number;
    } | undefined;
    const actual = Buffer.from(sha256(leaseToken), 'hex');
    const expected = Buffer.from(row?.lease_token_sha256 ?? '', 'hex');
    if (row?.attempt_id !== job.attempt_id
        || actual.length !== expected.length
        || !crypto.timingSafeEqual(actual, expected)) {
        throw new WorkerJobLedgerError('WORKER_JOB_LEASE_INVALID', 'Worker-job lease is invalid.');
    }
    if (Number(row.lease_expires_at) <= now) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_LEASE_EXPIRED',
            'Worker-job lease expired and requires explicit recovery.',
        );
    }
    if (now >= job.execution_deadline_at || now >= job.authorization_expires_at) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_EXECUTION_DEADLINE_ELAPSED',
            'Worker-job execution authority or deadline elapsed.',
        );
    }
}

function validateArtifact(
    job: WorkerJobRecord,
    input: StageWorkerJobArtifactInput,
): void {
    const expected = job.expected_artifacts.some((item) =>
        item.name === input.name && item.artifact_kind === input.artifact_kind);
    if (input.attempt_id !== job.attempt_id || !expected) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_ARTIFACT_CONTRACT_MISMATCH',
            'Artifact must bind the active attempt and declared artifact contract.',
        );
    }
    if (!SAFE_NAME.test(input.name) || !SAFE_MEDIA_TYPE.test(input.media_type)
        || !SAFE_STORAGE_REF.test(input.storage_ref)
        || !Number.isSafeInteger(input.byte_count)
        || input.byte_count < 1
        || input.byte_count > 64 * 1024 * 1024
        || !SHA256.test(input.sha256)) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_ARTIFACT_INVALID',
            'Artifact metadata is outside the bounded transport contract.',
        );
    }
}

export function stageWorkerJobArtifact(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    input: StageWorkerJobArtifactInput,
    now = Date.now(),
): WorkerJobArtifactRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireJob(db, jobId);
        requireLease(db, job, leaseToken, now);
        if (job.state !== 'RUNNING') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_ARTIFACT_STATE_INVALID',
                'Artifacts can only be staged for a running worker job.',
            );
        }
        validateArtifact(job, input);
        const existing = db.prepare(`
            SELECT * FROM hall_worker_job_artifacts
            WHERE job_id = ? AND attempt_id = ? AND name = ? AND artifact_kind = ?
        `).get(
            job.job_id,
            job.attempt_id,
            input.name,
            input.artifact_kind,
        ) as Row | undefined;
        if (existing) {
            const artifact = materializeArtifact(existing);
            if (artifact.artifact_id === input.artifact_id
                && artifact.media_type === input.media_type
                && artifact.byte_count === input.byte_count
                && artifact.sha256 === input.sha256
                && artifact.storage_ref === input.storage_ref
                && artifact.status === 'STAGED') {
                return artifact;
            }
            throw new WorkerJobLedgerError(
                'WORKER_JOB_ARTIFACT_CONFLICT',
                'Artifact identity is already bound to different metadata.',
            );
        }
        db.prepare(`
            INSERT INTO hall_worker_job_artifacts (
                artifact_id, job_id, attempt_id, artifact_kind, name, media_type,
                byte_count, sha256, storage_ref, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STAGED', ?, ?)
        `).run(
            input.artifact_id,
            job.job_id,
            job.attempt_id,
            input.artifact_kind,
            input.name,
            input.media_type,
            input.byte_count,
            input.sha256,
            input.storage_ref,
            now,
            now,
        );
        return materializeArtifact(
            db.prepare('SELECT * FROM hall_worker_job_artifacts WHERE artifact_id = ?')
                .get(input.artifact_id) as Row,
        );
    }).immediate();
}

function missingRequiredArtifacts(
    expected: WorkerJobArtifactExpectation[],
    staged: WorkerJobArtifactRecord[],
): WorkerJobArtifactExpectation[] {
    return expected.filter((item) => item.required).filter((item) =>
        !staged.some((artifact) =>
            artifact.name === item.name && artifact.artifact_kind === item.artifact_kind));
}

export function deliverWorkerJobArtifacts(
    db: Database.Database,
    jobId: string,
    leaseToken: string,
    now = Date.now(),
): WorkerJobRecord {
    assertCurrentWorkerJobLedgerSchema(db);
    return db.transaction(() => {
        const job = requireJob(db, jobId);
        requireLease(db, job, leaseToken, now);
        if (job.state !== 'RUNNING') {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_DELIVERY_STATE_INVALID',
                `Cannot deliver a ${job.state} worker job.`,
            );
        }
        if (!job.provider_evidence.provider_started
            || job.provider_evidence.provider_requests_started < 1) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_PROVIDER_START_EVIDENCE_REQUIRED',
                'Delivery requires provider-started evidence bound to the attempt.',
            );
        }
        const staged = (db.prepare(`
            SELECT * FROM hall_worker_job_artifacts
            WHERE job_id = ? AND attempt_id = ? AND status = 'STAGED'
            ORDER BY created_at, artifact_id
        `).all(job.job_id, job.attempt_id) as Row[]).map(materializeArtifact);
        if (missingRequiredArtifacts(job.expected_artifacts, staged).length > 0) {
            throw new WorkerJobLedgerError(
                'WORKER_JOB_REQUIRED_ARTIFACT_MISSING',
                'Required worker-job artifacts are missing.',
            );
        }
        db.prepare(`
            UPDATE hall_worker_job_artifacts
            SET status = 'DELIVERED_UNVERIFIED', updated_at = ?
            WHERE job_id = ? AND attempt_id = ? AND status = 'STAGED'
        `).run(now, job.job_id, job.attempt_id);
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = 'DELIVERED_UNVERIFIED', progress_percent = 100,
                progress_phase = 'complete', terminal_at = ?,
                updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(now, now, job.job_id);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(job.job_id);
        const delivered = requireJob(db, job.job_id);
        appendWorkerJobEvent(db, delivered, 'delivered_unverified');
        return delivered;
    }).immediate();
}

export function listWorkerJobArtifacts(
    db: Database.Database,
    jobId: string,
): WorkerJobArtifactRecord[] {
    assertCurrentWorkerJobLedgerSchema(db);
    requireJob(db, jobId);
    return (db.prepare(`
        SELECT * FROM hall_worker_job_artifacts
        WHERE job_id = ? ORDER BY created_at, artifact_id
    `).all(jobId) as Row[]).map(materializeArtifact);
}
