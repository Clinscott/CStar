import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
    type CreateWorkerJobInput,
    type WorkerArtifactExpectation,
    type WorkerJobArtifactRecord,
    type WorkerJobCreateResult,
    type WorkerJobLeaseGrant,
    type WorkerJobLeaseRecord,
    type WorkerJobProgressPhase,
    type WorkerJobRecord,
    type WorkerJobState,
    type WorkerKind,
} from '../../../types/worker_job.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { WorkerJobControllerError } from './worker_job_errors.js';
import {
    validateCreateWorkerJobInput,
    validateLeaseDuration,
    validateLeaseRequest,
    validateWorkerJobProgress,
} from './worker_job_validation.js';

export { WorkerJobControllerError } from './worker_job_errors.js';

type Sqlite = Database.Database;
type Row = Record<string, unknown>;

function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : Number(value);
}

function materializeJob(row: Row): WorkerJobRecord {
    return {
        job_id: String(row.job_id),
        repo_id: String(row.repo_id),
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        worker_kind: row.worker_kind as WorkerKind,
        objective: String(row.objective),
        workspace_ref: String(row.workspace_ref),
        expected_artifacts: parseJson<WorkerArtifactExpectation[]>(
            row.expected_artifacts_json as string,
            [],
        ),
        state: row.state as WorkerJobState,
        idempotency_key_hash: String(row.idempotency_key_hash),
        request_fingerprint: String(row.request_fingerprint),
        progress_percent: Number(row.progress_percent),
        progress_phase: row.progress_phase as WorkerJobProgressPhase,
        cancel_requested_at: optionalNumber(row.cancel_requested_at),
        cancel_reason: row.cancel_reason ? String(row.cancel_reason) : undefined,
        failure_code: row.failure_code ? String(row.failure_code) : undefined,
        failure_summary: row.failure_summary ? String(row.failure_summary) : undefined,
        attempt_count: Number(row.attempt_count),
        max_attempts: Number(row.max_attempts),
        version: Number(row.version),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
        started_at: optionalNumber(row.started_at),
        terminal_at: optionalNumber(row.terminal_at),
    };
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

function repoIdFor(rootPath: string): string {
    return buildHallRepositoryId(normalizeHallPath(rootPath));
}

function sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeExpectations(values: WorkerArtifactExpectation[]): WorkerArtifactExpectation[] {
    return values.map((item) => ({
        name: item.name.trim(),
        artifact_kind: item.artifact_kind,
        required: item.required !== false,
    }));
}

function requestFingerprint(input: CreateWorkerJobInput): string {
    const expected = normalizeExpectations(input.expected_artifacts)
        .sort((left, right) =>
            `${left.artifact_kind}:${left.name}`.localeCompare(`${right.artifact_kind}:${right.name}`),
        );
    return sha256(JSON.stringify({
        bead_id: input.bead_id?.trim() || null,
        worker_kind: input.worker_kind,
        objective: input.objective.trim().replace(/\s+/g, ' '),
        workspace_ref: input.workspace_ref.trim(),
        expected_artifacts: expected,
    }));
}

function getJobFromDb(db: Sqlite, repoId: string, jobId: string): WorkerJobRecord | null {
    const row = db.prepare(`
        SELECT * FROM hall_worker_jobs
        WHERE repo_id = ? AND job_id = ?
        LIMIT 1
    `).get(repoId, jobId) as Row | undefined;
    return row ? materializeJob(row) : null;
}

function requireJob(db: Sqlite, repoId: string, jobId: string): WorkerJobRecord {
    const job = getJobFromDb(db, repoId, jobId);
    if (!job) {
        throw new WorkerJobControllerError('JOB_NOT_FOUND', `Worker job not found: ${jobId}`);
    }
    return job;
}

function appendEvent(
    db: Sqlite,
    job: WorkerJobRecord,
    eventKind: string,
    detail?: string,
): void {
    db.prepare(`
        INSERT INTO hall_worker_job_events (
            job_id, event_kind, state, progress_percent, progress_phase, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        job.job_id,
        eventKind,
        job.state,
        job.progress_percent,
        job.progress_phase,
        detail?.replace(/\s+/g, ' ').slice(0, 512) ?? null,
        job.updated_at,
    );
}

function tokenMatches(rawToken: string, expectedHash: string): boolean {
    const actual = Buffer.from(sha256(rawToken), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function requireLease(db: Sqlite, jobId: string, rawToken: string, now: number): WorkerJobLeaseRecord {
    const row = db.prepare(`
        SELECT * FROM hall_worker_job_leases
        WHERE job_id = ?
        LIMIT 1
    `).get(jobId) as Row | undefined;
    if (!row || !tokenMatches(rawToken, String(row.lease_token_hash))) {
        throw new WorkerJobControllerError('LEASE_INVALID', 'Worker lease is missing or invalid.');
    }
    const lease: WorkerJobLeaseRecord = {
        job_id: String(row.job_id),
        lease_owner_id: String(row.lease_owner_id),
        lease_token_hash: String(row.lease_token_hash),
        leased_at: Number(row.leased_at),
        lease_expires_at: Number(row.lease_expires_at),
        heartbeat_at: Number(row.heartbeat_at),
    };
    if (lease.lease_expires_at <= now) {
        throw new WorkerJobControllerError('LEASE_EXPIRED', 'Worker lease has expired.', true);
    }
    return lease;
}

function rejectStagedArtifacts(db: Sqlite, jobId: string, now: number): void {
    db.prepare(`
        UPDATE hall_worker_job_artifacts
        SET status = 'REJECTED', updated_at = ?
        WHERE job_id = ? AND status = 'STAGED'
    `).run(now, jobId);
}

function recoverExpiredInTransaction(db: Sqlite, repoId: string, now: number): string[] {
    const rows = db.prepare(`
        SELECT j.job_id
        FROM hall_worker_jobs j
        JOIN hall_worker_job_leases l ON l.job_id = j.job_id
        WHERE j.repo_id = ? AND l.lease_expires_at <= ?
        ORDER BY j.created_at ASC
    `).all(repoId, now) as Array<{ job_id: string }>;
    const recovered: string[] = [];
    for (const row of rows) {
        const current = requireJob(db, repoId, row.job_id);
        const cancelled = current.state === 'CANCEL_REQUESTED';
        const exhausted = current.attempt_count >= current.max_attempts;
        const state: WorkerJobState = cancelled ? 'CANCELLED' : exhausted ? 'FAILED' : 'QUEUED';
        const phase: WorkerJobProgressPhase = state === 'QUEUED' ? 'queued' : 'complete';
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, progress_percent = ?, progress_phase = ?,
                failure_code = ?, failure_summary = ?,
                terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            state,
            state === 'QUEUED' ? 0 : current.progress_percent,
            phase,
            exhausted ? 'LEASE_EXHAUSTED' : null,
            exhausted ? 'The worker lease retry budget was exhausted.' : null,
            state === 'QUEUED' ? null : now,
            now,
            current.job_id,
        );
        rejectStagedArtifacts(db, current.job_id, now);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(current.job_id);
        const updated = requireJob(db, repoId, current.job_id);
        appendEvent(db, updated, cancelled ? 'cancelled' : exhausted ? 'failed' : 'lease_recovered');
        recovered.push(current.job_id);
    }
    return recovered;
}

export function createWorkerJob(
    input: CreateWorkerJobInput,
    rootPath: string = registry.getRoot(),
): WorkerJobCreateResult {
    validateCreateWorkerJobInput(input);
    const db = database.getDb(rootPath);
    const repoId = repoIdFor(rootPath);
    const fingerprint = requestFingerprint(input);
    const keyHash = sha256(`${repoId}\0${input.idempotency_key}`);
    return db.transaction(() => {
        const existingRow = db.prepare(`
            SELECT * FROM hall_worker_jobs
            WHERE repo_id = ? AND idempotency_key_hash = ?
            LIMIT 1
        `).get(repoId, keyHash) as Row | undefined;
        if (existingRow) {
            const existing = materializeJob(existingRow);
            if (existing.request_fingerprint !== fingerprint) {
                throw new WorkerJobControllerError(
                    'IDEMPOTENCY_CONFLICT',
                    'The idempotency key is already bound to a different worker-job request.',
                );
            }
            return { job: existing, deduplicated: true };
        }
        if (input.bead_id) {
            const bead = db.prepare('SELECT bead_id FROM hall_beads WHERE bead_id = ?').get(input.bead_id);
            if (!bead) {
                throw new WorkerJobControllerError('BEAD_NOT_FOUND', `Hall bead not found: ${input.bead_id}`);
            }
        }
        const now = Date.now();
        const jobId = `worker-job-${crypto.randomUUID()}`;
        db.prepare(`
            INSERT INTO hall_worker_jobs (
                job_id, repo_id, bead_id, worker_kind, objective, workspace_ref,
                expected_artifacts_json, state, idempotency_key_hash, request_fingerprint,
                progress_percent, progress_phase, attempt_count, max_attempts, version,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, 0, 'queued', 0, 3, 1, ?, ?)
        `).run(
            jobId,
            repoId,
            input.bead_id?.trim() || null,
            input.worker_kind,
            input.objective.trim(),
            input.workspace_ref.trim(),
            stringifyJson(normalizeExpectations(input.expected_artifacts)),
            keyHash,
            fingerprint,
            now,
            now,
        );
        const job = requireJob(db, repoId, jobId);
        appendEvent(db, job, 'queued');
        return { job, deduplicated: false };
    })();
}

export function getWorkerJob(
    jobId: string,
    rootPath: string = registry.getRoot(),
): WorkerJobRecord | null {
    return getJobFromDb(database.getDb(rootPath), repoIdFor(rootPath), jobId);
}

export function listWorkerJobArtifacts(
    jobId: string,
    rootPath: string = registry.getRoot(),
    statuses: WorkerJobArtifactRecord['status'][] = ['READY'],
): WorkerJobArtifactRecord[] {
    const db = database.getDb(rootPath);
    requireJob(db, repoIdFor(rootPath), jobId);
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT * FROM hall_worker_job_artifacts
        WHERE job_id = ? AND status IN (${placeholders})
        ORDER BY created_at ASC, artifact_id ASC
    `).all(jobId, ...statuses) as Row[];
    return rows.map(materializeArtifact);
}

export function getWorkerJobArtifact(
    jobId: string,
    artifactId: string,
    rootPath: string = registry.getRoot(),
): WorkerJobArtifactRecord | null {
    const db = database.getDb(rootPath);
    requireJob(db, repoIdFor(rootPath), jobId);
    const row = db.prepare(`
        SELECT * FROM hall_worker_job_artifacts
        WHERE job_id = ? AND artifact_id = ? AND status = 'READY'
        LIMIT 1
    `).get(jobId, artifactId) as Row | undefined;
    return row ? materializeArtifact(row) : null;
}

export function requestWorkerJobCancellation(
    jobId: string,
    reason: string | undefined,
    expectedVersion: number | undefined,
    rootPath: string = registry.getRoot(),
): { job: WorkerJobRecord; changed: boolean } {
    const db = database.getDb(rootPath);
    const repoId = repoIdFor(rootPath);
    return db.transaction(() => {
        const current = requireJob(db, repoId, jobId);
        if (current.state === 'CANCELLED' || current.state === 'CANCEL_REQUESTED') {
            return { job: current, changed: false };
        }
        if (expectedVersion !== undefined && expectedVersion !== current.version) {
            throw new WorkerJobControllerError('VERSION_CONFLICT', 'Worker job version has changed.', true);
        }
        if (current.state === 'SUCCEEDED' || current.state === 'FAILED') {
            throw new WorkerJobControllerError('INVALID_STATE', `Cannot cancel a ${current.state} worker job.`);
        }
        const now = Date.now();
        const state: WorkerJobState = current.state === 'QUEUED' ? 'CANCELLED' : 'CANCEL_REQUESTED';
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = ?, cancel_requested_at = ?, cancel_reason = ?,
                progress_phase = ?, terminal_at = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(
            state,
            now,
            reason?.trim().slice(0, 500) || null,
            state === 'CANCELLED' ? 'complete' : current.progress_phase,
            state === 'CANCELLED' ? now : null,
            now,
            jobId,
        );
        if (state === 'CANCELLED') {
            rejectStagedArtifacts(db, jobId, now);
            db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(jobId);
        }
        const updated = requireJob(db, repoId, jobId);
        appendEvent(db, updated, state === 'CANCELLED' ? 'cancelled' : 'cancel_requested');
        return { job: updated, changed: true };
    })();
}

export function claimNextWorkerJob(
    workerKind: WorkerKind,
    leaseOwnerId: string,
    leaseDurationMs: number,
    rootPath: string = registry.getRoot(),
): WorkerJobLeaseGrant | null {
    validateLeaseRequest(leaseOwnerId, leaseDurationMs);
    const db = database.getDb(rootPath);
    const repoId = repoIdFor(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        recoverExpiredInTransaction(db, repoId, now);
        const row = db.prepare(`
            SELECT job_id FROM hall_worker_jobs
            WHERE repo_id = ? AND worker_kind = ? AND state = 'QUEUED'
            ORDER BY created_at ASC LIMIT 1
        `).get(repoId, workerKind) as { job_id?: string } | undefined;
        if (!row?.job_id) return null;
        const token = crypto.randomBytes(32).toString('base64url');
        const expiresAt = now + leaseDurationMs;
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = 'LEASED', progress_phase = 'preparing',
                attempt_count = attempt_count + 1, started_at = COALESCE(started_at, ?),
                updated_at = ?, version = version + 1
            WHERE job_id = ? AND state = 'QUEUED'
        `).run(now, now, row.job_id);
        db.prepare(`
            INSERT OR REPLACE INTO hall_worker_job_leases (
                job_id, lease_owner_id, lease_token_hash, leased_at, lease_expires_at, heartbeat_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(row.job_id, leaseOwnerId, sha256(token), now, expiresAt, now);
        const job = requireJob(db, repoId, row.job_id);
        appendEvent(db, job, 'leased');
        return { job, lease_token: token, lease_expires_at: expiresAt };
    })();
}

export function heartbeatWorkerJobLease(
    jobId: string,
    leaseToken: string,
    leaseDurationMs: number,
    rootPath: string = registry.getRoot(),
): number {
    validateLeaseDuration(leaseDurationMs);
    const db = database.getDb(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const job = requireJob(db, repoIdFor(rootPath), jobId);
        if (job.state === 'CANCEL_REQUESTED') {
            throw new WorkerJobControllerError('CANCEL_REQUESTED', 'Worker job cancellation was requested.');
        }
        requireLease(db, jobId, leaseToken, now);
        const expiresAt = now + leaseDurationMs;
        const updated = db.prepare(`
            UPDATE hall_worker_job_leases
            SET lease_expires_at = ?, heartbeat_at = ?
            WHERE job_id = ? AND lease_token_hash = ? AND lease_expires_at > ?
        `).run(expiresAt, now, jobId, sha256(leaseToken), now);
        if (updated.changes !== 1) {
            throw new WorkerJobControllerError('LEASE_LOST', 'Worker lease is no longer active.', true);
        }
        return expiresAt;
    })();
}

export function markWorkerJobRunning(
    jobId: string,
    leaseToken: string,
    rootPath: string = registry.getRoot(),
): WorkerJobRecord {
    const db = database.getDb(rootPath);
    const repoId = repoIdFor(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const current = requireJob(db, repoId, jobId);
        requireLease(db, jobId, leaseToken, now);
        if (current.state !== 'LEASED') {
            throw new WorkerJobControllerError('INVALID_STATE', `Cannot start a ${current.state} worker job.`);
        }
        db.prepare(`
            UPDATE hall_worker_jobs
            SET state = 'RUNNING', progress_phase = 'working', updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(now, jobId);
        const updated = requireJob(db, repoId, jobId);
        appendEvent(db, updated, 'running');
        return updated;
    })();
}

export function reportWorkerJobProgress(
    jobId: string,
    leaseToken: string,
    percent: number,
    phase: Exclude<WorkerJobProgressPhase, 'queued' | 'complete'>,
    rootPath: string = registry.getRoot(),
): WorkerJobRecord {
    validateWorkerJobProgress(percent, phase);
    const db = database.getDb(rootPath);
    const repoId = repoIdFor(rootPath);
    return db.transaction(() => {
        const now = Date.now();
        const current = requireJob(db, repoId, jobId);
        requireLease(db, jobId, leaseToken, now);
        if (current.state !== 'RUNNING' || percent < current.progress_percent || percent > 99) {
            throw new WorkerJobControllerError('INVALID_PROGRESS', 'Progress must be monotonic, below 100, and reported for a running job.');
        }
        db.prepare(`
            UPDATE hall_worker_jobs
            SET progress_percent = ?, progress_phase = ?, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(percent, phase, now, jobId);
        const updated = requireJob(db, repoId, jobId);
        appendEvent(db, updated, 'progress');
        return updated;
    })();
}

export function recoverExpiredWorkerJobLeases(
    rootPath: string = registry.getRoot(),
    now = Date.now(),
): string[] {
    const db = database.getDb(rootPath);
    return db.transaction(() => recoverExpiredInTransaction(db, repoIdFor(rootPath), now))();
}
