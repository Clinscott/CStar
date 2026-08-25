import type { NativeTaskControlErrorCode } from '../core/native_task_control/errors.js';

export type JsonPrimitive = string | number | boolean | null;

export type JsonRecord = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;

export type NativeStringRecord = { [key: string]: string };

export type NativeNumberRecord = { [key: string]: number };

export type NativeEventType =
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

export type NativeTerminalOutcome =
    | 'DELIVERED_UNVERIFIED'
    | 'BLOCKED'
    | 'FAILED'
    | 'UNKNOWN'
    | 'CANCELLED';

export type NativeTransferReadiness =
    | 'TRANSFER_READY'
    | 'TRANSFER_READY_WITH_GAP'
    | 'TRANSFER_NOT_READY';

export type NativeCapabilitySurface =
    | 'create'
    | 'list'
    | 'read'
    | 'send'
    | 'wait'
    | 'cancel'
    | 'terminal';

export type NativeCapabilityState = 'available' | 'absent' | 'unavailable';

export type NativeActualIdentityStatus = 'attested' | 'unreported';

export interface NativeActualIdentity {
    status: NativeActualIdentityStatus;
    model: string | null;
    reasoning: string | null;
    host: string | null;
    attestation: JsonRecord | null;
}

export interface NativeSelectorBinding {
    selector: string;
    reasoning: string;
    enforced: boolean;
    evidence: JsonValue | null;
}

export interface NativeScopeBinding {
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item_id: string;
    partition_id: string;
    role_slot_id: string;
}

export interface NativeAuthorityBinding extends NativeScopeBinding {
    schema: 'cstar.native_authority_binding.v1';
    package_sha256: string;
    role_manifest_sha256: string;
    effective_policy_sha256: string;
    previous_event_sha256: string;
    requested_selector: string;
    requested_reasoning: string;
    actual_identity: NativeActualIdentity;
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
}

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

export interface NativeFixedLimits {
    persistent_role_slots: 8;
    total_role_slots: 32;
    policy_depth: 8;
    succession_per_goal_generation: 1;
    replacement_per_slot_generation: 1;
    cohort_waits_per_cohort: 1;
    cancel_calls: 1;
}

export interface NativeRoleSlot {
    role_slot_id: string;
    role: string;
    persistent: boolean;
    scope: NativeScopeBinding;
    task_kinds: string[];
    effects: string[];
    replacement_eligible: boolean;
    selector: NativeSelectorBinding;
    requested_model: string;
    requested_selector: string;
    requested_reasoning: string;
    actual_identity: NativeActualIdentity;
    descendants_max: number;
}

export interface NativeRoleManifest {
    schema: 'cstar.native_role_manifest.v1';
    manifest_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item_id: string;
    partition_id: string;
    max_persistent_role_slots: number;
    max_total_role_slots: number;
    policy_depth: number;
    slots: NativeRoleSlot[];
    fixed_limits: NativeFixedLimits;
}

export interface NativeGoalGeneration {
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
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
    event_type: NativeEventType;
    sequence: number;
    occurred_at: string;
    event_sha256: string;
    previous_event_sha256: string | null;
    authority: NativeAuthorityBinding;
    generation: NativeGoalGeneration;
    logical_item_id: string;
    role_slot_id: string;
    task_id?: string;
    task_kind?: string;
    effect?: string;
    payload?: JsonValue;
}

export interface NativeSuccessionReceipt {
    receipt_id: string;
    previous_controller_generation: number;
    next_controller_generation: number;
    accepted_at: string;
    reason?: string;
}

export interface NativeCohortWait {
    wait_id: string;
    cohort_id: string;
    required: number;
    observed: number;
    deadline_ms?: number;
    satisfied: boolean;
}

export interface NativeCohortWaitBudget {
    cohort_id: string;
    max_waits: 1;
    deadline_ms: number;
    immutable: true;
}

export interface NativeTimeoutRecord {
    timeout_id: string;
    cohort_id: string;
    wait_id: string;
    occurred_at: string;
    deadline_ms: number;
    frozen: true;
    event_sha256: string;
}

export interface NativePreparedSuccession {
    prepare_id: string;
    active_task_set: string[];
    last_event_sha256: string;
    prepared_at: string;
    frozen: true;
}

export interface NativeCircuitBreaker {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
    threshold: number;
    opened_at?: string;
    last_error_code?: string;
    fenced: boolean;
}

export interface NativeCapabilitySurfaceStates {
    create: NativeCapabilityState;
    list: NativeCapabilityState;
    read: NativeCapabilityState;
    send: NativeCapabilityState;
    wait: NativeCapabilityState;
    cancel: NativeCapabilityState;
    terminal: NativeCapabilityState;
}

export interface NativeCapabilityProfile {
    schema: 'cstar.native_capability_profile.v1';
    profile_id?: string;
    create: NativeCapabilityState;
    list: NativeCapabilityState;
    read: NativeCapabilityState;
    send: NativeCapabilityState;
    wait: NativeCapabilityState;
    cancel: NativeCapabilityState;
    terminal: NativeCapabilityState;
    fallback: null;
    fallback_surface: null;
}

export interface NativeSubmittedHashes {
    authority_sha256: string;
    package_sha256: string;
    role_manifest_sha256: string;
    effective_policy_sha256: string;
    previous_event_sha256: string;
    event_sha256?: string;
}

export interface NativeTransitionContext {
    authority: NativeAuthorityBinding;
    role_manifest: NativeRoleManifest;
    policy: NativeTaskControlPolicy;
    lease: NativeControllerLease;
    expected_holder: string;
    submitted_hashes: NativeSubmittedHashes;
    declared_task_kind: string;
    declared_effect: string;
    logical_item_id: string;
    role_slot_id: string;
    cohort_wait_budget: NativeCohortWaitBudget;
    succession_budget: 1;
    replacement_budget: 1;
    capability_profile: NativeCapabilityProfile;
}

export interface NativeRoleSlotOutcome {
    role_slot_id: string;
    occupant_generation: number;
    logical_item_id: string;
    task_id: string;
    outcome: NativeTerminalOutcome;
    replacement_count: number;
}

export interface NativeTaskControlState {
    schema: 'cstar.native_task_control_state.v1';
    authority: NativeAuthorityBinding;
    generation: NativeGoalGeneration;
    policy: NativeTaskControlPolicy;
    role_manifest: NativeRoleManifest;
    events: NativeTaskControlEvent[];
    last_event_sha256: string | null;
    termination_barrier: boolean;
    terminal: boolean;
    terminal_event: NativeTaskControlEvent | null;
    cancel_count: number;
    completed_logical_items: string[];
    prepared_succession: NativePreparedSuccession | null;
    active_task_set: string[];
    succession_count: number;
    cohort_wait: NativeCohortWait | null;
    timeout: NativeTimeoutRecord | null;
    wait_frozen: boolean;
    slot_outcomes: NativeRoleSlotOutcome[];
    replacement_counts: NativeNumberRecord;
    circuit_breaker: NativeCircuitBreaker;
    fenced: boolean;
    fence_reason: string | null;
    terminal_receipt?: NativeWorkTerminalReceipt;
    controller_lease?: NativeControllerLease;
}

export interface NativeChangedPath {
    path: string;
    bytes: number;
    lines: number;
    sha256: string;
}

export interface NativeSourceTreeStatusHashes {
    starting_source_sha256: string;
    ending_source_sha256: string;
    starting_tree_sha256: string;
    ending_tree_sha256: string;
    starting_status_sha256: string;
    ending_status_sha256: string;
}

export interface NativeTestCounts {
    pass: number;
    fail: number;
    skip: number;
    xfail: number;
}

export interface NativeCommandReceipt {
    name: string;
    argv: string[];
    exit_code: number;
    stdout_sha256: string;
    stderr_sha256: string;
    test_counts: NativeTestCounts;
    literal_command?: string;
}

export interface NativeTimingReceipt {
    started_at: string;
    ended_at: string;
    elapsed_seconds: number;
    wall_time_seconds: number;
}

export interface NativeLeaseUseReceipt {
    lease_id: string;
    holder: string;
    used: boolean;
    started_at: string;
    ended_at: string;
}

export interface NativeAttemptCounters {
    attempts: number;
    retries: number;
    replays: number;
    replacements: number;
    fallbacks: number;
}

export interface NativeTopologyReceipt {
    descendants: number;
    peer_messages: number;
    orphan_tasks: number;
    direct_workers: number;
}

export interface NativeEffectCounter {
    attempted: number;
    completed: number;
    blocked: number;
}

export interface NativeSpendObservation {
    attempted: number;
    authorized: number;
    amount: number | null;
    currency: string | null;
}

export interface NativeEffectObservations {
    network: NativeEffectCounter;
    provider: NativeEffectCounter;
    spend: NativeSpendObservation;
    protected_effects: NativeEffectCounter;
}

export interface NativeSelectorEnforcement {
    enforced: boolean;
    requested_selector: string;
    requested_reasoning: string;
    evidence: JsonValue;
}

export interface NativeTransferCheckpoint {
    checkpoint_id: string;
    sha256: string;
    readiness: NativeTransferReadiness;
}

export interface NativeWorkTerminalReceipt {
    schema: 'cstar.native_work_terminal_receipt.v1';
    receipt_id: string;
    package_id: string;
    package_sha256: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item_id: string;
    partition_id: string;
    host_task_id: string;
    host_task_path: string;
    host_spawn_receipt: JsonRecord;
    requested_selector: string;
    requested_reasoning: string;
    selector_enforcement: NativeSelectorEnforcement;
    actual_identity: NativeActualIdentity;
    source_hashes: NativeSourceTreeStatusHashes;
    changed_paths: string[];
    changed_path_inventory: NativeChangedPath[];
    sha256_by_path: NativeStringRecord;
    scope_violation_count: number;
    commands: NativeCommandReceipt[];
    checks: JsonRecord;
    timing: NativeTimingReceipt;
    lease_use: NativeLeaseUseReceipt;
    attempts: NativeAttemptCounters;
    topology: NativeTopologyReceipt;
    effects: NativeEffectObservations;
    protected_effect_counters: NativeNumberRecord;
    status: NativeTerminalOutcome;
    outcome?: NativeTerminalOutcome;
    reason: string;
    prior_transfer_checkpoint: NativeTransferCheckpoint | null;
    result_transfer_checkpoint: NativeTransferCheckpoint | null;
    transfer_readiness: NativeTransferReadiness;
    telemetry: JsonValue;
}

export interface NativeTransitionResult {
    ok: boolean;
    state: NativeTaskControlState;
    accepted: boolean;
    idempotent: boolean;
    state_unchanged: boolean;
    breaker: NativeCircuitBreaker;
    fenced: boolean;
    external_effects: 'none';
    event?: NativeTaskControlEvent;
    error_code?: NativeTaskControlErrorCode;
}
