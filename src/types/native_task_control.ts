export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};

export type JsonRecord = { [key: string]: JsonValue };

export const NATIVE_UNREPORTED_IDENTITY = 'unreported' as const;
export type NativeActualIdentity = string;

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

export type NativeTaskControlEventType = typeof NATIVE_TASK_CONTROL_EVENT_TYPES[number];

export const NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES = [
    'DELIVERED_UNVERIFIED',
    'BLOCKED',
    'FAILED',
    'UNKNOWN',
    'CANCELLED',
] as const;

export type NativeTaskControlTerminalOutcome = typeof NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES[number];
export type NativeWorkTerminalOutcome = NativeTaskControlTerminalOutcome;

export const NATIVE_TASK_CONTROL_TRANSFER_READINESS = [
    'TRANSFER_READY',
    'TRANSFER_READY_WITH_GAP',
    'TRANSFER_NOT_READY',
] as const;

export type NativeTransferReadiness = typeof NATIVE_TASK_CONTROL_TRANSFER_READINESS[number];
export type NativeTaskControlTransferReadiness = NativeTransferReadiness;

export type NativeSelectorEnforcement =
    | 'enforced'
    | 'unavailable'
    | 'mismatch'
    | 'unreported';

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

export const NATIVE_ROLE_MANIFEST_SCHEMA = 'cstar.native_role_manifest.v1' as const;
export const NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS = 8 as const;
export const NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS = 32 as const;
export const NATIVE_ROLE_MANIFEST_LIMITS = {
    max_persistent_role_slots: NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS,
    max_total_role_slots: NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS,
} as const;

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
    requested_selector?: string;
    actual_identity_attested?: boolean;
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
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
}

export interface NativeAuthorityBinding {
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
    readonly actual_identity: NativeActualIdentity;
    readonly goal_generation: number;
    readonly controller_generation: number;
    readonly occupant_generation: number;
    readonly generation?: NativeGoalGeneration;
}

export interface NativeControllerLease {
    lease_id: string;
    controller_generation: number;
    holder: string;
    issued_at?: string;
    expires_at?: string;
}

export interface NativeTaskControlEvent {
    event_id: string;
    event_type: NativeTaskControlEventType;
    occurred_at: string;
    event_sha256: string;
    generation?: NativeGoalGeneration;
    logical_item_id?: string;
    role_slot_id?: string;
    task_id?: string;
    payload?: JsonValue;
    canonical_event_sha256?: string;
}

export type NativeAcceptedTaskControlEvent = NativeTaskControlEvent;

export interface NativeSuccessionReceipt {
    receipt_id: string;
    previous_controller_generation: number;
    next_controller_generation: number;
    accepted_at: string;
    reason?: string;
    active_task_set?: string[];
    previous_event_sha256?: string;
}

export interface NativePreparedSuccessionRecord {
    succession_id: string;
    active_task_set: string[];
    previous_event_sha256: string;
    prepared_at: string;
    consumed: boolean;
}

export interface NativeCohortWait {
    wait_id: string;
    cohort_id: string;
    required: number;
    observed: number;
    deadline_ms?: number;
    satisfied: boolean;
    timed_out?: boolean;
    frozen?: boolean;
}

export interface NativeCohortWaitBudget {
    readonly cohort_id: string;
    readonly max_waits: 1;
    readonly deadline_ms: number;
    readonly consumed: boolean;
}

export type NativeWaitBudget = NativeCohortWaitBudget;

export type NativeCohortRecordKind = 'WAIT' | 'TIMEOUT' | 'FROZEN';

export interface NativeCohortRecord {
    kind: NativeCohortRecordKind;
    wait: NativeCohortWait;
    event_sha256: string;
}

export interface NativeReplacementBudget {
    readonly role_slot_id: string;
    readonly occupant_generation: number;
    readonly max_replacements: 1;
    readonly consumed_replacements: 0 | 1;
}

export interface NativeOccupantOutcome {
    role_slot_id: string;
    occupant_generation: number;
    logical_item_id: string;
    task_id: string;
    outcome: NativeTaskControlTerminalOutcome;
    event_sha256: string;
}

export interface NativeReplacementCount {
    role_slot_id: string;
    occupant_generation: number;
    replacement_count: 0 | 1;
}

export interface NativeCircuitBreaker {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
    threshold: number;
    opened_at?: string;
    last_error_code?: string;
}

export type NativeCapabilitySurfaceStatus = 'available' | 'absent' | 'unavailable';

export interface NativeCapabilitySurface {
    status: NativeCapabilitySurfaceStatus;
    reason?: string;
}

export interface NativeCapabilityProfile {
    schema: 'cstar.native_capability_profile.v1';
    create: NativeCapabilitySurface;
    list: NativeCapabilitySurface;
    read: NativeCapabilitySurface;
    send: NativeCapabilitySurface;
    wait: NativeCapabilitySurface;
    cancel: NativeCapabilitySurface;
    terminal: NativeCapabilitySurface;
    fallback: null;
    native_create?: NativeCapabilitySurface;
    native_list?: NativeCapabilitySurface;
    native_read?: NativeCapabilitySurface;
    native_send?: NativeCapabilitySurface;
    native_wait?: NativeCapabilitySurface;
    native_cancel?: NativeCapabilitySurface;
    native_terminal?: NativeCapabilitySurface;
}

export interface NativeTransitionContext {
    readonly authority: NativeAuthorityBinding;
    readonly role_manifest: NativeRoleManifest;
    readonly effective_policy: NativeTaskControlPolicy;
    readonly controller_lease: NativeControllerLease;
    readonly expected_controller_holder: string;
    readonly submitted_role_manifest_sha256: string;
    readonly submitted_policy_sha256: string;
    readonly submitted_work_package_sha256: string;
    readonly declared_task_kind: string;
    readonly declared_effect: string;
    readonly logical_item_id: string;
    readonly role_slot_id: string;
    readonly cohort_wait_budget: NativeCohortWaitBudget;
    readonly succession_budget: 1;
    readonly replacement_budget: NativeReplacementBudget;
    readonly capability_profile: NativeCapabilityProfile;
    readonly submitted_effective_policy_sha256?: string;
}

export interface NativeChangedPathInventory {
    path: string;
    bytes: number;
    lines: number;
    sha256: string;
}

export interface NativeCommandResult {
    argv: string[];
    exit_code: number;
    stdout_sha256: string;
    stderr_sha256: string;
    test_count?: number;
}

export type NativeTestCounts = { [name: string]: number };

export interface NativeLeaseMeasurement {
    lease_id: string;
    started_at: string;
    ended_at: string;
    elapsed_ms: number;
}

export interface NativeEffectObservation {
    count: number;
    observed: boolean;
    detail?: JsonValue;
}

export interface NativeProtectedEffectObservation {
    count: number;
    paths: string[];
    observed: boolean;
}

export interface NativeTransferCheckpoint {
    checkpoint_id: string;
    readiness: NativeTransferReadiness;
    sha256: string;
    reason?: string;
}

export interface NativeWorkTerminalReceipt {
    schema: 'cstar.native_work_terminal_receipt.v1';
    receipt_id: string;
    receipt_sha256: string;
    package_id: string;
    package_sha256: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item_id: string;
    partition_id: string;
    host_task_id: string;
    host_task_path: string;
    host_spawn_receipt: JsonValue;
    requested_model: string;
    requested_reasoning: string;
    selector_enforced: boolean;
    actual_identity: NativeActualIdentity;
    starting_source_sha256: string;
    ending_source_sha256: string;
    starting_tree_sha256: string;
    ending_tree_sha256: string;
    starting_status_sha256: string;
    ending_status_sha256: string;
    changed_paths: string[];
    changed_path_inventory: NativeChangedPathInventory[];
    sha256_by_path: { [path: string]: string };
    scope_violation_count: number;
    scope_violations: string[];
    commands: NativeCommandResult[];
    test_counts: NativeTestCounts;
    checks: { [name: string]: JsonValue };
    started_at: string;
    ended_at: string;
    elapsed_ms: number;
    lease_measurement: NativeLeaseMeasurement;
    attempt_count: number;
    retry_count: number;
    replay_count: number;
    replacement_count: number;
    fallback_count: number;
    descendant_count: number;
    peer_message_count: number;
    network: NativeEffectObservation;
    provider: NativeEffectObservation;
    spend: NativeEffectObservation;
    protected_effects: NativeProtectedEffectObservation;
    status: NativeTaskControlTerminalOutcome;
    reason: string;
    telemetry: JsonValue;
    protected_effect_counters: { [name: string]: number };
    prior_transfer_checkpoint?: NativeTransferCheckpoint;
    result_transfer_checkpoint?: NativeTransferCheckpoint;
    selector_enforcement?: NativeSelectorEnforcement;
    terminal_outcome?: NativeTaskControlTerminalOutcome;
    stable_reason?: string;
    command_results?: NativeCommandResult[];
}

export interface NativeTaskControlState {
    schema: 'cstar.native_task_control_state.v1';
    generation: NativeGoalGeneration;
    authority: NativeAuthorityBinding;
    policy: NativeTaskControlPolicy;
    events: NativeAcceptedTaskControlEvent[];
    controller_lease?: NativeControllerLease;
    termination_barrier: boolean;
    matching_terminal_event?: NativeAcceptedTaskControlEvent;
    cancel_count: number;
    completed_logical_item_ids: string[];
    prepared_succession?: NativePreparedSuccessionRecord;
    consumed_succession_count: 0 | 1;
    cohort_record?: NativeCohortRecord;
    occupant_outcomes: NativeOccupantOutcome[];
    replacement_counts: NativeReplacementCount[];
    circuit_breaker?: NativeCircuitBreaker;
    fenced: boolean;
    terminal_receipt?: NativeWorkTerminalReceipt;
}

export interface NativeTransitionResult {
    ok: boolean;
    state: NativeTaskControlState;
    event?: NativeTaskControlEvent;
    error_code?: string;
    accepted?: boolean;
    idempotent?: boolean;
    circuit_breaker?: NativeCircuitBreaker;
    fenced?: boolean;
}
