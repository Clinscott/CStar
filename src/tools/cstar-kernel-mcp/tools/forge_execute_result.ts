import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeRequestRecord } from '../../../types/forge.js';
import { finalizeForgePreProviderContinuation } from '../../pennyone/intel/forge_continuation_controller.js';
import { finalizeForgeAttempt, getForgeAttempt, getForgeRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../pennyone/intel/forge_validation_controller.js';
import { mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { invokeForgeHermesMinimaxAdapter } from './forge_adapters.js';
import { classifyForgePreProviderFailure } from './forge_continuation_authority.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { FORGE_PRE_PROVIDER_RECOVERABLE_FAILURES } from './forge_failure_evidence.js';
import {
    hashForgeContinuationAuthority,
    hashForgeRuntimeBinding,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';

type AdapterResult = Awaited<ReturnType<typeof invokeForgeHermesMinimaxAdapter>>;

export function finalizeForgeKernelPreProviderFailure({
    db,
    args,
    attemptId,
    failureCode,
    recordedCanonical,
    currentCanonical,
}: {
    db: Database.Database;
    args: ForgeExecutionArgs;
    attemptId: string;
    failureCode: string;
    recordedCanonical: CanonicalForgeRequest;
    currentCanonical: CanonicalForgeRequest;
}): McpTextResponse | null {
    if (!FORGE_PRE_PROVIDER_RECOVERABLE_FAILURES.has(failureCode)) return null;
    const evidence = stableJson({
        schema: 'cstar.forge_kernel_preprovider_failure.v1',
        request_id: args.forge_request_receipt_id,
        attempt_id: attemptId,
        failure_code: failureCode,
        provider_requests_started: 0,
        provider_requests_completed: 0,
        provider_requests_ambiguous: 0,
        live_spend: false,
        live_spend_unknown: false,
        known_spend_observed: false,
        live_source_collection: false,
        workspace_commit_present: false,
    });
    const receipt = finalizeForgePreProviderContinuation(db, {
        attempt_id: attemptId,
        failure_code: failureCode,
        execution_trace_sha256: createHash('sha256').update(evidence).digest('hex'),
        zero_provider_proof: {
            provider_evidence_valid: true,
            provider_requests_started: 0,
            provider_requests_completed: 0,
            provider_requests_ambiguous: 0,
            provider_request_receipts: [],
            input_tokens: 0,
            output_tokens: 0,
            live_spend: false,
            live_spend_unknown: false,
            known_spend_observed: false,
        },
        continuation_authority_sha256: hashForgeContinuationAuthority(recordedCanonical),
        prior_runtime_sha256: hashForgeRuntimeBinding(currentCanonical),
    });
    const attempt = getForgeAttempt(db, attemptId)!;
    const request = getForgeRequest(db, attempt.request_id)!;
    const blocked = receipt.status === 'BLOCKED';
    return textResponse({
        status: blocked ? 'pre_provider_continuation_blocked' : 'pre_provider_continuation_pending',
        execution_kind: 'forge',
        forge_request_receipt_id: args.forge_request_receipt_id,
        attempt_id: attempt.attempt_id,
        execution_receipt_id: attempt.execution_receipt_id,
        attempt_status: attempt.status,
        request_status: request.status,
        continuation_fingerprint: receipt.failure_fingerprint_sha256,
        forge_execution: {
            attempted: false, provider_attempted: false,
            adapter_invoked: false, live_spend: false,
            live_source_collection: false,
            codex_worker_fallback_allowed: false,
            fail_closed_reason: failureCode,
        },
        continuation_block_reason: receipt.block_reason ?? null,
        next_action: blocked
            ? 'Automatic continuation stopped at the bounded no-progress limit; keep the original request closed and open a repair decision.'
            : 'Repair and independently validate the recorded local blocker; CStar then continues this unchanged request without another operator authorization.',
    }, blocked);
}

export function finalizeForgeAdapterExecutionResult({
    db,
    args,
    request,
    attemptId,
    decisionId,
    executionReceiptId,
    adapterResult,
    adapterVersion,
    recordedCanonical,
    currentCanonical,
    surface,
    adapter,
    packageLockProofs,
}: {
    db: Database.Database;
    args: ForgeExecutionArgs;
    request: HallForgeRequestRecord;
    attemptId: string;
    decisionId: string;
    executionReceiptId: string;
    adapterResult: AdapterResult;
    adapterVersion: string;
    recordedCanonical: CanonicalForgeRequest;
    currentCanonical: CanonicalForgeRequest;
    surface: unknown;
    adapter: unknown;
    packageLockProofs: unknown;
}): McpTextResponse {
    const sourceViolation = adapterResult.live_source_collection === true;
    const liveSpendUnknown = adapterResult.live_spend_unknown === true;
    const delivered = adapterResult.status === 'ok' && !sourceViolation && !liveSpendUnknown;
    const envelope = adapterResult.envelope as Record<string, any> | null;
    const externalExecutionId = typeof envelope?.intent_id === 'string'
        ? envelope.intent_id : undefined;
    const artifactSha256 = typeof envelope?.response_artifact?.sha256 === 'string'
        ? envelope.response_artifact.sha256 : undefined;
    const traceSha256 = typeof adapterResult.execution_trace_artifact?.sha256 === 'string'
        ? adapterResult.execution_trace_artifact.sha256 : undefined;
    const failureCode = typeof envelope?.degraded_reason === 'string'
        ? envelope.degraded_reason : adapterResult.error ?? null;
    const continuation = !delivered && traceSha256
        ? classifyForgePreProviderFailure({
            envelope,
            failure_code: failureCode,
            execution_trace_sha256: traceSha256,
            live_source_collection: sourceViolation,
            workspace_commit_present: adapterResult.workspace_commit !== null,
            recorded_canonical: recordedCanonical,
            current_canonical: currentCanonical,
        }) : null;
    if (continuation) {
        const receipt = finalizeForgePreProviderContinuation(db, {
            attempt_id: attemptId,
            ...continuation,
        });
        const attempt = getForgeAttempt(db, attemptId)!;
        const currentRequest = getForgeRequest(db, request.request_id)!;
        const blocked = receipt.status === 'BLOCKED';
        return textResponse({
            status: blocked ? 'pre_provider_continuation_blocked' : 'pre_provider_continuation_pending',
            execution_kind: 'forge',
            decision_id: decisionId,
            bead_id: request.bead_id,
            forge_request_receipt_id: request.request_id,
            execution_receipt_id: executionReceiptId,
            attempt_id: attempt.attempt_id,
            attempt_status: attempt.status,
            request_status: currentRequest.status,
            continuation_fingerprint: receipt.failure_fingerprint_sha256,
            continuation_block_reason: receipt.block_reason ?? null,
            replayed: false,
            forge_execution: {
                mode: args.execution_mode,
                attempted: false,
                provider_attempted: false,
                adapter_invoked: true,
                live_spend: false,
                live_source_collection: false,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: continuation.failure_code,
            },
            guardrail: mcpGuardrail(
                blocked ? 'block' : 'caution', blocked ? 'refuse' : 'continue',
                blocked
                    ? 'The bounded mechanical recovery limit was reached without consuming provider or retry budget.'
                    : 'A proven pre-provider mechanical cycle was recorded without consuming provider or retry budget.',
                blocked ? [receipt.block_reason ?? 'forge_preprovider_continuation_blocked'] : [],
                ['forge_pre_provider_continuation'],
            ),
            next_action: blocked
                ? 'Keep the original request closed and open a repair decision for the repeated mechanical blocker.'
                : 'Repair and independently validate the recorded local blocker; CStar then continues this unchanged request without another operator authorization.',
        }, blocked);
    }
    const durable = delivered
        ? recordForgeDelivery(db, {
            attempt_id: attemptId,
            external_execution_id: externalExecutionId,
            result_status: String(adapterResult.status),
            result_artifact_sha256: artifactSha256,
            provider: typeof envelope?.provider === 'string' ? envelope.provider : 'minimax-oauth',
            requested_model: typeof envelope?.requested_model === 'string' ? envelope.requested_model : 'MiniMax-M3',
            actual_model: typeof envelope?.actual_model === 'string' ? envelope.actual_model : undefined,
            model_source: typeof envelope?.model_source === 'string' ? envelope.model_source : 'unreported',
            reasoning_profile: 'forge-private',
            adapter_version: adapterVersion,
        })
        : finalizeForgeAttempt(db, {
            attempt_id: attemptId,
            status: liveSpendUnknown ? 'UNKNOWN' : 'FAILED_FINAL',
            external_execution_id: externalExecutionId,
            result_status: String(adapterResult.status),
            result_artifact_sha256: artifactSha256,
            error_code: sourceViolation
                ? 'forge_adapter_collected_unauthorized_live_source'
                : liveSpendUnknown ? 'forge_adapter_live_spend_unknown' : adapterResult.error ?? undefined,
            provider: typeof envelope?.provider === 'string' ? envelope.provider : 'minimax-oauth',
            requested_model: typeof envelope?.requested_model === 'string' ? envelope.requested_model : 'MiniMax-M3',
            actual_model: typeof envelope?.actual_model === 'string' ? envelope.actual_model : undefined,
            model_source: typeof envelope?.model_source === 'string' ? envelope.model_source : 'unreported',
            reasoning_profile: 'forge-private',
            adapter_version: adapterVersion,
        });
    return textResponse({
        status: delivered ? 'delivered_unverified' : liveSpendUnknown ? 'ambiguous' : 'failed_final',
        execution_kind: 'forge',
        decision_id: decisionId,
        bead_id: request.bead_id,
        forge_request_receipt_id: request.request_id,
        execution_receipt_id: executionReceiptId,
        attempt_id: durable.attempt.attempt_id,
        attempt_status: durable.attempt.status,
        request_status: durable.request.status,
        replayed: false,
        authorized_dispatch_surface: surface,
        authorized_execution_adapter: adapter,
        package_lock_proofs: packageLockProofs,
        required_metrics: currentCanonical.required_metrics,
        artifact_expectations: currentCanonical.artifact_expectations,
        prohibited_actions: currentCanonical.prohibited_actions,
        requested_actions: currentCanonical.requested_actions,
        action_authority: currentCanonical.action_authority,
        forge_execution: {
            mode: args.execution_mode,
            attempted: true,
            provider_attempted: true,
            adapter_invoked: true,
            adapter_result: adapterResult,
            live_spend: liveSpendUnknown ? 'unknown' : adapterResult.live_spend === true,
            live_source_collection: sourceViolation,
            codex_worker_fallback_allowed: false,
            fail_closed_reason: delivered ? null : durable.attempt.error_code ?? 'forge_adapter_failed_final',
        },
        guardrail: mcpGuardrail(
            delivered ? 'caution' : 'block', delivered ? 'verify' : 'refuse',
            delivered
                ? 'The adapter delivered a structurally valid artifact; independent validation is still required before success.'
                : liveSpendUnknown
                    ? 'The adapter may have spent before failing; the attempt is UNKNOWN and consumes the one-shot grant.'
                    : 'The durable attempt is terminal and cannot be replayed as new spend.',
            delivered ? [] : [durable.attempt.error_code ?? 'forge_adapter_failed_final'],
            ['forge_execution_authority', 'forge_execution_result', 'independent_validation'],
        ),
        next_action: delivered
            ? 'Run focused independent validation, then call cstar_record_result with this execution_receipt_id.'
            : 'Do not retry this one-shot request.',
    }, !delivered);
}
