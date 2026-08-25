export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};

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
    event_type: string;
    occurred_at: string;
    generation?: NativeGoalGeneration;
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

export interface NativeCircuitBreaker {
    state: 'closed' | 'open' | 'half_open';
    failure_count: number;
    threshold: number;
    opened_at?: string;
    last_error_code?: string;
}

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
