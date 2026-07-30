import {
    mcpGuardrail,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import type { HallForgeContinuationRecord } from '../../../types/forge.js';
import type { HallForgeAttemptRecord } from '../../../types/forge.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { getForgeContinuationByAttempt } from '../../pennyone/intel/forge_continuation_controller.js';
import { reconcileForgeAttemptIfAbandoned } from './forge_attempt_recovery.js';

export function buildForgeAttemptReplayResponse(
    args: ForgeExecutionArgs,
    attempt: Record<string, unknown>,
    requestStatus: string,
    continuation: HallForgeContinuationRecord | null = null,
    recovery?: Record<string, unknown>,
): McpTextResponse {
    const continuationReplay = attempt.status === 'FAILED_RETRYABLE'
        && continuation?.status === 'PENDING_REPAIR';
    const ambiguous = attempt.status === 'UNKNOWN';
    const terminal = ['SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN']
        .includes(String(attempt.status));
    const success = attempt.status === 'SUCCEEDED';
    const deliveredPendingValidation = attempt.status === 'STARTED'
        && String(attempt.result_status ?? '').startsWith('DELIVERED_PENDING_VALIDATION:');
    const failClosedReason = success
        ? null
        : deliveredPendingValidation
            ? 'independent_validation_required'
            : continuationReplay
                ? 'pre_provider_continuation_pending'
            : `durable_attempt_${String(attempt.status).toLowerCase()}`;
    return textResponse({
        status: success
            ? 'succeeded_replay'
            : deliveredPendingValidation
                ? 'delivered_pending_validation_replay'
                : continuationReplay ? 'pre_provider_continuation_replay'
                : ambiguous ? 'ambiguous_replay'
                    : terminal ? 'terminal_replay' : 'nonterminal_replay',
        execution_kind: 'forge',
        decision_id: args.forge_request_decision_id,
        forge_request_receipt_id: args.forge_request_receipt_id,
        execution_receipt_id: attempt.execution_receipt_id,
        attempt_id: attempt.attempt_id,
        attempt_status: attempt.status,
        request_status: requestStatus,
        replayed: true,
        ...(recovery ? { recovery } : {}),
        forge_execution: {
            attempted: false,
            provider_attempted: false,
            adapter_invoked: false,
            live_spend: false,
            live_source_collection: false,
            codex_worker_fallback_allowed: false,
            fail_closed_reason: failClosedReason,
        },
        guardrail: mcpGuardrail(
            success ? 'allow' : deliveredPendingValidation || continuationReplay ? 'caution' : 'block',
            success || continuationReplay ? 'continue' : deliveredPendingValidation ? 'verify' : 'refuse',
            'The idempotency key already has a durable attempt; the adapter was not invoked again.',
            failClosedReason && !continuationReplay ? [failClosedReason] : [],
            ['forge_execution_idempotency'],
        ),
        next_action: deliveredPendingValidation
            ? 'Independently validate the delivered artifact and record the result; do not invoke the adapter again.'
            : continuationReplay
                ? 'Repair and independently validate the recorded blocker, then resume the unchanged request; no new operator authorization is required.'
            : undefined,
    }, !success && !deliveredPendingValidation && !continuationReplay);
}

export function buildForgeAttemptReplayAfterRecovery(
    root: string,
    args: ForgeExecutionArgs,
    attempt: HallForgeAttemptRecord,
): McpTextResponse {
    const db = getForgeWritableDb(root);
    const current = reconcileForgeAttemptIfAbandoned(root, db, attempt);
    return buildForgeAttemptReplayResponse(
        args,
        current.attempt as unknown as Record<string, unknown>,
        current.request.status,
        getForgeContinuationByAttempt(db, current.attempt.attempt_id),
        current.recovery as unknown as Record<string, unknown>,
    );
}
