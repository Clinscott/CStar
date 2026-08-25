import {
    NATIVE_ROLE_MANIFEST_CEILINGS,
    NATIVE_TASK_CONTROL_EVENT_TYPES,
    NATIVE_TASK_CONTROL_SELECTOR_ENFORCEMENT,
    NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES,
} from '../../../types/native_task_control.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NATIVE_TASK_CONTROL_STABLE_ERROR_CODES,
} from '../../../core/native_task_control/errors.js';

export {
    NATIVE_ROLE_MANIFEST_CEILINGS,
    NATIVE_TASK_CONTROL_EVENT_TYPES,
    NATIVE_TASK_CONTROL_SELECTOR_ENFORCEMENT,
    NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES,
} from '../../../types/native_task_control.js';
export {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NATIVE_TASK_CONTROL_STABLE_ERROR_CODES,
} from '../../../core/native_task_control/errors.js';
export type {
    NativeActualIdentity,
    NativeTaskControlAuthority,
    NativeTaskControlAuthorityBinding,
    NativeTaskControlCapability,
    NativeTaskControlEventType,
    NativeTaskControlInterpretationState,
    NativeTaskControlTerminalEventKind,
    NativeTaskControlTerminalOutcome,
    NativeRoleManifestV1,
    NativeSelectorEnforcement,
    NativeStrictWorkTerminalReceipt,
    NativeTransitionContext,
    NativeWorkTerminalReceiptV1,
} from '../../../types/native_task_control.js';
export type {
    NativeTaskControlErrorCode as NativeContractErrorCode,
    NativeTaskControlStableErrorCode as NativeContractStableErrorCode,
} from '../../../core/native_task_control/errors.js';

export const NATIVE_TASK_CONTROL_SCHEMAS = Object.freeze({
    contract: 'cstar.native_task_control_contract.v1',
    policy: 'cstar.native_policy.v1',
    role_manifest: 'cstar.native_role_manifest.v1',
    generation: 'cstar.native_goal_generation.v1',
    controller_lease: 'cstar.native_controller_lease.v1',
    event: 'cstar.native_task_control_event.v1',
    succession_receipt: 'cstar.native_succession_receipt.v1',
    cohort_wait: 'cstar.native_cohort_wait.v1',
    circuit_breaker: 'cstar.native_circuit_breaker.v1',
    terminal_receipt: 'cstar.native_work_terminal_receipt.v1',
    state: 'cstar.native_task_control_state.v1',
    transition_result: 'cstar.native_transition_result.v1',
    authority_binding: 'cstar.native_authority_binding.v1',
    transition_context: 'cstar.native_transition_context.v1',
    event_ledger: 'cstar.native_event_hash_ledger.v1',
    terminal_outcome: 'cstar.native_terminal_outcome.v1',
} as const);

export const NATIVE_TASK_CONTROL_CONTRACT = Object.freeze({
    schema: NATIVE_TASK_CONTROL_SCHEMAS.contract,
    contract_id: 'cstar-native-task-control-neutral-v1',
    mode: 'neutral_native_task_control',
    event_types: NATIVE_TASK_CONTROL_EVENT_TYPES,
    terminal_outcomes: NATIVE_TASK_CONTROL_TERMINAL_OUTCOMES,
    selector_enforcement: NATIVE_TASK_CONTROL_SELECTOR_ENFORCEMENT,
    role_manifest_ceilings: NATIVE_ROLE_MANIFEST_CEILINGS,
    error_codes: NATIVE_TASK_CONTROL_ERROR_CODES,
    stable_error_codes: NATIVE_TASK_CONTROL_STABLE_ERROR_CODES,
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
