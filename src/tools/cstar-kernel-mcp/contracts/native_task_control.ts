/**
 * Data-only contract identifiers for the neutral native task-control surface.
 * Forge is historical evidence in this contract and has no executable route.
 */

export const NATIVE_TASK_CONTROL_SCHEMAS = Object.freeze({
    policy: 'cstar.native_policy.v1',
    role_manifest: 'cstar.native_role_manifest.v1',
    goal_generation: 'cstar.native_goal_generation.v1',
    controller_lease: 'cstar.native_controller_lease.v1',
    task_control_event: 'cstar.native_task_control_event.v1',
    succession_receipt: 'cstar.native_succession_receipt.v1',
    cohort_wait: 'cstar.native_cohort_wait.v1',
    circuit_breaker: 'cstar.native_circuit_breaker.v1',
    work_terminal_receipt: 'cstar.native_work_terminal_receipt.v1',
    task_control_state: 'cstar.native_task_control_state.v1',
    transition_result: 'cstar.native_transition_result.v1',
    contract: 'cstar.native_task_control_contract.v1',
} as const);

/**
 * The contract intentionally contains no function-valued route or provider
 * member.  A null active route is a terminal, explicit fail-closed state.
 */
export const NATIVE_TASK_CONTROL_CONTRACT = Object.freeze({
    schema: NATIVE_TASK_CONTROL_SCHEMAS.contract,
    contract_id: 'cstar-native-task-control-contract-01',
    surface: 'native_task_control',
    mode: 'neutral',
    active_route: null,
    forge: 'TOMBSTONED_PERMANENT',
    forge_status: 'TOMBSTONED_PERMANENT',
    forge_execution: false,
    forge_fallback: false,
    forge_adapter: false,
    forge_lifecycle: false,
    forge_validation: false,
    functions: Object.freeze([] as const),
} as const);
