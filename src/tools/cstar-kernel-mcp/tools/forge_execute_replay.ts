import {
    mcpGuardrail,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';

export function buildForgeAttemptReplayResponse(
    args: ForgeExecutionArgs,
    attempt: Record<string, unknown>,
    requestStatus: string,
): McpTextResponse {
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
            : `durable_attempt_${String(attempt.status).toLowerCase()}`;
    return textResponse({
        status: success
            ? 'succeeded_replay'
            : deliveredPendingValidation
                ? 'delivered_pending_validation_replay'
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
        forge_execution: {
            attempted: false,
            adapter_invoked: false,
            live_spend: false,
            live_source_collection: false,
            codex_worker_fallback_allowed: false,
            fail_closed_reason: failClosedReason,
        },
        guardrail: mcpGuardrail(
            success ? 'allow' : deliveredPendingValidation ? 'caution' : 'block',
            success ? 'continue' : deliveredPendingValidation ? 'verify' : 'refuse',
            'The idempotency key already has a durable attempt; the adapter was not invoked again.',
            failClosedReason ? [failClosedReason] : [],
            ['forge_execution_idempotency'],
        ),
        next_action: deliveredPendingValidation
            ? 'Independently validate the delivered artifact and record the result; do not invoke the adapter again.'
            : undefined,
    }, !success && !deliveredPendingValidation);
}
