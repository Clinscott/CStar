export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};

export type NativeJsonRecord = {
    readonly [key: string]: JsonValue;
};

export type NativeSha256 = string;
export type NativeActualIdentity = string | 'unreported';
export type NativeSelectorEnforcement = 'enforced' | 'unreported' | 'mismatch';

export const NATIVE_TASK_CONTROL_EVENT_TYPES = Object.freeze({
    START: 'START',
    PROGRESS: 'PROGRESS',
    COMPLETE: 'COMPLETE',
    FAILED: 'FAILED',
    BLOCKED: 'BLOCKED',
    CANCEL: 'CANCEL',
    CANCEL_ACK: 'CANCEL_ACK',
    REVOKE: 'REVOKE',
    REVOKED: 'REVOKED',
    UNKNOWN: 'UNKNOWN',
    SUCCESSION_PREPARE: 'SUCCESSION_PREPARE',
    SUCCESSION_COMMIT: 'SUCCESSION_COMMIT',
    COHORT_WAIT: 'COHORT_WAIT',
    TIMEOUT: 'TIMEOUT',
    REPLACE: 'REPLACE',
} as const);
export type NativeTaskControlEventType =
    typeof NATIVE_TASK_CONTROL_EVENT_TYPES[keyof typeof NATIVE_TASK_CONTROL_EVENT_TYPES];

export const NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES = Object.freeze({
    COMPLETE: 'COMPLETE',
    FAILED: 'FAILED',
    BLOCKED: 'BLOCKED',
    CANCEL_ACK: 'CANCEL_ACK',
    REVOKED: 'REVOKED',
    UNKNOWN: 'UNKNOWN',
    FENCED: 'FENCED',
    DELIVERED_UNVERIFIED: 'DELIVERED_UNVERIFIED',
} as const);
export type NativeTaskControlTerminalOutcome =
    typeof NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES[keyof typeof NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES];

export type NativeTaskControlTerminalEventKind = 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN';
export type NativeTerminalStatus = 'DELIVERED_UNVERIFIED' | 'BLOCKED';

export const NATIVE_TASK_CONTROL_SELECTOR_ENFORCEMENT = Object.freeze({
    ENFORCED: 'enforced',
    UNREPORTED: 'unreported',
    MISMATCH: 'mismatch',
} as const);

export const NATIVE_ROLE_MANIFEST_CEILINGS = Object.freeze({
    max_persistent_role_slots: 8,
    max_total_role_slots: 32,
} as const);

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

export interface NativeRoleSlot {
    role_slot_id: string;
    role: string;
    persistent: boolean;
    requested_model: string;
    requested_reasoning: string;
    actual_identity: string;
    descendants_max: number;
}

export interface NativeRoleManifest {
    schema: 'cstar.native_role_manifest.v1';
    manifest_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    max_persistent_role_slots: number;
    max_total_role_slots: number;
    slots: NativeRoleSlot[];
}

export interface NativeTaskControlAuthorityBinding {
    readonly root_id: string;
    readonly bead_id: string;
    readonly set_id: string;
    readonly phase_id: string;
    readonly logical_item_id: string;
    readonly partition_id: string;
    readonly goal_generation: number;
    readonly controller_generation: number;
    readonly occupant_generation: number;
    readonly work_package_sha256: NativeSha256;
    readonly role_manifest_sha256: NativeSha256;
    readonly effective_policy_sha256: NativeSha256;
    readonly previous_event_sha256: NativeSha256;
    readonly role_slot_id: string;
    readonly requested_model: string;
    readonly requested_reasoning: string;
    readonly actual_identity: NativeActualIdentity;
}
export type NativeTaskControlAuthority = NativeTaskControlAuthorityBinding;

export interface NativeRoleSlotBinding {
    readonly role_slot_id: string;
    readonly role: string;
    readonly persistent: boolean;
    readonly requested_model: string;
    readonly requested_reasoning: string;
    readonly actual_identity: NativeActualIdentity;
    readonly descendants_max: number;
}

export interface NativeRoleManifestV1 {
    readonly schema: 'cstar.native_role_manifest.v1';
    readonly manifest_id: string;
    readonly root_id: string;
    readonly bead_id: string;
    readonly set_id: string;
    readonly phase_id: string;
    readonly role_manifest_sha256: NativeSha256;
    readonly max_persistent_role_slots: number;
    readonly max_total_role_slots: number;
    readonly slots: readonly NativeRoleSlotBinding[];
}
export type NativeStrictRoleManifest = NativeRoleManifestV1;

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
export interface NativeActiveControllerLease {
    readonly lease_id: string;
    readonly controller_generation: number;
    readonly holder: string;
}

export interface NativeTaskControlEvent {
    event_id: string;
    event_type: string;
    occurred_at: string;
    generation?: NativeGoalGeneration;
    payload?: JsonValue;
}

export interface NativeTaskControlEventV1 extends NativeTaskControlAuthorityBinding {
    readonly schema: 'cstar.native_task_control_event.v1';
    readonly event_id: string;
    readonly event_type: NativeTaskControlEventType;
    readonly occurred_at: string;
    readonly role: string;
    readonly task_kind: string;
    readonly effect: string;
    readonly payload: JsonValue;
    readonly event_sha256: NativeSha256;
}
export type NativeStrictTaskControlEvent = NativeTaskControlEventV1;

export interface NativeEventHashLedgerEntry {
    readonly sequence: number;
    readonly event: NativeTaskControlEventV1;
    readonly event_sha256: NativeSha256;
    readonly previous_event_sha256: NativeSha256;
}

export interface NativeSuccessionReceipt {
    receipt_id: string;
    previous_controller_generation: number;
    next_controller_generation: number;
    accepted_at: string;
    reason?: string;
}

export interface NativePreparedSuccessionBinding {
    readonly schema: 'cstar.native_succession_receipt.v1';
    readonly receipt_id: string;
    readonly active_task_set: readonly string[];
    readonly prior_event_sha256: NativeSha256;
    readonly controller_generation: number;
    readonly occupant_generation: number;
    readonly prepared_at: string;
}
export type NativeStrictSuccessionReceipt = NativePreparedSuccessionBinding;

export interface NativeCohortWait {
    wait_id: string;
    cohort_id: string;
    required: number;
    observed: number;
    deadline_ms?: number;
    satisfied: boolean;
}
export interface NativeCohortWaitBudget {
    readonly cohort_id: string;
    readonly max_waits: 1;
    readonly deadline_ms: number;
}

export interface NativeCohortWaitRecord {
    readonly schema: 'cstar.native_cohort_wait.v1';
    readonly wait_id: string;
    readonly cohort_id: string;
    readonly required: number;
    readonly observed: number;
    readonly deadline_ms: number;
    readonly started_at: string;
    readonly timed_out: boolean;
    readonly frozen: boolean;
}
export interface NativeCohortWaitState {
    readonly record: NativeCohortWaitRecord | null;
    readonly timed_out: boolean;
    readonly frozen: boolean;
}

export interface NativeCircuitBreaker {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
    threshold: number;
    opened_at?: string;
    last_error_code?: string;
}

export type NativeCircuitState = 'closed' | 'open' | 'fenced';

export interface NativeStrictCircuitBreaker {
    readonly schema: 'cstar.native_circuit_breaker.v1';
    readonly state: NativeCircuitState;
    readonly failure_count: number;
    readonly threshold: number;
    readonly fenced: boolean;
    readonly last_error_code: string | null;
}

export interface NativeTerminationBarrier {
    readonly active: boolean;
    readonly goal_generation: number;
    readonly terminal_kind: NativeTaskControlTerminalEventKind | null;
    readonly terminal_event_sha256: NativeSha256 | null;
}

export interface NativeReplacementCount {
    readonly role_slot_id: string;
    readonly count: number;
}

export type NativeOccupantOutcome =
    | 'RUNNING'
    | 'COMPLETE'
    | 'FAILED'
    | 'BLOCKED'
    | 'CANCELLED'
    | 'REVOKED'
    | 'UNKNOWN';

export interface NativeKnownOccupantOutcome {
    readonly role_slot_id: string;
    readonly occupant_id: string;
    readonly task_id: string;
    readonly outcome: NativeOccupantOutcome;
}

export type NativeTaskControlCapability =
    | {
        readonly available: true;
        readonly capability_id: string;
        readonly surface: 'native';
    }
    | {
        readonly available: false;
        readonly error_code: 'CORVUS_NATIVE_TASK_SURFACE_UNAVAILABLE';
        readonly reason: string;
    };

export interface NativeTransitionContext {
    readonly schema: 'cstar.native_transition_context.v1';
    readonly manifest: NativeRoleManifestV1;
    readonly role_manifest_sha256: NativeSha256;
    readonly policy: NativeTaskControlPolicy;
    readonly effective_policy_sha256: NativeSha256;
    readonly authority: NativeTaskControlAuthorityBinding;
    readonly active_controller_lease: NativeActiveControllerLease;
    readonly expected_holder: string;
    readonly declared_logical_item_id: string;
    readonly declared_role: string;
    readonly declared_task_kind: string;
    readonly declared_effect: string;
    readonly work_package_sha256: NativeSha256;
    readonly cohort_wait_budget: NativeCohortWaitBudget;
    readonly succession_budget: number;
    readonly per_slot_replacement_budget: number;
    readonly native_capability: NativeTaskControlCapability;
}

export type NativeStrictTransitionContext = NativeTransitionContext;

export interface NativeTransferCheckpoint {
    readonly checkpoint_id: string;
    readonly checkpoint_sha256: NativeSha256;
    readonly controller_generation: number;
    readonly occupant_generation: number;
    readonly event_sha256: NativeSha256;
}

export interface NativeHostTaskIdentity {
    readonly host_task_id: string;
    readonly host_task_path: string;
}

export interface NativeHostSpawnEvidence {
    readonly spawned: boolean;
    readonly evidence: readonly string[];
}

export interface NativeChangedPathInventory {
    readonly path: string;
    readonly bytes_before: number;
    readonly bytes_after: number;
    readonly lines_before: number;
    readonly lines_after: number;
    readonly sha256_before: NativeSha256;
    readonly sha256_after: NativeSha256;
}

export interface NativeScopeViolation {
    readonly path: string;
    readonly reason: string;
}

export interface NativeCheckEvidence {
    readonly command: string;
    readonly test: string;
    readonly exit_code: number;
    readonly stdout: string;
    readonly stderr: string;
}

export interface NativeLeaseMeasurements {
    readonly lease_id: string;
    readonly started_at: string;
    readonly ended_at: string;
    readonly elapsed_ms: number;
}

export interface NativeEffectCounter {
    readonly attempted: number;
    readonly completed: number;
}

export interface NativeSpendEffect {
    readonly units: number;
    readonly currency: string;
}

export interface NativeWorkTerminalReceiptV1 extends NativeTaskControlAuthorityBinding {
    readonly schema: 'cstar.native_work_terminal_receipt.v1';
    readonly receipt_sha256: NativeSha256;
    readonly package_id: string;
    readonly host_task_identity: NativeHostTaskIdentity;
    readonly host_task_path: string;
    readonly spawn_evidence: NativeHostSpawnEvidence;
    readonly selector_enforcement: NativeSelectorEnforcement;
    readonly start_source_sha256: NativeSha256;
    readonly end_source_sha256: NativeSha256;
    readonly start_tree_sha256: NativeSha256;
    readonly end_tree_sha256: NativeSha256;
    readonly start_status_sha256: NativeSha256;
    readonly end_status_sha256: NativeSha256;
    readonly changed_paths: readonly NativeChangedPathInventory[];
    readonly scope_violations: readonly NativeScopeViolation[];
    readonly checks: readonly NativeCheckEvidence[];
    readonly started_at: string;
    readonly ended_at: string;
    readonly elapsed_ms: number;
    readonly lease_measurements: NativeLeaseMeasurements;
    readonly attempt: number;
    readonly retry_count: number;
    readonly replay_count: number;
    readonly replacement_count: number;
    readonly fallback_count: number;
    readonly descendant_count: number;
    readonly peer_message_count: number;
    readonly network_effects: NativeEffectCounter;
    readonly provider_effects: NativeEffectCounter;
    readonly spend_effects: NativeSpendEffect;
    readonly protected_effects: NativeEffectCounter;
    readonly status: NativeTerminalStatus;
    readonly terminal_outcome: NativeTaskControlTerminalOutcome;
    readonly stable_reason: string;
    readonly prior_transfer_checkpoint: NativeTransferCheckpoint;
    readonly resulting_transfer_checkpoint: NativeTransferCheckpoint;
}

export type NativeStrictWorkTerminalReceipt = NativeWorkTerminalReceiptV1;

export interface NativeWorkTerminalReceipt {
    status: 'DELIVERED_UNVERIFIED' | 'BLOCKED';
    bead_id: string;
    set_id: string;
    changed_paths: string[];
    sha256_by_path: { [path: string]: string };
    checks: { [name: string]: JsonValue };
    telemetry: JsonValue;
    protected_effect_counters: { [name: string]: number };
}

export interface NativeTaskControlInterpretationState {
    readonly schema: 'cstar.native_task_control_state.v1';
    readonly authority: NativeTaskControlAuthorityBinding;
    readonly generation: NativeGoalGeneration;
    readonly policy: NativeTaskControlPolicy;
    readonly manifest: NativeRoleManifestV1;
    readonly event_ledger: readonly NativeEventHashLedgerEntry[];
    readonly termination_barrier: NativeTerminationBarrier;
    readonly cancel_call_count: number;
    readonly completed_logical_item_ids: readonly string[];
    readonly prepared_succession_binding: NativePreparedSuccessionBinding | null;
    readonly consumed_succession_count: number;
    readonly cohort_wait: NativeCohortWaitState;
    readonly replacement_counts: readonly NativeReplacementCount[];
    readonly known_occupant_outcomes: readonly NativeKnownOccupantOutcome[];
    readonly circuit_breaker: NativeStrictCircuitBreaker;
    readonly terminal_receipt?: NativeWorkTerminalReceiptV1;
}

export type NativeTaskControlStateV1 = NativeTaskControlInterpretationState;

export interface NativeTaskControlState {
    schema: 'cstar.native_task_control_state.v1';
    generation: NativeGoalGeneration;
    policy: NativeTaskControlPolicy;
    events: NativeTaskControlEvent[];
    controller_lease?: NativeControllerLease;
    circuit_breaker?: NativeCircuitBreaker;
    terminal_receipt?: NativeWorkTerminalReceipt;
}

export interface NativeTransitionResult {
    ok: boolean;
    state: NativeTaskControlState;
    event?: NativeTaskControlEvent;
    error_code?: string;
}

export interface NativeTransitionResultV1 {
    readonly ok: boolean;
    readonly state: NativeTaskControlInterpretationState;
    readonly event: NativeTaskControlEventV1 | null;
    readonly error_code: string | null;
}
