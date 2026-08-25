/**
 * Neutral, serializable native task-control contracts.
 *
 * These types describe authority and observations only.  They do not launch,
 * cancel, poll, retry, replay, or substitute a provider or Forge route.
 */

export const NATIVE_ROLE_MANIFEST_SCHEMA = 'cstar.native_role_manifest.v1' as const;
export const NATIVE_GOAL_GENERATION_SCHEMA = 'cstar.native_goal_generation.v1' as const;
export const NATIVE_CONTROLLER_LEASE_SCHEMA = 'cstar.native_controller_lease.v1' as const;
export const NATIVE_TASK_CONTROL_EVENT_SCHEMA = 'cstar.native_task_control_event.v1' as const;
export const NATIVE_SUCCESSION_RECEIPT_SCHEMA = 'cstar.native_succession_receipt.v1' as const;
export const NATIVE_COHORT_WAIT_SCHEMA = 'cstar.native_cohort_wait.v1' as const;
export const NATIVE_CIRCUIT_BREAKER_SCHEMA = 'cstar.native_circuit_breaker.v1' as const;
export const NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA = 'cstar.native_work_terminal_receipt.v1' as const;
export const NATIVE_COMPACT_WORK_PACKET_SCHEMA = 'corvus.compact_work_packet.v1' as const;
export const NATIVE_TASK_CONTROL_SCHEMA = 'cstar.native_task_control.v1' as const;

export const FORGE_ROUTE_STATE = 'TOMBSTONED_PERMANENT' as const;
export type ForgeRouteState = typeof FORGE_ROUTE_STATE;

export const NATIVE_TASK_EVENT_KINDS = [
    'START',
    'PROGRESS',
    'COMPLETE',
    'FAILED',
    'CANCEL_REQUEST',
    'CANCEL_ACK',
    'REVOKED',
    'UNKNOWN',
    'TIMEOUT',
    'SUCCESSION_PREPARE',
    'SUCCESSION_COMMIT',
] as const;
export type NativeTaskEventKind = typeof NATIVE_TASK_EVENT_KINDS[number];

export const NATIVE_TERMINAL_EVENT_KINDS = [
    'COMPLETE',
    'FAILED',
    'CANCEL_ACK',
    'REVOKED',
    'UNKNOWN',
    'TIMEOUT',
] as const;
export type NativeTerminalEventKind = typeof NATIVE_TERMINAL_EVENT_KINDS[number];

export const NATIVE_COHORT_WAIT_STATES = ['PENDING', 'COMPLETE', 'TIMEOUT', 'FENCED'] as const;
export type NativeCohortWaitState = typeof NATIVE_COHORT_WAIT_STATES[number];

export const NATIVE_CIRCUIT_BREAKER_STATES = ['CLOSED', 'OPEN'] as const;
export type NativeCircuitBreakerState = typeof NATIVE_CIRCUIT_BREAKER_STATES[number];

export const NATIVE_WORK_TERMINAL_STATES = [
    'DELIVERED_UNVERIFIED',
    'TRANSFER_READY',
    'TRANSFER_READY_WITH_GAP',
    'TRANSFER_NOT_READY',
    'BLOCKED',
] as const;
export type NativeWorkTerminalState = typeof NATIVE_WORK_TERMINAL_STATES[number];

export type Sha256 = string;

export interface NativeTaskIdentity {
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    task_logical_id: string;
    partition_id: string;
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
    work_package_sha256: Sha256;
    role_manifest_sha256: Sha256;
    effective_policy_sha256: Sha256;
    previous_event_sha256: Sha256 | null;
}

export interface NativeTaskControlBudget {
    max_model_requests?: number;
    max_tool_calls?: number;
    max_native_waits?: number;
    max_retries?: number;
    max_replays?: number;
    max_fallbacks?: number;
    max_uncached_input_tokens?: number;
    max_output_plus_reasoning_tokens?: number;
    max_wall_time_seconds?: number;
    max_descendants?: number;
    max_replacements?: number;
    max_succession?: number;
    max_depth?: number;
}

export interface NativeTaskControlPolicy extends NativeTaskControlBudget {
    /** Compatibility spellings are accepted only at the boundary and normalize to the fields above. */
    max_waits?: number;
    max_retry_count?: number;
    max_replay_count?: number;
    max_fallback_count?: number;
    max_policy_depth?: number;
    allowed_sources?: readonly string[];
    allowed_scopes?: readonly string[];
    allowed_effects?: readonly string[];
    prohibited_effects?: readonly string[];
    required_effects?: readonly string[];
    effect_permissions?: Readonly<Record<string, boolean>>;
    /** Nested forms remain neutral input forms; the policy resolver flattens them. */
    budgets?: Readonly<Partial<NativeTaskControlBudget>>;
    allowlists?: Readonly<{
        sources?: readonly string[];
        scopes?: readonly string[];
        effects?: readonly string[];
    }>;
    prohibitions?: readonly string[];
    requirements?: readonly string[];
    effects?: Readonly<Record<string, boolean>>;
}

export interface NativeRoleSlot {
    role_slot_id: string;
    role: 'controller' | 'worker' | string;
    replacement_allowed?: boolean;
    max_replacements?: number;
}

export interface NativeRoleManifest {
    schema: typeof NATIVE_ROLE_MANIFEST_SCHEMA;
    manifest_id: string;
    root_id: string;
    role_slots: readonly NativeRoleSlot[];
    policy: NativeTaskControlPolicy;
    role_manifest_sha256: Sha256;
}

export interface NativeGoalGeneration extends NativeTaskIdentity {
    schema: typeof NATIVE_GOAL_GENERATION_SCHEMA;
    goal_id: string;
    objective: string;
}

export interface NativeControllerLease extends NativeTaskIdentity {
    schema: typeof NATIVE_CONTROLLER_LEASE_SCHEMA;
    lease_id: string;
    role_slot_id: string;
    controller_id: string;
    acquired_at: number;
    expires_at: number;
}

export interface NativeTaskControlEvent extends NativeTaskIdentity {
    schema: typeof NATIVE_TASK_CONTROL_EVENT_SCHEMA;
    event_id: string;
    event_kind: NativeTaskEventKind;
    role_slot_id: string;
    task_id?: string;
    native_task_id?: string;
    observed_at?: number;
    detail?: string;
}

export interface NativeSuccessionReceipt extends NativeTaskIdentity {
    schema: typeof NATIVE_SUCCESSION_RECEIPT_SCHEMA;
    receipt_id: string;
    phase: 'SUCCESSION_PREPARE' | 'SUCCESSION_COMMIT';
    old_lease_id: string;
    successor_lease_id?: string;
    active_task_ids: readonly string[];
    last_event_sha256: Sha256;
}

export interface NativeCohortWait extends NativeTaskIdentity {
    schema: typeof NATIVE_COHORT_WAIT_SCHEMA;
    wait_id: string;
    task_ids: readonly string[];
    state: NativeCohortWaitState;
    wait_seconds: number;
    event_sha256?: Sha256;
}

export interface NativeCircuitBreaker extends NativeTaskIdentity {
    schema: typeof NATIVE_CIRCUIT_BREAKER_SCHEMA;
    breaker_id: string;
    state: NativeCircuitBreakerState;
    reason?: string;
    opened_by_event_sha256?: Sha256;
}

export interface NativeWorkTerminalReceipt extends NativeTaskIdentity {
    schema: typeof NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA;
    receipt_id: string;
    state: NativeWorkTerminalState;
    terminal_event_kind: NativeTerminalEventKind;
    terminal_event_sha256: Sha256;
    tests_status?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
}

export interface NativeCompactWorkPacket {
    schema: typeof NATIVE_COMPACT_WORK_PACKET_SCHEMA;
    packet_id: string;
    decision_id: string;
    bead_id: string;
    set_id: string;
    root_id: string;
    phase_id: string;
    goal_generation: number;
    controller_generation: number;
    role_manifest_sha256: Sha256;
    effective_policy_sha256: Sha256;
    objective: string;
    read_allowlist: readonly string[];
    write_allowlist: readonly string[];
    checker_commands: readonly string[];
    receipt_path: string;
}

export const NATIVE_TASK_CONTROL_EVENT_KINDS = NATIVE_TASK_EVENT_KINDS;
export const NATIVE_MAX_POLICY_DEPTH = 8;
