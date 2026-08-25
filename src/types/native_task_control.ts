/**
 * Pure native task-control contracts.
 *
 * These types deliberately contain observations and authority-bearing identity
 * separately.  The interpreter never obtains values from a host or provider;
 * callers must provide an already-bound packet and events.
 */

export const NATIVE_TASK_CONTROL_SCHEMAS = {
    roleManifest: 'cstar.native_role_manifest.v1',
    goalGeneration: 'cstar.native_goal_generation.v1',
    controllerLease: 'cstar.native_controller_lease.v1',
    event: 'cstar.native_task_control_event.v1',
    succession: 'cstar.native_succession_receipt.v1',
    cohortWait: 'cstar.native_cohort_wait.v1',
    circuitBreaker: 'cstar.native_circuit_breaker.v1',
    terminalReceipt: 'cstar.native_work_terminal_receipt.v1',
} as const;

export type NativeTaskControlSchema =
    (typeof NATIVE_TASK_CONTROL_SCHEMAS)[keyof typeof NATIVE_TASK_CONTROL_SCHEMAS];

export type NativeTaskControlRole =
    | 'controller'
    | 'worker'
    | 'researcher'
    | 'auditor'
    | 'implementation'
    | 'focused_test'
    | 'independent_validator'
    | 'supervisory_root';

export type NativeTaskStatus =
    | 'PENDING'
    | 'STARTED'
    | 'PROGRESSING'
    | 'COMPLETE'
    | 'FAILED'
    | 'BLOCKED'
    | 'CANCELLED'
    | 'REVOKED'
    | 'UNKNOWN';

export type NativeControlStatus = 'OPEN' | 'FENCED' | 'TERMINAL';
export type NativeBreakerState = 'CLOSED' | 'OPEN';
export type NativeLeaseStatus = 'ACTIVE' | 'RETIRED' | 'FENCED';

export type NativeTaskEventKind =
    | 'START'
    | 'PROGRESS'
    | 'COMPLETE'
    | 'FAIL'
    | 'BLOCK'
    | 'CANCEL'
    | 'REVOKE'
    | 'CANCEL_ACK'
    | 'REVOKED'
    | 'UNKNOWN'
    | 'SUCCESSION_PREPARE'
    | 'SUCCESSION_COMMIT'
    | 'REPLACEMENT'
    | 'COHORT_WAIT'
    | 'TIMEOUT'
    | 'RETRY'
    | 'REPLAY'
    | 'AUTO_CONTINUATION'
    | 'FORGE_INVOCATION';

export type NativeTerminalEventKind = 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN';

export interface NativeIdentityBinding {
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    partition: string;
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
    work_package_sha256: string;
    role_manifest_sha256: string;
    effective_policy_sha256: string;
    previous_event_sha256: string | null;
}

export interface NativeEffectPermissions {
    [effect: string]: boolean;
}

export interface NativePolicy {
    schema?: 'cstar.native_policy.v1';
    policy_id: string;
    depth: number;
    budgets: Record<string, number>;
    maxima: Record<string, number>;
    allowlists: Record<string, string[]>;
    prohibitions: string[];
    requirements: string[];
    effect_permissions: NativeEffectPermissions;
}

export interface NativeRoleSlot {
    role_slot_id: string;
    role: NativeTaskControlRole;
    persistent: boolean;
    owner: 'sol' | 'luna';
    allowed_task_kinds: string[];
    replacement_budget: number;
    policy: NativePolicy;
}

export interface NativeRoleManifest {
    schema: 'cstar.native_role_manifest.v1';
    manifest_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    slots: NativeRoleSlot[];
    max_persistent_role_slots: number;
    max_total_role_slots: number;
    manifest_sha256?: string;
}

export interface NativeGoalGeneration {
    schema: 'cstar.native_goal_generation.v1';
    goal_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    partition: string;
    generation: number;
    goal_sha256: string;
    work_package_sha256: string;
    role_manifest_sha256: string;
    effective_policy_sha256: string;
    previous_goal_sha256: string | null;
}

export interface NativeControllerLease {
    schema: 'cstar.native_controller_lease.v1';
    lease_id: string;
    root_id: string;
    goal_id: string;
    goal_generation: number;
    controller_generation: number;
    role_slot_id: string;
    occupant_id: string;
    occupant_generation: number;
    status: NativeLeaseStatus;
    lease_sha256?: string;
    previous_lease_sha256: string | null;
}

export interface NativeTaskControlEvent {
    schema: 'cstar.native_task_control_event.v1';
    event_id: string;
    event_kind: NativeTaskEventKind;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    partition: string;
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
    role_slot_id: string;
    occupant_id: string;
    task_logical_id?: string;
    task_kind?: string;
    event_sequence: number;
    previous_event_sha256: string | null;
    payload?: Record<string, unknown>;
    event_sha256?: string;
}

export interface NativeSuccessionReceipt {
    schema: 'cstar.native_succession_receipt.v1';
    succession_id: string;
    root_id: string;
    goal_id: string;
    goal_generation: number;
    old_controller_generation: number;
    old_occupant_generation: number;
    new_controller_generation: number;
    new_occupant_generation: number;
    old_lease_sha256: string;
    successor_role_slot_id: string;
    successor_occupant_id: string;
    active_task_ids: string[];
    prepare_event_sha256: string;
    commit_event_sha256: string;
    status: 'PREPARED' | 'COMMITTED' | 'FENCED';
}

export interface NativeCohortWait {
    schema: 'cstar.native_cohort_wait.v1';
    cohort_id: string;
    root_id: string;
    goal_generation: number;
    task_ids: string[];
    timeout_seconds: number;
    wait_count: number;
    status: 'PENDING' | 'COMPLETED' | 'TIMEOUT' | 'FROZEN';
    wait_event_sha256: string;
    terminal_event_sha256: string | null;
}

export interface NativeCircuitBreaker {
    schema: 'cstar.native_circuit_breaker.v1';
    scope_id: string;
    state: NativeBreakerState;
    reason_code: string | null;
    opened_event_sha256: string | null;
    threshold: 1;
}

export interface NativeWorkTerminalReceipt {
    schema: 'cstar.native_work_terminal_receipt.v1';
    receipt_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    goal_generation: number;
    controller_generation: number;
    occupant_generation: number;
    terminal_kind: 'COMPLETE' | 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN' | 'TIMEOUT' | 'FENCED';
    terminal_event_sha256: string;
    breaker: NativeCircuitBreaker;
    protected_effects_fenced: boolean;
    accepted: boolean;
}

export interface NativeTaskState {
    task_logical_id: string;
    task_kind: string;
    role_slot_id: string;
    occupant_id: string;
    status: NativeTaskStatus;
    start_event_sha256: string | null;
    last_event_sha256: string | null;
    terminal_event_sha256: string | null;
    replacement_count: number;
}

export interface NativeTerminationBarrier {
    active: boolean;
    requested_kind: 'CANCEL' | 'REVOKE' | null;
    terminal_kind: NativeTerminalEventKind | null;
    terminal_event_sha256: string | null;
    native_cancel_calls: number;
}

export interface NativeSuccessionPending {
    prepare_event_sha256: string;
    active_task_ids: string[];
    last_event_sha256: string | null;
}

export interface NativeTaskControlState {
    schema: 'cstar.native_task_control_state.v1';
    identity: NativeIdentityBinding;
    goal: NativeGoalGeneration;
    manifest: NativeRoleManifest;
    policy: NativePolicy;
    effective_policy: NativePolicy;
    lease: NativeControllerLease;
    status: NativeControlStatus;
    tasks: Record<string, NativeTaskState>;
    event_log: string[];
    event_ids: Record<string, string>;
    last_event_sha256: string | null;
    termination: NativeTerminationBarrier;
    succession: NativeSuccessionPending | null;
    cohort_wait: NativeCohortWait | null;
    breaker: NativeCircuitBreaker;
    replacement_counts: Record<string, number>;
    protected_effects_fenced: boolean;
}

export interface NativeTaskControlTransition {
    accepted: boolean;
    idempotent: boolean;
    state: NativeTaskControlState;
    event_sha256: string;
    terminal_receipt?: NativeWorkTerminalReceipt;
    error_code?: string;
}

export interface NativeStateMachineInput {
    identity: Omit<NativeIdentityBinding, 'role_manifest_sha256' | 'effective_policy_sha256' | 'previous_event_sha256'>;
    goal: NativeGoalGeneration;
    manifest: NativeRoleManifest;
    policy: NativePolicy;
    lease: NativeControllerLease;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSha256(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
