export const WORKER_JOB_KINDS = ['forge', 'researcher'] as const;
export type WorkerJobKind = typeof WORKER_JOB_KINDS[number];

export const WORKER_JOB_PROVIDER_REQUEST_CEILING = 6;

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

export const CODEX_HOST_WORKER_JOB_SCHEMA = 'cstar.codex_host_worker_job.v2' as const;
export const CODEX_HOST_WORKER_HANDOFF_SCHEMA =
    'cstar.forge_codex_host_worker_handoff.v1' as const;

interface CodexHostWorkerValidationTicketBindingFields {
    repository_id: string;
    bead_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    one_use: true;
}

export interface CodexHostWorkerValidationTicketBinding
    extends CodexHostWorkerValidationTicketBindingFields {
    schema: 'cstar.validation_ticket_binding.v1';
}

export interface CodexHostWorkerValidationTicketRequest
    extends CodexHostWorkerValidationTicketBindingFields {
    schema: 'cstar.validation_ticket_request.v1';
    expires_at: number;
    validator_thread_id?: string;
    validator_turn_id?: string;
}

/**
 * Lexical path identity bound into a current Codex-host handoff. Missing paths
 * bind the existing parent and the still-missing suffix; existing files bind
 * device/inode/nlink and existing directories bind device/inode.
 */
export interface CodexHostPathIdentity {
    path: string;
    state: 'missing' | 'file' | 'directory';
    resolved_path: string | null;
    device: string | null;
    inode: string | null;
    nlink: number | null;
    parent_path: string;
    parent_resolved_path: string;
    parent_device: string;
    parent_inode: string;
    missing_suffix: string[];
}

export interface CodexHostWorkerJobContract {
    schema: typeof CODEX_HOST_WORKER_JOB_SCHEMA;
    worker_kind: 'forge' | 'researcher';
    workflow_surface: 'forge' | 'researcher';
    bead_id: string;
    decision_id: string;
    canonical_request_id: string;
    canonical_request_sha256: string;
    authorization_id: string;
    authorization_expires_at: number;
    runner_owner: 'codex-host';
    requested_model: 'gpt-5.6-luna';
    requested_reasoning: 'max';
    selector_status: 'enforced';
    actual_identity: string | null;
    transport: 'codex-host';
    cognition_launch: false;
    cstar_launch: false;
    provider_requests_started: 0;
    spend_uncertain: false;
    known_spend_observed: false;
    network_accessed: false;
    idempotency_key: string;
    execution_deadline_at: number;
    attempt_id: string;
    objective: string;
    expected_artifacts: WorkerJobArtifactExpectation[];
    dispatch_receipt_sha256: string;
    job_id?: string;
    host_launch_required?: true;
    project_root?: string;
    target_paths?: string[];
    output_paths?: string[];
    required_output_paths?: string[];
    target_paths_sha256?: string;
    path_identity_bindings?: CodexHostPathIdentity[];
    validation_ticket_binding?: CodexHostWorkerValidationTicketBinding;
    validation_ticket_request?: CodexHostWorkerValidationTicketRequest;
    validation_ticket?: string;
}

export interface CodexHostWorkerHandoff {
    schema: typeof CODEX_HOST_WORKER_HANDOFF_SCHEMA;
    status: 'queued' | 'replayed';
    job: CodexHostWorkerJobContract;
    handoff_sha256: string;
    handoff_path: string;
    host_launch_required: true;
    cstar_launch: false;
    provider_attempted: false;
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

export interface WorkerJobReplayAuthorization {
    lease_owner_id: string;
    lease_token: string;
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
