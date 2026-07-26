import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
    type SaveWorkerArtifactInput,
    type WorkerJobArtifactRecord,
    type WorkerJobRecord,
    type WorkerJobState,
} from '../../../types/worker_job.js';
import { registry } from '../pathRegistry.js';
import { database } from './database.js';
import {
    getWorkerJob,
    listWorkerJobArtifacts,
    WorkerJobControllerError,
} from './worker_job_controller.js';

type Sqlite = Database.Database;
type Row = Record<string, unknown>;
const MAX_INLINE_ARTIFACT_BYTES = 256 * 1024;
const MAX_STORED_ARTIFACT_BYTES = 64 * 1024 * 1024;
const SAFE_ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const SAFE_MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
const SAFE_STORAGE_REF = /^cstar-storage:[A-Za-z0-9._:-]{1,240}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

function sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function tokenMatches(rawToken: string, expectedHash: string): boolean {
    const actual = Buffer.from(sha256(rawToken), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function requireJob(rootPath: string, jobId: string): WorkerJobRecord {
    const job = getWorkerJob(jobId, rootPath);
    if (!job) {
        throw new WorkerJobControllerError('JOB_NOT_FOUND', `Worker job not found: ${jobId}`);
    }
    return job;
}

function requireLease(db: Sqlite, jobId: string, rawToken: string, now: number): void {
    const row = db.prepare(`
        SELECT lease_token_hash, lease_expires_at
        FROM hall_worker_job_leases
        WHERE job_id = ?
        LIMIT 1
    `).get(jobId) as { lease_token_hash?: string; lease_expires_at?: number } | undefined;
    if (!row?.lease_token_hash || !tokenMatches(rawToken, row.lease_token_hash)) {
        throw new WorkerJobControllerError('LEASE_INVALID', 'Worker lease is missing or invalid.');
    }
    if (Number(row.lease_expires_at) <= now) {
        throw new WorkerJobControllerError('LEASE_EXPIRED', 'Worker lease has expired.', true);
    }
}

function materializeArtifact(row: Row): WorkerJobArtifactRecord {
    return {
        artifact_id: String(row.artifact_id),
        job_id: String(row.job_id),
        artifact_kind: row.artifact_kind as WorkerJobArtifactRecord['artifact_kind'],
        name: String(row.name),
        media_type: String(row.media_type),
        byte_count: Number(row.byte_count),
        sha256: String(row.sha256),
        status: row.status as WorkerJobArtifactRecord['status'],
        attempt: Number(row.attempt),
        inline_text: row.inline_text === null || row.inline_text === undefined
            ? undefined
            : String(row.inline_text),
        storage_ref: row.storage_ref ? String(row.storage_ref) : undefined,
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function appendEvent(db: Sqlite, job: WorkerJobRecord, eventKind: string): void {
    db.prepare(`
        INSERT INTO hall_worker_job_events (
            job_id, event_kind, state, progress_percent, progress_phase, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        job.job_id,
        eventKind,
        job.state,
        job.progress_percent,
        job.progress_phase,
        job.updated_at,
    );
}

function rejectStagedArtifacts(db: Sqlite, jobId: string, now: number): void {
    db.prepare(`
        UPDATE hall_worker_job_artifacts
        SET status = 'REJECTED', updated_at = ?
        WHERE job_id = ? AND status = 'STAGED'
    `).run(now, jobId);
}

export function saveWorkerJobArtifact(
    jobId: string,
    leaseToken: string,
    input: SaveWorkerArtifactInput,
    rootPath: string = registry.getRoot(),
): WorkerJobArtifactRecord {
    const db = database.getDb(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const job = requireJob(rootPath, jobId);
        requireLease(db, jobId, leaseToken, now);
        if (job.state !== 'RUNNING') {
            throw new WorkerJobControllerError('INVALID_STATE', 'Artifacts can only be staged for a running job.');
        }
        const expected = job.expected_artifacts.some((item) =>
            item.name === input.name && item.artifact_kind === input.artifact_kind,
        );
        if (!expected) {
            throw new WorkerJobControllerError('UNEXPECTED_ARTIFACT', 'Artifact is not declared in the job contract.');
        }
        if (!SAFE_ARTIFACT_NAME.test(input.name) || !SAFE_MEDIA_TYPE.test(input.media_type)) {
            throw new WorkerJobControllerError(
                'ARTIFACT_METADATA_INVALID',
                'Artifact name or media type is outside the bounded contract.',
            );
        }
        if (input.inline_text !== undefined && input.storage_ref) {
            throw new WorkerJobControllerError(
                'ARTIFACT_DELIVERY_CONFLICT',
                'Artifact must use inline text or private storage, not both.',
            );
        }
        if (input.inline_text === undefined && !input.storage_ref) {
            throw new WorkerJobControllerError(
                'ARTIFACT_CONTENT_MISSING',
                'Artifact requires bounded inline text or a private storage reference.',
            );
        }
        if (input.storage_ref && !SAFE_STORAGE_REF.test(input.storage_ref)) {
            throw new WorkerJobControllerError(
                'STORAGE_REF_INVALID',
                'Artifact storage reference must be an opaque CStar storage handle.',
            );
        }
        const bytes = input.inline_text === undefined
            ? input.byte_count
            : Buffer.byteLength(input.inline_text, 'utf8');
        const digest = input.inline_text === undefined ? input.sha256 : sha256(input.inline_text);
        if (bytes === undefined || !Number.isSafeInteger(bytes) || bytes < 1
            || bytes > MAX_STORED_ARTIFACT_BYTES || !digest || !SHA256_HEX.test(digest)) {
            throw new WorkerJobControllerError(
                'ARTIFACT_METADATA_MISSING',
                'Artifact requires bounded byte count and a 64-character sha256 digest.',
            );
        }
        if (input.inline_text !== undefined && bytes > MAX_INLINE_ARTIFACT_BYTES) {
            throw new WorkerJobControllerError(
                'INLINE_ARTIFACT_TOO_LARGE',
                `Inline artifacts cannot exceed ${MAX_INLINE_ARTIFACT_BYTES} bytes.`,
            );
        }
        const existingRow = db.prepare(`
            SELECT * FROM hall_worker_job_artifacts
            WHERE job_id = ? AND attempt = ? AND name = ? AND artifact_kind = ?
            LIMIT 1
        `).get(jobId, job.attempt_count, input.name, input.artifact_kind) as Row | undefined;
        if (existingRow) {
            const existing = materializeArtifact(existingRow);
            const exactReplay = existing.status === 'STAGED'
                && existing.media_type === input.media_type
                && existing.byte_count === bytes
                && existing.sha256 === digest
                && existing.inline_text === input.inline_text
                && existing.storage_ref === input.storage_ref;
            if (exactReplay) return existing;
            throw new WorkerJobControllerError(
                'ARTIFACT_CONFLICT',
                'This artifact name and kind are already bound to different content.',
            );
        }
        const artifactId = `worker-artifact-${crypto.randomUUID()}`;
        db.prepare(`
            INSERT INTO hall_worker_job_artifacts (
                artifact_id, job_id, artifact_kind, name, media_type, byte_count,
                sha256, status, attempt, inline_text, storage_ref, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'STAGED', ?, ?, ?, ?, ?)
        `).run(
            artifactId,
            jobId,
            input.artifact_kind,
            input.name,
            input.media_type,
            bytes,
            digest,
            job.attempt_count,
            input.inline_text ?? null,
            input.storage_ref ?? null,
            now,
            now,
        );
        return materializeArtifact(
            db.prepare('SELECT * FROM hall_worker_job_artifacts WHERE artifact_id = ?').get(artifactId) as Row,
        );
    })();
}

export function completeWorkerJob(
    jobId: string,
    leaseToken: string,
    rootPath: string = registry.getRoot(),
): WorkerJobRecord {
    const db = database.getDb(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const job = requireJob(rootPath, jobId);
        requireLease(db, jobId, leaseToken, now);
        if (job.state === 'CANCEL_REQUESTED') {
            rejectStagedArtifacts(db, jobId, now);
            db.prepare(`
                UPDATE hall_worker_jobs
                SET state = 'CANCELLED', progress_phase = 'complete',
                    terminal_at = ?, updated_at = ?, version = version + 1
                WHERE job_id = ?
            `).run(now, now, jobId);
        } else {
            if (job.state !== 'RUNNING') {
                throw new WorkerJobControllerError('INVALID_STATE', `Cannot complete a ${job.state} worker job.`);
            }
            const staged = listWorkerJobArtifacts(jobId, rootPath, ['STAGED'])
                .filter((artifact) => artifact.attempt === job.attempt_count);
            const missing = job.expected_artifacts
                .filter((expected) => expected.required)
                .filter((expected) => !staged.some((artifact) =>
                    artifact.name === expected.name && artifact.artifact_kind === expected.artifact_kind,
                ));
            if (missing.length > 0) {
                throw new WorkerJobControllerError(
                    'REQUIRED_ARTIFACT_MISSING',
                    'Required worker artifacts are missing.',
                );
            }
            db.prepare(`
                UPDATE hall_worker_job_artifacts
                SET status = 'READY', updated_at = ?
                WHERE job_id = ? AND attempt = ? AND status = 'STAGED'
            `).run(now, jobId, job.attempt_count);
            db.prepare(`
                UPDATE hall_worker_jobs
                SET state = 'SUCCEEDED', progress_percent = 100, progress_phase = 'complete',
                    terminal_at = ?, updated_at = ?, version = version + 1
                WHERE job_id = ?
            `).run(now, now, jobId);
        }
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(jobId);
        const updated = requireJob(rootPath, jobId);
        appendEvent(db, updated, updated.state === 'SUCCEEDED' ? 'succeeded' : 'cancelled');
        return updated;
    })();
}

export function failWorkerJob(
    jobId: string,
    leaseToken: string,
    failureCode: string,
    failureSummary: string | undefined,
    retryable: boolean,
    rootPath: string = registry.getRoot(),
): WorkerJobRecord {
    const db = database.getDb(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const job = requireJob(rootPath, jobId);
        requireLease(db, jobId, leaseToken, now);
        const cancelled = job.state === 'CANCEL_REQUESTED';
        const requeue = !cancelled && retryable && job.attempt_count < job.max_attempts;
        const state: WorkerJobState = cancelled ? 'CANCELLED' : requeue ? 'QUEUED' : 'FAILED';
        rejectStagedArtifacts(db, jobId, now);
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, progress_percent = ?, progress_phase = ?,
                failure_code = ?, failure_summary = ?,
                terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            state,
            state === 'QUEUED' ? 0 : job.progress_percent,
            state === 'QUEUED' ? 'queued' : 'complete',
            state === 'FAILED' ? failureCode.slice(0, 80) : null,
            state === 'FAILED'
                ? failureSummary?.replace(/\s+/g, ' ').slice(0, 512) ?? null
                : null,
            state === 'QUEUED' ? null : now,
            now,
            jobId,
        );
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(jobId);
        const updated = requireJob(rootPath, jobId);
        appendEvent(db, updated, cancelled ? 'cancelled' : requeue ? 'requeued' : 'failed');
        return updated;
    })();
}
