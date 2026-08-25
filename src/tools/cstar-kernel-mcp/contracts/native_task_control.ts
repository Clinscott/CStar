import { NATIVE_TASK_CONTROL_ERROR_CODES } from '../../../core/native_task_control/errors.js';
import { NATIVE_TASK_CONTROL_SCHEMAS, type NativeTaskEventKind } from '../../../types/native_task_control.js';

/**
 * Declarative MCP boundary for the neutral interpreter.  It describes the
 * supported packet/event surface; it does not dispatch, poll, or mutate CStar.
 */
export const NATIVE_TASK_CONTROL_EVENT_KINDS: readonly NativeTaskEventKind[] = [
    'START', 'PROGRESS', 'COMPLETE', 'FAIL', 'BLOCK', 'CANCEL', 'REVOKE', 'CANCEL_ACK', 'REVOKED', 'UNKNOWN',
    'SUCCESSION_PREPARE', 'SUCCESSION_COMMIT', 'REPLACEMENT', 'COHORT_WAIT', 'TIMEOUT', 'RETRY', 'REPLAY',
    'AUTO_CONTINUATION', 'FORGE_INVOCATION',
];

export const NATIVE_TASK_CONTROL_CONTRACT = Object.freeze({
    schemas: NATIVE_TASK_CONTROL_SCHEMAS,
    event_kinds: NATIVE_TASK_CONTROL_EVENT_KINDS,
    limits: Object.freeze({
        max_policy_depth: 8,
        max_persistent_role_slots: 8,
        max_total_role_slots: 32,
        cohort_waits_per_cohort: 1,
        cancel_calls_per_goal_generation: 1,
        breaker_threshold: 1,
    }),
    prohibited_dependencies: Object.freeze([
        'clock', 'random', 'network', 'model', 'filesystem', 'hall', 'sqlite', 'provider', 'plugin', 'forge',
    ]),
    error_codes: NATIVE_TASK_CONTROL_ERROR_CODES,
    semantics: Object.freeze({
        controller: 'exactly_one_generation_fenced_controller',
        policy: 'min_intersection_union_and_logical_and',
        cancellation: 'atomic_barrier_single_terminal_ack',
        succession: 'prepare_then_commit_no_implicit_reacquisition',
        cohort_wait: 'one_bounded_wait_timeout_freezes_cohort',
    }),
});

export const nativeTaskControlContract = NATIVE_TASK_CONTROL_CONTRACT;

export type NativeTaskControlContract = typeof NATIVE_TASK_CONTROL_CONTRACT;

export function getNativeTaskControlContract(): NativeTaskControlContract {
    return NATIVE_TASK_CONTROL_CONTRACT;
}

