/**
 * JSON and state shapes shared by the native task-control foundation.
 *
 * These are deliberately data-only types.  The native surface does not carry
 * provider, Forge, lifecycle, or callback functions in its contract.
 */

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
    readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface NativeTaskControlBudgets {
    readonly model_requests?: number;
    readonly tool_calls?: number;
    readonly uncached_input_tokens?: number;
    readonly output_plus_reasoning_tokens?: number;
    readonly wall_time_seconds?: number;
    readonly [metric: string]: number | undefined;
}

export interface NativeTaskControlMaxima {
    readonly descendants?: number;
    readonly waits?: number;
    readonly retries?: number;
    readonly replays?: number;
    readonly fallbacks?: number;
    readonly [maximum: string]: number | undefined;
}

export interface NativeTaskControlAllowlists {
    readonly task_kinds?: readonly string[];
    readonly effects?: readonly string[];
    readonly [allowlist: string]: readonly string[] | undefined;
}

export interface NativeTaskControlEffectPermissions {
    readonly read_bound_context?: boolean;
    readonly write_allowlisted_source?: boolean;
    readonly run_bound_checks?: boolean;
    readonly protected_effect?: boolean;
    readonly [effect: string]: boolean | undefined;
}

export interface NativeTaskControlPolicy {
    readonly schema: string;
    readonly policy_id: string;
    readonly depth: number;
    readonly budgets?: NativeTaskControlBudgets;
    readonly maxima?: NativeTaskControlMaxima;
    readonly allowlists?: NativeTaskControlAllowlists;
    readonly prohibitions?: readonly string[];
    readonly requirements?: readonly string[];
    readonly effect_permissions?: NativeTaskControlEffectPermissions;
}

export interface NativeRoleSlot {
    readonly role_slot_id: string;
    readonly role: string;
    readonly persistent: boolean;
    readonly requested_model: string;
    readonly requested_reasoning: string;
    readonly actual_identity: string;
    readonly descendants_max: number;
}

export interface NativeRoleManifest {
    readonly schema: string;
    readonly manifest_id: string;
    readonly root_id: string;
    readonly bead_id: string;
    readonly set_id: string;
    readonly phase_id: string;
    readonly max_persistent_role_slots: number;
    readonly max_total_role_slots: number;
    readonly slots: readonly NativeRoleSlot[];
}

export interface NativeGoalGeneration {
    readonly goal_id?: string;
    readonly generation?: number;
    readonly goal_generation?: number;
    readonly parent_generation?: number;
}

export interface NativeControllerLease {
    readonly lease_id?: string;
    readonly controller_id?: string;
    readonly controller_generation?: number;
    readonly issued_at?: string;
    readonly expires_at?: string;
}

export interface NativeTaskControlEvent {
    readonly event_id?: string;
    readonly event_type?: string;
    readonly occurred_at?: string;
    readonly goal_generation?: number;
    readonly controller_generation?: number;
    readonly payload?: JsonValue;
}

export interface NativeSuccessionReceipt {
    readonly receipt_id?: string;
    readonly predecessor_controller_id?: string;
    readonly successor_controller_id?: string;
    readonly predecessor_generation?: number;
    readonly successor_generation?: number;
    readonly accepted_at?: string;
}

export interface NativeCohortWait {
    readonly wait_id?: string;
    readonly cohort_id?: string;
    readonly expected_members?: number;
    readonly arrived_members?: number;
    readonly deadline_at?: string;
}

export interface NativeCircuitBreaker {
    readonly state: string;
    readonly failure_count?: number;
    readonly opened_at?: string;
    readonly reset_after_ms?: number;
}

export interface NativeWorkTerminalReceipt {
    readonly receipt_id?: string;
    readonly status?: string;
    readonly bead_id?: string;
    readonly set_id?: string;
    readonly changed_paths?: readonly string[];
    readonly checks?: readonly string[];
}

export interface NativeTaskControlState {
    readonly goal?: NativeGoalGeneration;
    readonly controller?: NativeControllerLease;
    readonly policy?: NativeTaskControlPolicy;
    readonly events?: readonly NativeTaskControlEvent[];
    readonly succession?: NativeSuccessionReceipt;
    readonly cohort_wait?: NativeCohortWait;
    readonly circuit_breaker?: NativeCircuitBreaker;
    readonly terminal?: NativeWorkTerminalReceipt;
}

export interface NativeTransitionResult {
    readonly ok: boolean;
    readonly state?: NativeTaskControlState;
    readonly event?: NativeTaskControlEvent;
    readonly error_code?: string;
}
