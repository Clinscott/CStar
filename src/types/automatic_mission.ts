/**
 * Internal deterministic mission-ingress types.
 *
 * This surface describes state and authority.  It deliberately contains no
 * worker, provider, timer, or process-launching capability.
 */

export const AUTOMATIC_MISSION_SCHEMA = 'cstar.mission.v1' as const;
export const AUTOMATIC_MISSION_SET_GRANT_SCHEMA = 'cstar.mission_set_grant.v1' as const;
export const AUTOMATIC_MISSION_ROOT_RECORD_SCHEMA = 'cstar.root_user_instruction_record.v1' as const;
export const AUTOMATIC_MISSION_LEGACY_SINGLETON_SCHEMA =
    'cstar.codex_root_user_turn_record_set.v1' as const;

export const AUTOMATIC_MISSION_STATES = [
    'DRAFT',
    'NEEDS_DESIGN',
    'SET_BOUND',
    'MATERIALIZED',
    'DISPATCH_QUEUED',
] as const;
export type AutomaticMissionState = typeof AUTOMATIC_MISSION_STATES[number];

export const AUTOMATIC_MISSION_OUTCOMES = [
    'ok',
    'needs_input',
    'guardrail_block',
    'domain_terminal',
    'transport_error',
    'internal_error',
] as const;
export type AutomaticMissionOutcomeKind = typeof AUTOMATIC_MISSION_OUTCOMES[number];

export type AutomaticMissionAction =
    | 'draft'
    | 'bind'
    | 'materialize'
    | 'queue_dispatch';

export type AutomaticMissionCompatibilityProfile =
    | 'cstar_mission_v1'
    | 'legacy_singleton_v1';

export interface AutomaticMissionAdapterMetadata {
    adapter_ref: string;
    capability?: string;
    provider?: string;
    requested_model?: string;
}

export interface AutomaticMissionCallbackMetadata {
    callback_thread_id?: string;
    expected_packet?: string;
    callback_required?: boolean;
}

export interface AutomaticMissionValidatorMetadata {
    validator_id?: string;
    ticket_ref?: string;
    evidence_root?: string;
}

export interface AutomaticMissionDesign {
    description?: string;
    root_task?: string;
    targets?: string[];
    outputs?: string[];
    prohibitions?: string[];
    retry_ceiling?: number;
    attempt_ceiling?: number;
    spend_ceiling?: number;
    expires_at?: number;
    adapter?: AutomaticMissionAdapterMetadata;
    callback?: AutomaticMissionCallbackMetadata;
    validator?: AutomaticMissionValidatorMetadata;
}

/** Input aliases remain accepted at the boundary and are canonicalized before hashing. */
export interface AutomaticMissionConstraints {
    retry_ceiling?: number;
    attempt_ceiling?: number;
    spend_ceiling?: number;
    expires_at?: number;
    max_retries?: number;
    max_attempts?: number;
    max_spend?: number;
    retry_limit?: number;
    attempt_limit?: number;
    spend_limit?: number;
    expiry_at?: number;
}

export interface RootUserInstructionRecord {
    schema: typeof AUTOMATIC_MISSION_ROOT_RECORD_SCHEMA;
    record_id: string;
    thread_id: string;
    turn_id: string;
    timestamp: string;
    text: string;
    content?: Array<{ type: 'input_text'; text: string }>;
    raw_line?: string;
    message_sha256: string;
    record_sha256: string;
    record_set_sha256?: string;
    index?: number;
}

export type RootUserInstructionInput = RootUserInstructionRecord | string | {
    record_id?: string;
    thread_id?: string;
    turn_id?: string;
    timestamp?: string;
    text: string;
    content?: Array<{ type: 'input_text'; text: string }>;
    raw_line?: string;
    message_sha256?: string;
    record_sha256?: string;
    record_set_sha256?: string;
};

export interface AutomaticMissionInput {
    objective: string;
    design?: AutomaticMissionDesign | string | null;
    constraints?: AutomaticMissionConstraints | null;
    root_user_record?: RootUserInstructionInput;
    root_user_records?: RootUserInstructionInput[];
    idempotency_key?: string;
    compatibility_profile?: AutomaticMissionCompatibilityProfile;
    action?: AutomaticMissionAction;
    queue_dispatch?: boolean;
}

export interface CanonicalAutomaticMissionDesign {
    description: string | null;
    root_task: string | null;
    targets: string[];
    outputs: string[];
    prohibitions: string[];
    retry_ceiling: number | null;
    attempt_ceiling: number | null;
    spend_ceiling: number | null;
    expires_at: number | null;
    adapter: AutomaticMissionAdapterMetadata | null;
    callback: AutomaticMissionCallbackMetadata | null;
    validator: AutomaticMissionValidatorMetadata | null;
}

export interface CanonicalAutomaticMissionConstraints {
    retry_ceiling: number | null;
    attempt_ceiling: number | null;
    spend_ceiling: number | null;
    expires_at: number | null;
}

export interface CanonicalAutomaticMissionRequest {
    schema: typeof AUTOMATIC_MISSION_SCHEMA;
    objective: string;
    design: CanonicalAutomaticMissionDesign | null;
    constraints: CanonicalAutomaticMissionConstraints;
    root_user_records: RootUserInstructionRecord[];
    idempotency_key: string | null;
    compatibility_profile: AutomaticMissionCompatibilityProfile;
}

export interface AutomaticMissionIdentifiers {
    mission_id: string;
    decision_id: string;
    bead_id: string;
    request_id: string;
    request_sha256: string;
    idempotency_key: string;
    design_sha256: string | null;
    constraints_sha256: string;
    binding_sha256: string;
}

export type AutomaticMissionGrantStatus = 'BOUND' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';

export interface AutomaticMissionSetGrant {
    schema: typeof AUTOMATIC_MISSION_SET_GRANT_SCHEMA;
    grant_id: string;
    mission_id: string;
    decision_id: string;
    bead_id: string;
    request_id: string;
    design_sha256: string;
    constraints_sha256: string;
    root_task: string | null;
    root_task_sha256: string;
    targets: string[];
    outputs: string[];
    prohibitions: string[];
    retry_ceiling: number;
    attempt_ceiling: number;
    spend_ceiling: number;
    expires_at: number;
    root_user_thread_id: string;
    root_user_turn_id: string;
    root_user_record_sha256: string;
    root_user_record_set_sha256: string;
    root_user_record_count: number;
    selected_root_user_record_index: number;
    authority_binding_sha256: string;
    adapter: AutomaticMissionAdapterMetadata | null;
    callback: AutomaticMissionCallbackMetadata | null;
    validator: AutomaticMissionValidatorMetadata | null;
    status: AutomaticMissionGrantStatus;
    issued_at: number;
    consumed_at?: number;
    revoked_at?: number;
    revocation_reason?: string;
}

export interface AutomaticMissionRecord extends AutomaticMissionIdentifiers {
    schema: typeof AUTOMATIC_MISSION_SCHEMA;
    objective: string;
    design: CanonicalAutomaticMissionDesign | null;
    constraints: CanonicalAutomaticMissionConstraints;
    compatibility_profile: AutomaticMissionCompatibilityProfile;
    state: AutomaticMissionState;
    created_at: number;
    updated_at: number;
    root_user_records: RootUserInstructionRecord[];
    root_user_record_set_sha256: string | null;
    root_user_instruction_sha256: string | null;
    set_grant: AutomaticMissionSetGrant | null;
    adapter: AutomaticMissionAdapterMetadata | null;
    callback: AutomaticMissionCallbackMetadata | null;
    validator: AutomaticMissionValidatorMetadata | null;
    dispatch_queued_at?: number;
}

export interface AutomaticMissionDispatchProjection {
    queued: boolean;
    launch_required_by_host: true;
    worker_launch_performed: false;
    host_dispatch_id: string;
}

export interface AutomaticMissionOutcome<T = AutomaticMissionRecord> {
    outcome: AutomaticMissionOutcomeKind;
    /** Alias used by the A2 typed-outcome contract. */
    kind: AutomaticMissionOutcomeKind;
    status: AutomaticMissionOutcomeKind;
    state: AutomaticMissionState;
    mission?: T;
    set_grant?: AutomaticMissionSetGrant;
    dispatch?: AutomaticMissionDispatchProjection;
    error_code?: string;
    message?: string;
    next_action?: string;
    idempotent_replay?: boolean;
}

export interface AutomaticMissionAuthorityBinding {
    grant_kind: 'mission' | 'receipt';
    selected_record_index: number;
    selected_record_sha256: string;
    record_set_sha256: string;
    record_count: number;
    message_sha256: string;
    binding_sha256: string;
    thread_id: string;
    turn_id: string;
}
