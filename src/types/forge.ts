export type HallForgeWriteCapability = 'response_only' | 'project_files';

export type HallForgeRequestStatus =
    | 'PENDING_AUTH'
    | 'AUTHORIZED'
    | 'SUCCEEDED'
    | 'FAILED_FINAL'
    | 'EXHAUSTED'
    | 'AMBIGUOUS'
    | 'REVOKED';

export type HallForgeAttemptStatus =
    | 'RESERVED'
    | 'STARTED'
    | 'SUCCEEDED'
    | 'FAILED_RETRYABLE'
    | 'FAILED_FINAL'
    | 'UNKNOWN';

export interface HallForgeRequestRecord {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    operator_authorization_ref?: string;
    operator_thread_id?: string;
    operator_turn_id?: string;
    operator_message_sha256?: string;
    operator_record_sha256?: string;
    operator_record_set_sha256?: string;
    operator_record_count?: number;
    request_sha256: string;
    request_summary_json: string;
    adapter_ref?: string;
    write_capability?: HallForgeWriteCapability;
    target_paths_sha256: string;
    live_source_allowed: 0 | 1;
    max_attempts: number;
    status: HallForgeRequestStatus;
    active_attempt_id?: string;
    authorized_at?: number;
    expires_at?: number;
    created_at: number;
    updated_at: number;
    completed_at?: number;
}

export interface HallForgeAttemptRecord {
    attempt_id: string;
    request_id: string;
    ordinal: number;
    idempotency_key: string;
    execution_receipt_id: string;
    adapter_ref: string;
    provider?: string;
    requested_model?: string;
    actual_model?: string;
    model_source?: string;
    reasoning_profile?: string;
    adapter_version?: string;
    status: HallForgeAttemptStatus;
    retry_of_attempt_id?: string;
    external_execution_id?: string;
    result_status?: string;
    result_artifact_sha256?: string;
    error_code?: string;
    validation_id?: string;
    validation_verdict?: string;
    validation_notes_sha256?: string;
    validation_authority?: string;
    validation_evidence_sha256?: string;
    reserved_at: number;
    spawn_started_at?: number;
    completed_at?: number;
    updated_at: number;
}
