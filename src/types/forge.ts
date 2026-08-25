export type HallForgeWriteCapability = 'response_only' | 'project_files';

export type HallForgeAuthorizationProfile =
    | 'root_user_forge_intent_v1'
    | 'autonomous_dispatch_policy_v1'
    | 'exact_request_challenge_v1';

export type HallForgeRequestStatus =
    | 'PENDING_AUTH'
    | 'AUTHORIZED'
    | 'SUCCEEDED'
    | 'FAILED_FINAL'
    | 'EXHAUSTED'
    | 'AMBIGUOUS'
    | 'REVOKED'
    | 'SUPERSEDED';

export type HallForgeAttemptStatus =
    | 'RESERVED'
    | 'STARTED'
    | 'SUCCEEDED'
    | 'FAILED_RETRYABLE'
    | 'FAILED_FINAL'
    | 'UNKNOWN';

export type HallForgeAttemptBudgetClass =
    | 'provider_or_unknown'
    | 'mechanical_no_provider';

export type HallForgeContinuationStatus =
    | 'PENDING_REPAIR'
    | 'RESUMED'
    | 'BLOCKED';

export type HallForgeMissionGrantStatus =
    | 'ACTIVE'
    | 'BLOCKED'
    | 'REVOKED'
    | 'EXPIRED'
    | 'EXHAUSTED';

export const FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS = [
    'git_branch',
    'git_commit',
    'git_push',
    'git_merge',
    'git_pull_request',
    'install',
    'deploy',
    'restart',
    'activation',
    'secret_config_mutation',
    'credential_mutation',
    'token_mutation',
    'direct_state_write',
    'destructive_cleanup',
    'permission_change',
    'process_control',
    'service_control',
    'steering',
    'locked_holdout',
    'expanded_spend',
    'production_claim',
    'out_of_scope_writes',
] as const;

export interface ForgeMissionGrantEnvelope {
    schema: 'cstar.forge_mission_grant_envelope.v1';
    allowed_targets: string[];
    allowed_outputs: string[];
    allowed_actions: string[];
    prohibited_actions: string[];
    adapter_ref: string;
    write_capability: HallForgeWriteCapability;
    total_provider_attempt_ceiling: number;
    retry_derived_iteration_ceiling: number;
    paid_attempt_ceiling: number;
}

export const FORGE_PRE_PROVIDER_RECOVERABLE_FAILURE_CODES = [
    'forge_hermes_target_material_too_large',
    'forge_workspace_target_material_too_large',
    'forge_workspace_output_material_too_large',
    'forge_hermes_request_runtime_drift',
    'forge_hermes_oauth_status_failed',
] as const;

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
    requester_thread_id?: string;
    requester_turn_id?: string;
    requester_record_set_sha256?: string;
    authorization_profile?: HallForgeAuthorizationProfile;
    authorization_binding_sha256?: string;
    authorization_challenge_sha256?: string;
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
    superseded_by?: string;
    supersedes_request_id?: string;
}

export interface HallForgeAuthorizationRecord {
    authorization_id: string;
    request_id: string;
    request_sha256: string;
    authorization_profile: HallForgeAuthorizationProfile;
    authorization_binding_sha256: string;
    challenge_sha256?: string;
    operator_intent_json?: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    execution_grant_schema?: 'cstar.forge_legacy_v2_execution_grant.v1';
    execution_grant_sha256?: string;
    execution_grant_json?: string;
    authorized_at: number;
    expires_at: number;
    created_at: number;
}

export interface HallForgeMissionGrantRecord {
    mission_grant_id: string;
    repo_id: string;
    mission_decision_id: string;
    root_bead_id: string;
    allowed_child_lineage_json: string;
    root_thread_id: string;
    set_turn_id: string;
    set_record_sha256: string;
    set_record_set_sha256: string;
    set_record_count: number;
    design_sha256: string;
    allowed_targets_json: string;
    allowed_outputs_json: string;
    allowed_actions_json: string;
    prohibited_actions_json: string;
    adapter_ref: string;
    write_capability: HallForgeWriteCapability;
    total_provider_attempt_ceiling: number;
    retry_derived_iteration_ceiling: number;
    paid_attempt_ceiling: number;
    authorized_at: number;
    expires_at: number;
    status: HallForgeMissionGrantStatus;
    revocation_state: 'ACTIVE' | 'REVOKED';
    blocked_reason?: string;
    revoked_at?: number;
    revocation_reason?: string;
    created_at: number;
    updated_at: number;
}

export interface MaterializeForgeMissionGrantInput {
    repo_id: string;
    mission_decision_id: string;
    root_bead_id: string;
    allowed_child_lineage: string[];
    root_thread_id: string;
    set_turn_id: string;
    set_record_sha256: string;
    set_record_set_sha256: string;
    set_record_count: number;
    design_sha256: string;
    allowed_targets: string[];
    allowed_outputs: string[];
    allowed_actions: string[];
    prohibited_actions: string[];
    adapter_ref: string;
    write_capability: HallForgeWriteCapability;
    total_provider_attempt_ceiling: number;
    retry_derived_iteration_ceiling: number;
    paid_attempt_ceiling: number;
    authorization_profile?: HallForgeAuthorizationProfile;
    policy_provider_attempt_ceiling?: number;
    authorized_at: number;
    expires_at: number;
    now?: number;
}

export interface SaveForgeRequestInput {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    request_sha256: string;
    request_summary_json: string;
    target_paths_sha256: string;
    live_source_allowed: boolean;
    max_attempts: number;
    requester_thread_id?: string;
    requester_turn_id?: string;
    requester_record_set_sha256?: string;
    authorization_profile?: HallForgeAuthorizationProfile;
    authorization_binding_sha256?: string;
    authorization_challenge_sha256?: string;
    adapter_ref?: string;
    write_capability?: HallForgeWriteCapability;
    runtime_evidence_refresh_validated?: true;
    now?: number;
}

export interface AuthorizeForgeRequestInput {
    request_id: string;
    request_sha256: string;
    authorization_profile: HallForgeAuthorizationProfile;
    authorization_binding_sha256?: string;
    challenge_sha256?: string;
    operator_intent_json?: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    execution_grant_schema?: 'cstar.forge_legacy_v2_execution_grant.v1';
    execution_grant_sha256?: string;
    execution_grant_json?: string;
    authorized_at: number;
    expires_at: number;
    now?: number;
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
    attempt_budget_class: HallForgeAttemptBudgetClass;
    provider_evidence_valid: 0 | 1;
    provider_requests_started?: number;
    provider_requests_completed?: number;
    provider_requests_ambiguous?: number;
    live_spend?: 0 | 1;
    live_spend_unknown: 0 | 1;
    known_spend_observed: 0 | 1;
    live_source_collection?: 0 | 1;
    workspace_commit_present?: 0 | 1;
    failure_evidence_sha256?: string;
    failure_signature_sha256?: string;
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

export interface HallForgeContinuationRecord {
    continuation_id: string;
    request_id: string;
    attempt_id: string;
    cycle_ordinal: number;
    failure_code: string;
    failure_fingerprint_sha256: string;
    execution_trace_sha256: string;
    zero_provider_proof_sha256: string;
    zero_provider_proof_json: string;
    continuation_authority_sha256: string;
    prior_runtime_sha256: string;
    next_runtime_sha256?: string;
    repair_validation_id?: string;
    repair_evidence_sha256?: string;
    reconciled_from_status?: 'FAILED_FINAL';
    block_reason?: 'repeated_failure_no_progress' | 'mechanical_cycle_budget_exhausted';
    provider_attempted: 0;
    proof_valid: 1;
    status: HallForgeContinuationStatus;
    created_at: number;
    updated_at: number;
    resumed_at?: number;
}
