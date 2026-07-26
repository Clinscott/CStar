export const WORKER_KINDS = ['forge', 'researcher'] as const;
export type WorkerKind = typeof WORKER_KINDS[number];

export const WORKER_JOB_STATES = [
    'QUEUED',
    'LEASED',
    'RUNNING',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'SUCCEEDED',
    'FAILED',
] as const;
export type WorkerJobState = typeof WORKER_JOB_STATES[number];

export const WORKER_JOB_PROGRESS_PHASES = [
    'queued',
    'preparing',
    'working',
    'validating',
    'finalizing',
    'complete',
] as const;
export type WorkerJobProgressPhase = typeof WORKER_JOB_PROGRESS_PHASES[number];

export const WORKER_ARTIFACT_KINDS = [
    'report',
    'patch',
    'package',
    'dataset',
    'test_result',
    'other',
] as const;
export type WorkerArtifactKind = typeof WORKER_ARTIFACT_KINDS[number];

export interface WorkerArtifactExpectation {
    name: string;
    artifact_kind: WorkerArtifactKind;
    required: boolean;
}

export interface WorkerJobRecord {
    job_id: string;
    repo_id: string;
    bead_id?: string;
    worker_kind: WorkerKind;
    objective: string;
    workspace_ref: string;
    expected_artifacts: WorkerArtifactExpectation[];
    state: WorkerJobState;
    idempotency_key_hash: string;
    request_fingerprint: string;
    progress_percent: number;
    progress_phase: WorkerJobProgressPhase;
    cancel_requested_at?: number;
    cancel_reason?: string;
    failure_code?: string;
    failure_summary?: string;
    attempt_count: number;
    max_attempts: number;
    version: number;
    created_at: number;
    updated_at: number;
    started_at?: number;
    terminal_at?: number;
}

export interface WorkerJobArtifactRecord {
    artifact_id: string;
    job_id: string;
    artifact_kind: WorkerArtifactKind;
    name: string;
    media_type: string;
    byte_count: number;
    sha256: string;
    status: 'STAGED' | 'READY' | 'REJECTED';
    attempt: number;
    inline_text?: string;
    storage_ref?: string;
    created_at: number;
    updated_at: number;
}

export interface WorkerJobLeaseRecord {
    job_id: string;
    lease_owner_id: string;
    lease_token_hash: string;
    leased_at: number;
    lease_expires_at: number;
    heartbeat_at: number;
}

export interface WorkerJobEventRecord {
    event_id: number;
    job_id: string;
    event_kind: string;
    state: WorkerJobState;
    progress_percent: number;
    progress_phase: WorkerJobProgressPhase;
    detail?: string;
    created_at: number;
}

export interface CreateWorkerJobInput {
    worker_kind: WorkerKind;
    objective: string;
    workspace_ref: string;
    expected_artifacts: WorkerArtifactExpectation[];
    idempotency_key: string;
    bead_id?: string;
}

export interface WorkerJobCreateResult {
    job: WorkerJobRecord;
    deduplicated: boolean;
}

export interface WorkerJobLeaseGrant {
    job: WorkerJobRecord;
    lease_token: string;
    lease_expires_at: number;
}

export interface SaveWorkerArtifactInput {
    artifact_kind: WorkerArtifactKind;
    name: string;
    media_type: string;
    inline_text?: string;
    storage_ref?: string;
    byte_count?: number;
    sha256?: string;
}

export interface PublicWorkerArtifact {
    artifact_id: string;
    artifact_kind: WorkerArtifactKind;
    name: string;
    media_type: string;
    byte_count: number;
    sha256: string;
    created_at: number;
}

export interface PublicWorkerJob {
    job_id: string;
    bead_id?: string;
    worker_kind: WorkerKind;
    objective: string;
    workspace_ref: string;
    expected_artifacts: WorkerArtifactExpectation[];
    state: WorkerJobState;
    progress: {
        percent: number;
        phase: WorkerJobProgressPhase;
    };
    cancel_requested: boolean;
    failure?: {
        code: string;
        summary?: string;
    };
    attempt_count: number;
    version: number;
    artifacts: PublicWorkerArtifact[];
    created_at: number;
    updated_at: number;
    started_at?: number;
    terminal_at?: number;
}
