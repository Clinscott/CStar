import type { WeaveResult } from './contracts.ts';

export type FailureOrigin =
    | 'kernel_adapter'
    | 'kernel_exception'
    | 'host_unavailable'
    | 'host_activation'
    | 'host_supervisor'
    | 'host_only_boundary'
    | 'hall_finalization';

export interface ExplicitRecoveryEvidence {
    executionDispatched: boolean;
    recoveryCode?: string;
    automaticRecoveryAttempted?: boolean;
}

export function normalizeRuntimeFailureMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
    }
    return String(error);
}

/** Preserve the original failure while requiring a fresh operator dispatch. */
export function requireExplicitOperatorRecovery(
    result: WeaveResult,
    failureOrigin: FailureOrigin,
    evidence: ExplicitRecoveryEvidence,
): WeaveResult {
    const prior = result.metadata ?? {};
    return {
        ...result,
        metadata: {
            ...prior,
            operator_action_required: true,
            automatic_recovery_attempted: prior.automatic_recovery_attempted === true
                || evidence.automaticRecoveryAttempted === true,
            execution_dispatched: prior.execution_dispatched === true
                || evidence.executionDispatched,
            failure_origin: failureOrigin,
            recovery_code: evidence.recoveryCode ?? 'explicit_operator_retry_or_replan_required',
        },
    };
}
