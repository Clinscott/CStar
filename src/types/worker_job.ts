export const WORKER_JOB_KINDS = ['forge', 'researcher'] as const;
export type WorkerJobKind = typeof WORKER_JOB_KINDS[number];

export const WORKER_JOB_STATES = [
    'QUEUED',
    'LEASED',
    'RUNNING',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'DELIVERED_UNVERIFIED',
    'DELIVERED',
    'VALIDATING',
    'ACCEPTED',
    'REPAIR_QUEUED',
    'NEEDS_INPUT',
    'DOMAIN_TERMINAL',
    'FAILED',
    'UNKNOWN',
] as const;
export type WorkerJobState = typeof WORKER_JOB_STATES[number];

export const WORKER_JOB_PROGRESS_PHASES = [
    'queued',
    'preparing',
    'working',
    'dispatching',
    'delivered',
    'validating',
    'finalizing',
    'accepted',
    'repair_queued',
    'needs_input',
    'domain_terminal',
    'complete',
    'unknown',
] as const;
export type WorkerJobProgressPhase = typeof WORKER_JOB_PROGRESS_PHASES[number];

export const WORKER_JOB_VALIDATION_VERDICTS = [
    'ACCEPTED',
    'REPAIR_QUEUED',
    'NEEDS_INPUT',
    'DOMAIN_TERMINAL',
] as const;
export type WorkerJobValidationVerdict = typeof WORKER_JOB_VALIDATION_VERDICTS[number];

/** One provider-bearing attempt is reserved at a time; only zero-provider replay can reuse it. */
export const WORKER_JOB_ATTEMPT_CEILING = 1;
export const WORKER_JOB_ZERO_PROVIDER_REPLAY_CEILING = 1;

export const WORKER_JOB_ARTIFACT_KINDS = [
    'report',
    'patch',
    'package',
    'dataset',
    'test_result',
    'other',
] as const;
export type WorkerJobArtifactKind = typeof WORKER_JOB_ARTIFACT_KINDS[number];

export interface WorkerJobArtifactExpectation {
    name: string;
    artifact_kind: WorkerJobArtifactKind;
    required: boolean;
}

export interface WorkerJobProviderEvidence {
    attempt_id: string;
    provider_started: boolean;
    provider_requests_started: number;
    observed_at: number;
    evidence_sha256: string;
}

export interface WorkerJobSpendEvidence {
    attempt_id: string;
    spend_uncertain: boolean;
    known_spend_observed: boolean;
    observed_at: number;
    evidence_sha256: string;
}

/**
 * Authority-bound input for one subordinate transport attempt.
 * The ledger records this contract but grants none of its authority.
 */
export interface ExecutableWorkerJobContract {
    worker_kind: WorkerJobKind;
    bead_id: string;
    decision_id: string;
    canonical_request_id: string;
    canonical_request_sha256: string;
    authorization_id: string;
    authorization_expires_at: number;
    adapter_runtime_binding_sha256: string;
    idempotency_key: string;
    execution_deadline_at: number;
    attempt_id: string;
    objective: string;
    expected_artifacts: WorkerJobArtifactExpectation[];
    provider_evidence: WorkerJobProviderEvidence;
    spend_evidence: WorkerJobSpendEvidence;
}

export interface WorkerJobRecord extends ExecutableWorkerJobContract {
    job_id: string;
    contract_sha256: string;
    state: WorkerJobState;
    progress_percent: number;
    progress_phase: WorkerJobProgressPhase;
    cancel_requested_at?: number;
    cancel_reason?: string;
    failure_code?: string;
    failure_summary?: string;
    version: number;
    created_at: number;
    updated_at: number;
    terminal_at?: number;
}

export interface WorkerJobLeaseRecord {
    job_id: string;
    attempt_id: string;
    lease_owner_id: string;
    lease_token_sha256: string;
    leased_at: number;
    lease_expires_at: number;
    heartbeat_at: number;
}

export interface WorkerJobLeaseGrant {
    job: WorkerJobRecord;
    lease_token: string;
    lease_expires_at: number;
}

export interface WorkerJobDispatchReservation extends WorkerJobLeaseGrant {
    dispatch_id: string;
    host_launch_required: true;
    cstar_launch: false;
}

export interface WorkerJobValidationInput {
    validation_id: string;
    verdict: WorkerJobValidationVerdict;
    evidence_sha256: string;
    summary?: string;
}

export interface WorkerJobRepairInput {
    failure_code: string;
    failure_summary?: string;
    zero_provider_proof: WorkerJobZeroProviderProof;
}

export interface WorkerJobArtifactRecord {
    artifact_id: string;
    job_id: string;
    attempt_id: string;
    artifact_kind: WorkerJobArtifactKind;
    name: string;
    media_type: string;
    byte_count: number;
    sha256: string;
    storage_ref: string;
    status: 'STAGED' | 'DELIVERED_UNVERIFIED' | 'REJECTED';
    created_at: number;
    updated_at: number;
}

export interface StageWorkerJobArtifactInput {
    artifact_id: string;
    attempt_id: string;
    artifact_kind: WorkerJobArtifactKind;
    name: string;
    media_type: string;
    byte_count: number;
    sha256: string;
    storage_ref: string;
}

export interface WorkerJobZeroProviderProof {
    attempt_id: string;
    provider_requests_started: 0;
    known_spend_observed: false;
    spend_uncertain: false;
    observed_at: number;
    evidence_sha256: string;
}

export interface WorkerJobEventRecord {
    event_id: string;
    job_id: string;
    attempt_id: string;
    event_kind: string;
    state: WorkerJobState;
    progress_percent: number;
    progress_phase: WorkerJobProgressPhase;
    evidence_sha256?: string;
    detail?: string;
    created_at: number;
}
