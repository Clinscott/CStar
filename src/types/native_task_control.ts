export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};

export type JsonRecord = { [key: string]: JsonValue };

export type NativeTaskControlEventType =
    | 'START'
    | 'PROGRESS'
    | 'COMPLETE'
    | 'CANCEL'
    | 'CANCEL_ACK'
    | 'REVOKE'
    | 'REVOKED'
    | 'UNKNOWN'
    | 'SUCCESSION_PREPARE'
    | 'SUCCESSION_COMMIT'
    | 'COHORT_WAIT'
    | 'TIMEOUT'
    | 'REPLACE'
    | 'FORGE_INVOKE'
    | 'PROTECTED_EFFECT';

export type NativeTaskControlTerminalOutcome =
    | 'DELIVERED_UNVERIFIED'
    | 'BLOCKED'
    | 'FAILED'
    | 'UNKNOWN'
    | 'CANCELLED';

export type NativeTaskControlTransferReadiness =
    | 'TRANSFER_READY'
    | 'TRANSFER_READY_WITH_GAP'
    | 'TRANSFER_NOT_READY';

// Short aliases keep the outcome vocabulary usable by receipt consumers.
export type NativeTerminalOutcome = NativeTaskControlTerminalOutcome;
export type NativeTransferReadiness = NativeTaskControlTransferReadiness;

export type NativeCapabilitySurfaceState = 'available' | 'absent' | 'unavailable';
export type NativeSelectorEnforcement = 'enforced' | 'not_enforced' | 'unreported';
export type NativeActualIdentity = string | 'unreported';

export const NATIVE_TASK_CONTROL_EVENT_TYPES = [
    'START',
    'PROGRESS',
    'COMPLETE',
    'CANCEL',
    'CANCEL_ACK',
    'REVOKE',
    'REVOKED',
    'UNKNOWN',
    'SUCCESSION_PREPARE',
    'SUCCESSION_COMMIT',
    'COHORT_WAIT',
    'TIMEOUT',
    'REPLACE',
    'FORGE_INVOKE',
    'PROTECTED_EFFECT',
] as const;
export const NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES = [
    'DELIVERED_UNVERIFIED',
    'BLOCKED',
    'FAILED',
    'UNKNOWN',
    'CANCELLED',
] as const;
export const NATIVE_TASK_CONTROL_TRANSFER_READINESS = [
    'TRANSFER_READY',
    'TRANSFER_READY_WITH_GAP',
    'TRANSFER_NOT_READY',
] as const;

export interface NativeTaskControlBudgets {
    model_requests?: number;
    tool_calls?: number;
    uncached_input_tokens?: number;
    output_plus_reasoning_tokens?: number;
    wall_time_seconds?: number;
}

export interface NativeTaskControlMaxima {
    descendants?: number;
    waits?: number;
    retries?: number;
    replays?: number;
    fallbacks?: number;
}

export interface NativeTaskControlAllowlists {
    task_kinds?: string[];
    effects?: string[];
}

export interface NativeTaskControlEffectPermissions {
    read_bound_context?: boolean;
    write_allowlisted_source?: boolean;
    run_bound_checks?: boolean;
    protected_effect?: boolean;
}

export interface NativeTaskControlPolicy {
    schema: 'cstar.native_policy.v1';
    policy_id: string;
    depth: number;
    budgets: NativeTaskControlBudgets;
    maxima: NativeTaskControlMaxima;
    allowlists: NativeTaskControlAllowlists;
    prohibitions: string[];
    requirements: string[];
    effect_permissions: NativeTaskControlEffectPermissions;
}

export interface NativeRequestedSelector {
    requested_model: string;
    requested_reasoning: string;
}

export const NATIVE_ROLE_MANIFEST_SCHEMA = 'cstar.native_role_manifest.v1' as const;
export const NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS = 8 as const;
export const NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS = 32 as const;
export const NATIVE_MAX_PERSISTENT_ROLE_SLOTS = NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS;
export const NATIVE_MAX_TOTAL_ROLE_SLOTS = NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS;

export type NativePersistentRoleSlotCount =
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type NativeTotalRoleSlotCount =
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
    | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
    | 30 | 31 | 32;

export interface NativeRoleSlot {
    role_slot_id: string;
    role: string;
    persistent: boolean;
    requested_model: string;
    requested_reasoning: string;
    actual_identity: NativeActualIdentity;
    descendants_max: number;
    task_kinds: string[];
    effects: string[];
    replacement_eligible: boolean;
    requested_selector: NativeRequestedSelector;
    actual_identity_attestation?: string;
}

export interface NativeRoleManifest {
    schema: typeof NATIVE_ROLE_MANIFEST_SCHEMA;
    manifest_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    max_persistent_role_slots: typeof NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS;
    max_total_role_slots: typeof NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS;
    slots: NativeRoleSlot[];
}

export interface NativeGoalGeneration {
    readonly goal_generation: number;
    readonly controller_generation: number;
    readonly occupant_generation: number;
}

export interface NativeAuthorityBinding extends NativeGoalGeneration {
    readonly root_id: string;
    readonly bead_id: string;
    readonly set_id: string;
    readonly phase_id: string;
    readonly logical_item_id: string;
    readonly partition_id: string;
    readonly role_slot_id: string;
    readonly work_package_sha256: string;
    readonly role_manifest_sha256: string;
    readonly effective_policy_sha256: string;
    readonly previous_event_sha256: string;
    readonly requested_model: string;
    readonly requested_reasoning: string;
    // This is observed data. It never grants authority or substitutes for attestation.
    readonly actual_identity: NativeActualIdentity;
}

export interface NativeControllerLease {
    lease_id: string;
    controller_generation: number;
    holder: string;
    issued_at?: string;
    expires_at?: string;
}

export interface NativeCapabilityProfile {
    schema: 'cstar.native_capability_profile.v1';
    create: NativeCapabilitySurfaceState;
    list: NativeCapabilitySurfaceState;
    read: NativeCapabilitySurfaceState;
    send: NativeCapabilitySurfaceState;
    wait: NativeCapabilitySurfaceState;
    cancel: NativeCapabilitySurfaceState;
    terminal: NativeCapabilitySurfaceState;
}

export type NativeTaskControlCapabilityProfile = NativeCapabilityProfile;

export interface NativeCohortWaitBudget {
    readonly cohort_id: string;
    readonly max_waits: 1;
    readonly deadline_ms: number;
}

export interface NativeReplacementBudget {
    readonly role_slot_id: string;
    readonly occupant_generation: number;
    readonly max_replacements: 1;
}

export interface NativeTransitionContext {
    readonly authority: NativeAuthorityBinding;
    readonly role_manifest: NativeRoleManifest;
    readonly effective_policy: NativeTaskControlPolicy;
    readonly controller_lease: NativeControllerLease;
    readonly expected_controller_holder: string;
    readonly submitted_role_manifest_sha256: string;
    readonly submitted_effective_policy_sha256: string;
    readonly submitted_work_package_sha256: string;
    readonly declared_task_kind: string;
    readonly declared_effect: string;
    readonly logical_item_id: string;
    readonly role_slot_id: string;
    readonly cohort_wait_budget: NativeCohortWaitBudget;
    readonly succession_budget: 1;
    readonly replacement_budget: NativeReplacementBudget;
    readonly capability_profile: NativeCapabilityProfile;
    readonly submitted_manifest_sha256?: string;
    readonly submitted_policy_sha256?: string;
    readonly submitted_work_package_hash?: string;
    readonly declared_task_kinds?: readonly string[];
    readonly declared_effects?: readonly string[];
}

export interface NativeTaskControlEvent {
    event_id: string;
    event_type: NativeTaskControlEventType;
    occurred_at: string;
    generation?: NativeGoalGeneration;
    logical_item_id?: string;
    role_slot_id?: string;
    task_id?: string;
    canonical_event_sha256?: string;
    payload?: JsonValue;
}

export interface NativeAcceptedTaskControlEvent extends NativeTaskControlEvent {
    canonical_event_sha256: string;
}

export interface NativeSuccessionReceipt {
    receipt_id: string;
    previous_controller_generation: number;
    next_controller_generation: number;
    accepted_at: string;
    reason?: string;
    active_task_ids?: string[];
    previous_event_sha256?: string;
}

export interface NativePreparedSuccessionRecord {
    receipt_id: string;
    active_task_ids: string[];
    prior_event_sha256: string;
    previous_event_sha256?: string;
    prepared_at: string;
    controller_generation: number;
    occupant_generation: number;
}

export type NativeCohortRecordStatus = 'WAITING' | 'TIMED_OUT' | 'FROZEN' | 'COMPLETED';

export interface NativeCohortWait {
    wait_id: string;
    cohort_id: string;
    required: number;
    observed: number;
    deadline_ms?: number;
    satisfied: boolean;
    status?: NativeCohortRecordStatus;
    frozen?: boolean;
    previous_event_sha256?: string;
}

export interface NativeCohortWaitRecord {
    wait: NativeCohortWait;
    status: NativeCohortRecordStatus;
    timeout_event_id?: string;
    frozen: boolean;
}

export type NativeKnownOccupantOutcome = NativeTaskControlTerminalOutcome | 'ACTIVE';

export interface NativeRoleSlotOccupantState {
    role_slot_id: string;
    occupant_id: string;
    occupant_generation: number;
    outcome: NativeKnownOccupantOutcome;
    replacement_count: number;
}

export interface NativeRoleSlotOccupantStates {
    [role_slot_id: string]: NativeRoleSlotOccupantState;
}

export interface NativeCircuitBreaker {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
    threshold: number;
    opened_at?: string;
    last_error_code?: string;
    fenced?: boolean;
    fence_reason?: string;
}

export interface NativeChangedPathRecord {
    path: string;
    byte_count: number;
    line_count: number;
    sha256: string;
    bytes?: number;
    lines?: number;
}

export interface NativeScopeViolation {
    path?: string;
    kind?: string;
    detail?: string;
}

export interface NativeCommandResult {
    argv: string[];
    exit_code: number;
    stdout_sha256: string;
    stderr_sha256: string;
    test_counts?: { [name: string]: number };
}

export interface NativeLeaseMeasurement {
    lease_id: string;
    holder: string;
    started_at?: string;
    ended_at?: string;
    elapsed_ms?: number;
}

export interface NativeHostTaskIdentity {
    host_task_id: string;
    host_task_path: string;
    spawn_receipt: JsonValue;
}

export interface NativeEffectObservation {
    count: number;
    detail?: JsonValue;
}

export interface NativeTransferCheckpoint {
    checkpoint_id: string;
    checkpoint_sha256: string;
    readiness: NativeTaskControlTransferReadiness;
}

export interface NativeWorkTerminalReceipt {
    schema?: 'cstar.native_work_terminal_receipt.v1';
    receipt_id?: string;
    receipt_sha256?: string;
    package_id?: string;
    package_sha256?: string;
    bead_id: string;
    set_id: string;
    phase_id?: string;
    logical_item_id?: string;
    partition_id?: string;
    host_task_id?: string;
    host_task_path?: string;
    host_task_identity?: NativeHostTaskIdentity;
    spawn_receipt?: JsonValue;
    requested_model?: string;
    requested_reasoning?: string;
    selector_enforcement?: NativeSelectorEnforcement;
    selector_enforced?: boolean;
    actual_identity?: NativeActualIdentity;
    starting_source_sha256?: string;
    ending_source_sha256?: string;
    starting_tree_sha256?: string;
    ending_tree_sha256?: string;
    starting_status_sha256?: string;
    ending_status_sha256?: string;
    changed_paths: string[];
    changed_path_inventory?: NativeChangedPathRecord[];
    sha256_by_path: { [path: string]: string };
    scope_violations?: NativeScopeViolation[];
    scope_violation_count?: number;
    literal_commands?: string[][];
    command_results?: NativeCommandResult[];
    test_counts?: { [name: string]: number };
    exit_codes?: number[];
    stdout_sha256_by_command?: string[];
    stderr_sha256_by_command?: string[];
    started_at?: string;
    ended_at?: string;
    elapsed_ms?: number;
    lease_measurements?: NativeLeaseMeasurement[];
    attempt_count?: number;
    retry_count?: number;
    replay_count?: number;
    replacement_count?: number;
    fallback_count?: number;
    descendant_count?: number;
    peer_message_count?: number;
    network_effects?: NativeEffectObservation;
    provider_effects?: NativeEffectObservation;
    spend_effects?: NativeEffectObservation;
    protected_effect_counters: { [name: string]: number };
    status: NativeTaskControlTerminalOutcome;
    outcome?: NativeTaskControlTerminalOutcome;
    stable_reason?: string;
    prior_transfer_checkpoint?: NativeTransferCheckpoint | null;
    result_transfer_checkpoint?: NativeTransferCheckpoint | null;
    transfer_readiness?: NativeTaskControlTransferReadiness;
    checks: { [name: string]: JsonValue };
    telemetry: JsonValue;
}

export interface NativeTaskControlState {
    schema: 'cstar.native_task_control_state.v1';
    generation: NativeGoalGeneration;
    policy: NativeTaskControlPolicy;
    events: NativeTaskControlEvent[];
    authority?: NativeAuthorityBinding;
    accepted_events?: NativeAcceptedTaskControlEvent[];
    termination_barrier?: boolean;
    matching_terminal_event_type?: NativeTaskControlEventType;
    cancel_count?: number;
    completed_logical_item_ids?: string[];
    completed_logical_items?: string[];
    prepared_succession?: NativePreparedSuccessionRecord;
    consumed_succession_count?: number;
    cohort_record?: NativeCohortWaitRecord;
    cohort_wait_record?: NativeCohortWaitRecord;
    occupants?: NativeRoleSlotOccupantStates;
    replacement_counts?: { [role_slot_id: string]: number };
    controller_lease?: NativeControllerLease;
    circuit_breaker?: NativeCircuitBreaker;
    fenced?: boolean;
    fence_reason?: string;
    terminal_receipt?: NativeWorkTerminalReceipt;
}

export interface NativeTransitionResult {
    ok: boolean;
    state: NativeTaskControlState;
    event?: NativeTaskControlEvent;
    error_code?: string;
    accepted?: boolean;
    idempotent?: boolean;
    state_unchanged?: boolean;
    circuit_breaker?: NativeCircuitBreaker;
    breaker?: NativeCircuitBreaker;
    fenced?: boolean;
    fence_reason?: string;
}
