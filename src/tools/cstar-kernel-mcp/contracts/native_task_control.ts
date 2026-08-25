import {
    NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS as SOURCE_MAX_PERSISTENT_ROLE_SLOTS,
    NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS as SOURCE_MAX_TOTAL_ROLE_SLOTS,
    NATIVE_ROLE_MANIFEST_SCHEMA as SOURCE_ROLE_MANIFEST_SCHEMA,
    NATIVE_UNREPORTED_IDENTITY as SOURCE_UNREPORTED_IDENTITY,
    NATIVE_TASK_CONTROL_EVENT_TYPES as SOURCE_EVENT_TYPES,
    NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES as SOURCE_TERMINAL_OUTCOMES,
    NATIVE_TASK_CONTROL_TRANSFER_READINESS as SOURCE_TRANSFER_READINESS,
} from '../../../types/native_task_control.js';
import type {
    NativeAuthorityBinding as SourceNativeAuthorityBinding,
    NativeCapabilityProfile,
    NativeCapabilitySurfaceStatus,
    NativeCircuitBreaker as SourceNativeCircuitBreaker,
    NativeControllerLease as SourceNativeControllerLease,
    NativeCohortWait as SourceNativeCohortWait,
    NativeGoalGeneration as SourceNativeGoalGeneration,
    NativeRoleManifest as SourceNativeRoleManifest,
    NativeRoleSlot as SourceNativeRoleSlot,
    NativeSelectorEnforcement,
    NativeSuccessionReceipt as SourceNativeSuccessionReceipt,
    NativeTaskControlAllowlists,
    NativeTaskControlBudgets,
    NativeTaskControlEffectPermissions,
    NativeTaskControlEvent as SourceNativeTaskControlEvent,
    NativeTaskControlEventType,
    NativeTaskControlMaxima,
    NativeTaskControlPolicy as SourceNativeTaskControlPolicy,
    NativeTaskControlState as SourceNativeTaskControlState,
    NativeTaskControlTerminalOutcome,
    NativeTransitionContext as SourceNativeTransitionContext,
    NativeTransitionResult as SourceNativeTransitionResult,
    NativeTransferReadiness,
    NativeWorkTerminalReceipt as SourceNativeWorkTerminalReceipt,
} from '../../../types/native_task_control.js';
import {
    NativeTaskControlError,
    failNativeTaskControl,
    NATIVE_TASK_CONTROL_ERROR_CODES as SOURCE_ERROR_CODES,
} from '../../../core/native_task_control/errors.js';
import type { NativeTaskControlErrorCode as SourceNativeTaskControlErrorCode } from '../../../core/native_task_control/errors.js';

export const NATIVE_TASK_CONTROL_CONTRACT_SCHEMA = 'cstar.native_task_control_contract.v1' as const;
export const NATIVE_UNREPORTED_IDENTITY = SOURCE_UNREPORTED_IDENTITY;
export const NATIVE_POLICY_SCHEMA: SourceNativeTaskControlPolicy['schema'] = 'cstar.native_policy.v1';
export const NATIVE_ROLE_MANIFEST_SCHEMA = SOURCE_ROLE_MANIFEST_SCHEMA;
export const NATIVE_GOAL_GENERATION_SCHEMA = 'cstar.native_goal_generation.v1' as const;
export const NATIVE_CONTROLLER_LEASE_SCHEMA = 'cstar.native_controller_lease.v1' as const;
export const NATIVE_TASK_CONTROL_EVENT_SCHEMA = 'cstar.native_task_control_event.v1' as const;
export const NATIVE_SUCCESSION_RECEIPT_SCHEMA = 'cstar.native_succession_receipt.v1' as const;
export const NATIVE_COHORT_WAIT_SCHEMA = 'cstar.native_cohort_wait.v1' as const;
export const NATIVE_CIRCUIT_BREAKER_SCHEMA = 'cstar.native_circuit_breaker.v1' as const;
export const NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA: SourceNativeWorkTerminalReceipt['schema'] =
    'cstar.native_work_terminal_receipt.v1';
export const NATIVE_TASK_CONTROL_STATE_SCHEMA: SourceNativeTaskControlState['schema'] =
    'cstar.native_task_control_state.v1';
export const NATIVE_TRANSITION_RESULT_SCHEMA = 'cstar.native_transition_result.v1' as const;

export const NATIVE_TASK_CONTROL_SCHEMAS = Object.freeze({
    contract: NATIVE_TASK_CONTROL_CONTRACT_SCHEMA,
    policy: NATIVE_POLICY_SCHEMA,
    role_manifest: NATIVE_ROLE_MANIFEST_SCHEMA,
    generation: NATIVE_GOAL_GENERATION_SCHEMA,
    controller_lease: NATIVE_CONTROLLER_LEASE_SCHEMA,
    event: NATIVE_TASK_CONTROL_EVENT_SCHEMA,
    succession_receipt: NATIVE_SUCCESSION_RECEIPT_SCHEMA,
    cohort_wait: NATIVE_COHORT_WAIT_SCHEMA,
    circuit_breaker: NATIVE_CIRCUIT_BREAKER_SCHEMA,
    terminal_receipt: NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA,
    state: NATIVE_TASK_CONTROL_STATE_SCHEMA,
    transition_result: NATIVE_TRANSITION_RESULT_SCHEMA,
} as const);

export const NATIVE_TASK_CONTROL_MAX_POLICY_DEPTH = 8 as const;
export const NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS = SOURCE_MAX_PERSISTENT_ROLE_SLOTS;
export const NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS = SOURCE_MAX_TOTAL_ROLE_SLOTS;
export const NATIVE_TASK_CONTROL_MAX_SUCCESSION_PER_GOAL_GENERATION = 1 as const;
export const NATIVE_TASK_CONTROL_MAX_REPLACEMENT_PER_SLOT_GENERATION = 1 as const;
export const NATIVE_TASK_CONTROL_MAX_COHORT_WAITS_PER_COHORT = 1 as const;
export const NATIVE_TASK_CONTROL_MAX_CANCEL_CALLS = 1 as const;
export const NATIVE_ROLE_MANIFEST_LIMITS = Object.freeze({
    max_persistent_role_slots: NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS,
    max_total_role_slots: NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS,
});
export const NATIVE_TASK_CONTROL_CEILINGS = Object.freeze({
    policy_depth: NATIVE_TASK_CONTROL_MAX_POLICY_DEPTH,
    persistent_role_slots: NATIVE_ROLE_MANIFEST_MAX_PERSISTENT_ROLE_SLOTS,
    total_role_slots: NATIVE_ROLE_MANIFEST_MAX_TOTAL_ROLE_SLOTS,
    succession_per_goal_generation: NATIVE_TASK_CONTROL_MAX_SUCCESSION_PER_GOAL_GENERATION,
    replacement_per_slot_generation: NATIVE_TASK_CONTROL_MAX_REPLACEMENT_PER_SLOT_GENERATION,
    cohort_waits_per_cohort: NATIVE_TASK_CONTROL_MAX_COHORT_WAITS_PER_COHORT,
    cancel_calls: NATIVE_TASK_CONTROL_MAX_CANCEL_CALLS,
} as const);

export const NATIVE_TASK_CONTROL_EVENT_TYPES = Object.freeze([...SOURCE_EVENT_TYPES]) as typeof SOURCE_EVENT_TYPES;
export const NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES = Object.freeze([...SOURCE_TERMINAL_OUTCOMES]) as
    typeof SOURCE_TERMINAL_OUTCOMES;
export const NATIVE_TASK_CONTROL_TRANSFER_READINESS = Object.freeze([...SOURCE_TRANSFER_READINESS]) as
    typeof SOURCE_TRANSFER_READINESS;

export type NativeCapabilityName = Exclude<keyof NativeCapabilityProfile, 'schema' | 'fallback'>;
export const NATIVE_TASK_CONTROL_CAPABILITY_NAMES = Object.freeze([
    'create',
    'list',
    'read',
    'send',
    'wait',
    'cancel',
    'terminal',
    'native_create',
    'native_list',
    'native_read',
    'native_send',
    'native_wait',
    'native_cancel',
    'native_terminal',
] as const satisfies readonly NativeCapabilityName[]);
type CapabilityNamesAreComplete = Exclude<
    NativeCapabilityName,
    typeof NATIVE_TASK_CONTROL_CAPABILITY_NAMES[number]
> extends never ? true : false;
const CAPABILITY_NAMES_ARE_COMPLETE: CapabilityNamesAreComplete = true;
export const NATIVE_TASK_CONTROL_CAPABILITY_STATUSES = Object.freeze([
    'available',
    'absent',
    'unavailable',
] as const satisfies readonly NativeCapabilitySurfaceStatus[]);
type CapabilityStatusesAreComplete = Exclude<
    NativeCapabilitySurfaceStatus,
    typeof NATIVE_TASK_CONTROL_CAPABILITY_STATUSES[number]
> extends never ? true : false;
const CAPABILITY_STATUSES_ARE_COMPLETE: CapabilityStatusesAreComplete = true;
export const NATIVE_CAPABILITY_NAMES = NATIVE_TASK_CONTROL_CAPABILITY_NAMES;
export const NATIVE_CAPABILITY_STATUSES = NATIVE_TASK_CONTROL_CAPABILITY_STATUSES;
export const NATIVE_CAPABILITY_SURFACE_NAMES = NATIVE_TASK_CONTROL_CAPABILITY_NAMES;
export const NATIVE_CAPABILITY_SURFACE_STATUSES = NATIVE_TASK_CONTROL_CAPABILITY_STATUSES;

export const NATIVE_TASK_CONTROL_ERROR_CODES = Object.freeze({ ...SOURCE_ERROR_CODES });
export const NATIVE_TASK_CONTROL_ERROR_CODE_VALUES = Object.freeze(
    Object.values(NATIVE_TASK_CONTROL_ERROR_CODES),
) as readonly SourceNativeTaskControlErrorCode[];
export const NATIVE_ERROR_CODE_VALUES = NATIVE_TASK_CONTROL_ERROR_CODE_VALUES;

export type {
    JsonPrimitive,
    JsonRecord,
    JsonValue,
    NativeActualIdentity,
    NativeAcceptedTaskControlEvent,
    NativeCapabilitySurface,
    NativeCapabilitySurfaceStatus,
    NativeChangedPathInventory,
    NativeCohortRecord,
    NativeCohortRecordKind,
    NativeCohortWaitBudget,
    NativeCommandResult,
    NativeEffectObservation,
    NativeLeaseMeasurement,
    NativeOccupantOutcome,
    NativePreparedSuccessionRecord,
    NativeProtectedEffectObservation,
    NativeReplacementBudget,
    NativeReplacementCount,
    NativeSelectorEnforcement,
    NativeTaskControlAllowlists,
    NativeTaskControlBudgets,
    NativeTaskControlEffectPermissions,
    NativeTaskControlEventType,
    NativeTaskControlMaxima,
    NativeTaskControlPolicy,
    NativeTaskControlTerminalOutcome,
    NativeTaskControlTransferReadiness,
    NativeTestCounts,
    NativeTransferCheckpoint,
    NativeTransferReadiness,
    NativeWaitBudget,
    NativeWorkTerminalOutcome,
} from '../../../types/native_task_control.js';
export type { NativeTaskControlErrorCode } from '../../../core/native_task_control/errors.js';
export { NativeTaskControlError, failNativeTaskControl };

export type NativeAuthorityBinding = Readonly<SourceNativeAuthorityBinding>;
export type NativeTransitionContext = Readonly<SourceNativeTransitionContext>;
export type NativeTaskControlState = Readonly<SourceNativeTaskControlState>;
export type NativeWorkTerminalReceipt = Readonly<SourceNativeWorkTerminalReceipt>;
export type NativeTransitionResult = Readonly<SourceNativeTransitionResult>;
export type NativeGoalGeneration = Readonly<SourceNativeGoalGeneration>;
export type NativeControllerLease = Readonly<SourceNativeControllerLease>;
export type NativeTaskControlEvent = Readonly<SourceNativeTaskControlEvent>;
export type NativeSuccessionReceipt = Readonly<SourceNativeSuccessionReceipt>;
export type NativeCohortWait = Readonly<SourceNativeCohortWait>;
export type NativeCircuitBreaker = Readonly<SourceNativeCircuitBreaker>;
export type NativeRoleManifest = Readonly<SourceNativeRoleManifest>;
export type NativeRoleSlot = Readonly<SourceNativeRoleSlot>;

export const NATIVE_TASK_CONTROL_CONTRACT = Object.freeze({
    schema: NATIVE_TASK_CONTROL_SCHEMAS.contract,
    contract_id: 'cstar-native-task-control-neutral-v1',
    mode: 'neutral_native_task_control',
    forge_status: 'TOMBSTONED_PERMANENT',
    forge: Object.freeze({
        status: 'TOMBSTONED_PERMANENT',
        execution: null,
        fallback: null,
        adapter: null,
        lifecycle: null,
        validation: null,
    }),
    active_routes: Object.freeze([] as const),
    active_functions: Object.freeze([] as const),
} as const);
