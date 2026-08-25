import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { database } from '../../pennyone/intel/database.js';
import {
    finalizeForgeAttempt, getForgeAttemptByIdempotency,
    getForgeRequest,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../pennyone/intel/forge_validation_controller.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    findDispatchValidationError,
    hasDuplicatePackageLockMismatch,
    makeDispatchDecisionId,
    normalizeActionList,
    resolveDispatchSurface,
    verifyDispatchPackageLocks,
    type DispatchRequestArgs,
} from './dispatch_request.js';
import {
    cleanupPreparedForgeAdapterInvocation,
    forgeExecutionRequiresImplementationWrites,
    invokeForgeHermesMinimaxAdapter,
    prepareForgeHermesMinimaxAdapterInvocation,
    resolveForgeExecutionAdapter,
    sealForgeAdapterRuntime,
    type PreparedForgeAdapterInvocation,
} from './forge_adapters.js';
import {
    assertForgeRequiredOutputsContained,
    buildForgeExecutionReceiptId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import {
    forgeHermesRuntimeExpectationEquals,
    sealForgeHermesRuntimeExpectation,
} from './forge_hermes_runtime_contract.js';
import { preflightForgeHermesOAuthBeforeReservation } from './forge_hermes_oauth_contract.js';
import { verifyOperatorAuthorization } from './operator_authorization.js';
export type ForgeExecutionMode = 'no_op' | 'live_authorized';

export interface ForgeExecutionArgs extends DispatchRequestArgs {
    forge_request_receipt_id: string;
    forge_request_decision_id: string;
    forge_request_bead_id?: string;
    execution_mode: ForgeExecutionMode;
    execution_adapter_ref?: string;
    operator_authorization_ref?: string;
    idempotency_key: string;
    retry_of_attempt_id?: string;
}

function findForgeExecutionValidationError(args: ForgeExecutionArgs): string | null {
    const baseError = findDispatchValidationError(args);
    if (baseError) return baseError;
    if (!args.forge_request_receipt_id?.trim()) return 'forge_request_receipt_id is required';
    if (!args.forge_request_receipt_id.startsWith('dispatch-forge-')) {
        return 'forge_request_receipt_id must reference a cstar_forge_request receipt';
    }
    if (!args.forge_request_decision_id?.trim()) return 'forge_request_decision_id is required';
    if (args.decision_id?.trim() && args.decision_id.trim() !== args.forge_request_decision_id.trim()) {
        return 'decision_id must match forge_request_decision_id';
    }
    if (args.bead_id?.trim() && args.forge_request_bead_id?.trim() && args.bead_id.trim() !== args.forge_request_bead_id.trim()) {
        return 'bead_id must match forge_request_bead_id';
    }
    if (hasDuplicatePackageLockMismatch(args.package_locks)) {
        return 'package_locks contain inconsistent hashes for the same path';
    }
    if (!args.idempotency_key?.trim()) return 'idempotency_key is required';
    if (args.execution_mode === 'live_authorized') {
        if (!args.operator_authorization_ref?.trim()) {
            return 'live Forge execution requires operator_authorization_ref';
        }
        if (!args.execution_adapter_ref?.trim()) {
            return 'live Forge execution requires execution_adapter_ref';
        }
        const spendRef = args.spend_policy.operator_authorization_ref?.trim();
        if (spendRef && spendRef !== args.operator_authorization_ref.trim()) {
            return 'operator_authorization_ref must match spend_policy.operator_authorization_ref';
        }
    }
    return null;
}

function replayResponse(args: ForgeExecutionArgs, attempt: Record<string, unknown>, requestStatus: string): McpTextResponse {
    const terminal = ['SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL'].includes(String(attempt.status));
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

export async function handleForgeExecute(args: ForgeExecutionArgs, requestContext?: McpRequestContext): Promise<McpTextResponse> {
    let hallDb: Database.Database | null = null;
    let reservedAttemptId: string | null = null;
    let adapterStarted = false;
    let preparedInvocation: PreparedForgeAdapterInvocation | null = null;
    let completedAdapterVersion: string | undefined;
    try {
        const validationError = findForgeExecutionValidationError(args);
        const decisionId = args.forge_request_decision_id?.trim() || makeDispatchDecisionId('forge', args);
        if (validationError) {
            return textResponse({
                status: 'rejected',
                execution_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id ?? args.forge_request_bead_id ?? null,
                forge_request_receipt_id: args.forge_request_receipt_id ?? null,
                error: validationError,
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'Forge execution request failed the CStar execution contract.',
                    ['forge_execution_contract'],
                    ['request_validation'],
                ),
            }, true);
        }

        const root = registry.getRoot();
        const surface = resolveDispatchSurface('forge', args, root);
        if (args.execution_mode === 'no_op') {
            const adapter = resolveForgeExecutionAdapter(args, root);
            const failClosedReason = !surface.found ? 'missing_authorized_dispatch_surface' : null;
            return textResponse({
                status: 'validated_noop',
                execution_kind: 'forge',
                decision_id: decisionId,
                execution_receipt_id: buildForgeExecutionReceiptId(args.forge_request_receipt_id, args.idempotency_key),
                forge_request_receipt_id: args.forge_request_receipt_id,
                bead_id: args.bead_id ?? args.forge_request_bead_id ?? null,
                authorized_dispatch_surface: surface,
                authorized_execution_adapter: adapter,
                forge_execution: {
                    mode: args.execution_mode,
                    attempted: false,
                    live_spend: false,
                    live_source_collection: false,
                    codex_worker_fallback_allowed: false,
                    adapter_invoked: false,
                    fail_closed_reason: failClosedReason,
                },
                guardrail: mcpGuardrail(
                    failClosedReason ? 'block' : 'allow',
                    failClosedReason ? 'refuse' : 'continue',
                    'Forge execution contract was validated without reserving an attempt or invoking a model.',
                    failClosedReason ? [failClosedReason] : [],
                    ['forge_execution_authority'],
                ),
            }, Boolean(failClosedReason));
        }

        if (!surface.found) throw new Error('missing_authorized_dispatch_surface');
        hallDb = database.getDb(root);
        const request = getForgeRequest(hallDb, args.forge_request_receipt_id);
        if (!request) throw new Error('forge_request_receipt_not_found');
        const adapter = resolveForgeExecutionAdapter(args, root);
        if (!adapter.selected) throw new Error('missing_authorized_execution_adapter');
        if (request.decision_id !== decisionId) throw new Error('forge_request_decision_mismatch');
        const suppliedBeadId = args.bead_id?.trim() || args.forge_request_bead_id?.trim() || '';
        if (request.bead_id !== suppliedBeadId) throw new Error('forge_request_bead_mismatch');
        if (request.operator_authorization_ref !== args.operator_authorization_ref?.trim()) {
            throw new Error('forge_operator_authorization_reference_mismatch');
        }
        if (request.adapter_ref !== adapter.selected.ref) throw new Error('forge_request_adapter_mismatch');
        if (!request.write_capability) throw new Error('forge_request_write_capability_missing');
        if (
            adapter.selected.write_capability === 'response_only'
            && forgeExecutionRequiresImplementationWrites(args)
        ) {
            throw new Error('adapter_lacks_implementation_write_capability');
        }
        if (adapter.selected.write_capability === 'project_files') {
            assertForgeRequiredOutputsContained(root, args.target_paths, args.required_output_paths);
        }
        const adapterRuntimeProof = sealForgeAdapterRuntime(adapter.selected);

        const verified = await verifyOperatorAuthorization(args.operator_authorization_ref!, {
            target_paths: [
                ...(args.target_paths ?? []),
                ...(args.required_output_paths ?? []),
            ],
            requires_forge_hermes_m3: true,
            request_context: requestContext,
        });
        if (
            verified.thread_id !== request.operator_thread_id
            || verified.turn_id !== request.operator_turn_id
            || verified.message_sha256 !== request.operator_message_sha256
            || verified.session_record_sha256 !== request.operator_record_sha256
            || verified.session_record_set_sha256 !== request.operator_record_set_sha256
            || verified.session_record_count !== request.operator_record_count
        ) {
            throw new Error('forge_operator_authorization_attestation_drift');
        }
        if (request.expires_at !== verified.expires_at || Date.now() >= verified.expires_at) {
            throw new Error('forge_operator_authorization_expired');
        }
        if (request.live_source_allowed !== 0 || args.spend_policy.live_source_allowed === true) {
            throw new Error('forge_live_source_not_authorized');
        }
        const packageLockProofs = verifyDispatchPackageLocks(args.package_locks, root);
        let recordedCanonical: CanonicalForgeRequest;
        try {
            recordedCanonical = JSON.parse(request.request_summary_json) as CanonicalForgeRequest;
        } catch {
            throw new Error('forge_request_summary_invalid');
        }
        const expectedHermesRuntime = recordedCanonical.hermes_runtime;
        if (adapter.selected.ref === 'cstar-forge-hermes-minimax-worker-adapter') {
            if (!expectedHermesRuntime) throw new Error('forge_request_hermes_runtime_missing');
            const currentHermesRuntime = await sealForgeHermesRuntimeExpectation(adapterRuntimeProof);
            if (!forgeHermesRuntimeExpectationEquals(currentHermesRuntime, expectedHermesRuntime)) {
                throw new Error('forge_hermes_request_runtime_drift');
            }
        }

        const canonical = canonicalizeForgeRequest(
            args,
            root,
            decisionId,
            adapter.selected.ref,
            request.write_capability,
            request.max_attempts,
            adapterRuntimeProof,
            expectedHermesRuntime,
        );
        const requestSha256 = hashCanonicalForgeRequest(canonical);
        if (
            requestSha256 !== request.request_sha256
            || stableJson(canonical) !== request.request_summary_json
            || hashForgeTargetPaths(canonical) !== request.target_paths_sha256
        ) {
            throw new Error('forge_execution_request_hash_mismatch');
        }

        // Only durable canonical paths may reach the model-visible adapter
        // intent. Raw execute arguments can be lexically different while
        // hashing to the same authority and therefore must not shape prompts.
        const invocationArgs: ForgeExecutionArgs = {
            ...args,
            target_paths: canonical.target_paths,
            required_output_paths: canonical.required_output_paths,
        };
        const executionReceiptId = buildForgeExecutionReceiptId(request.request_id, args.idempotency_key.trim());
        const existingAttempt = getForgeAttemptByIdempotency(hallDb, request.request_id, args.idempotency_key.trim());
        if (existingAttempt) return replayResponse(args, existingAttempt as unknown as Record<string, unknown>, request.status);
        const preReservationHermesPreflight = expectedHermesRuntime
            ? await preflightForgeHermesOAuthBeforeReservation(
                invocationArgs, decisionId, executionReceiptId, root,
                adapter.selected, adapterRuntimeProof, expectedHermesRuntime,
            )
            : null;
        const reservation = reserveForgeAttempt(hallDb, {
            request_id: request.request_id,
            idempotency_key: args.idempotency_key.trim(),
            execution_receipt_id: executionReceiptId,
            adapter_ref: adapter.selected.ref,
            provider: 'minimax-oauth',
            requested_model: 'MiniMax-M3',
            model_source: 'unreported',
            reasoning_profile: 'forge-private',
            adapter_version: adapter.selected.ref,
            retry_of_attempt_id: args.retry_of_attempt_id?.trim() || undefined,
        });
        reservedAttemptId = reservation.attempt.attempt_id;
        if (reservation.replayed) {
            return replayResponse(args, reservation.attempt as unknown as Record<string, unknown>, reservation.request.status);
        }

        preparedInvocation = await prepareForgeHermesMinimaxAdapterInvocation(
            invocationArgs,
            decisionId,
            executionReceiptId,
            root,
            adapter.selected,
            adapterRuntimeProof,
            expectedHermesRuntime,
            preReservationHermesPreflight,
        );
        markForgeAttemptStarted(hallDb, reservation.attempt.attempt_id);
        const adapterResult = await invokeForgeHermesMinimaxAdapter(
            invocationArgs,
            decisionId,
            executionReceiptId,
            root,
            adapter.selected,
            adapterRuntimeProof,
            preparedInvocation,
        );
        adapterStarted = preparedInvocation.spendMayHaveStarted;
        preparedInvocation = null;
        const sourceViolation = adapterResult.live_source_collection === true;
        const liveSpendUnknown = adapterResult.live_spend_unknown === true;
        const delivered = adapterResult.status === 'ok' && !sourceViolation && !liveSpendUnknown;
        const externalExecutionId = typeof adapterResult.envelope?.intent_id === 'string'
            ? adapterResult.envelope.intent_id
            : undefined;
        const responseArtifactSha256 = typeof adapterResult.envelope?.response_artifact?.sha256 === 'string'
            ? adapterResult.envelope.response_artifact.sha256
            : undefined;
        const traceArtifactSha256 = typeof adapterResult.execution_trace_artifact?.sha256 === 'string'
            ? adapterResult.execution_trace_artifact.sha256
            : undefined;
        const artifactSha256 = responseArtifactSha256;
        const runtimeDigest = typeof adapterResult.hermes_runtime_content_sha256 === 'string'
            ? adapterResult.hermes_runtime_content_sha256
            : null;
        const durableAdapterVersion = [adapter.selected.ref,
            runtimeDigest ? `hermes:${runtimeDigest}` : null,
            traceArtifactSha256 ? `trace:${traceArtifactSha256}` : null,
        ].filter(Boolean).join('@');
        completedAdapterVersion = durableAdapterVersion;
        const durable = delivered
            ? recordForgeDelivery(hallDb, {
                attempt_id: reservation.attempt.attempt_id,
                external_execution_id: externalExecutionId,
                result_status: String(adapterResult.status),
                result_artifact_sha256: artifactSha256,
                provider: typeof adapterResult.envelope?.provider === 'string'
                    ? adapterResult.envelope.provider : 'minimax-oauth',
                requested_model: typeof adapterResult.envelope?.requested_model === 'string'
                    ? adapterResult.envelope.requested_model : 'MiniMax-M3',
                actual_model: typeof adapterResult.envelope?.actual_model === 'string'
                    ? adapterResult.envelope.actual_model : undefined,
                model_source: typeof adapterResult.envelope?.model_source === 'string'
                    ? adapterResult.envelope.model_source : 'unreported',
                reasoning_profile: 'forge-private',
                adapter_version: durableAdapterVersion,
            })
            : finalizeForgeAttempt(hallDb, {
                attempt_id: reservation.attempt.attempt_id,
                status: liveSpendUnknown ? 'UNKNOWN' : 'FAILED_FINAL',
                external_execution_id: externalExecutionId,
                result_status: String(adapterResult.status),
                result_artifact_sha256: artifactSha256,
                error_code: sourceViolation
                    ? 'forge_adapter_collected_unauthorized_live_source'
                    : liveSpendUnknown
                        ? 'forge_adapter_live_spend_unknown'
                        : adapterResult.error ?? undefined,
                provider: typeof adapterResult.envelope?.provider === 'string'
                    ? adapterResult.envelope.provider : 'minimax-oauth',
                requested_model: typeof adapterResult.envelope?.requested_model === 'string'
                    ? adapterResult.envelope.requested_model : 'MiniMax-M3',
                actual_model: typeof adapterResult.envelope?.actual_model === 'string'
                    ? adapterResult.envelope.actual_model : undefined,
                model_source: typeof adapterResult.envelope?.model_source === 'string'
                    ? adapterResult.envelope.model_source : 'unreported',
                reasoning_profile: 'forge-private',
                adapter_version: durableAdapterVersion,
            });
        reservedAttemptId = null;

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
            required_metrics: args.required_metrics,
            artifact_expectations: args.artifact_expectations,
            prohibited_actions: normalizeActionList(args.prohibited_actions),
            requested_actions: normalizeActionList(args.requested_actions),
            forge_execution: {
                mode: args.execution_mode,
                attempted: true,
                adapter_invoked: true,
                adapter_result: adapterResult,
                live_spend: liveSpendUnknown ? 'unknown' : adapterResult.live_spend === true,
                live_source_collection: adapterResult.live_source_collection === true,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: delivered ? null : durable.attempt.error_code ?? 'forge_adapter_failed_final',
            },
            guardrail: mcpGuardrail(
                delivered ? 'caution' : 'block',
                delivered ? 'verify' : 'refuse',
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
    } catch (error) {
        const invocationMayHaveStarted = adapterStarted || preparedInvocation?.spendMayHaveStarted === true;
        let failureAdapterVersion = completedAdapterVersion;
        if (preparedInvocation) {
            let traceDigest = 'unavailable';
            try {
                traceDigest = createHash('sha256')
                    .update(fs.readFileSync(preparedInvocation.executionTracePath)).digest('hex');
            } catch { /* Missing terminal trace is explicit durable failure evidence. */ }
            const runtimeDigest = preparedInvocation.hermesPreflight?.runtime_content_sha256 ?? 'unavailable';
            const identity = preparedInvocation.intent.execution_identity as Record<string, unknown>;
            const adapterRef = typeof identity?.adapter_ref === 'string'
                ? identity.adapter_ref : args.execution_adapter_ref ?? 'unregistered';
            failureAdapterVersion = `${adapterRef}@hermes:${runtimeDigest}@trace-last:${traceDigest}`;
        }
        await cleanupPreparedForgeAdapterInvocation(preparedInvocation);
        if (hallDb && reservedAttemptId) {
            const message = error instanceof Error ? error.message : String(error);
            try {
                const terminal = finalizeForgeAttempt(hallDb, {
                    attempt_id: reservedAttemptId,
                    status: invocationMayHaveStarted ? 'UNKNOWN' : 'FAILED_FINAL',
                    error_code: message,
                    adapter_version: failureAdapterVersion,
                });
                return textResponse({
                    status: invocationMayHaveStarted ? 'ambiguous' : 'failed_final',
                    execution_kind: 'forge',
                    forge_request_receipt_id: args.forge_request_receipt_id,
                    attempt_id: terminal.attempt.attempt_id,
                    attempt_status: terminal.attempt.status,
                    request_status: terminal.request.status,
                    error: message,
                    forge_execution: {
                        attempted: invocationMayHaveStarted,
                        adapter_invoked: invocationMayHaveStarted,
                        live_spend: invocationMayHaveStarted ? 'unknown' : false,
                        live_source_collection: false,
                        codex_worker_fallback_allowed: false,
                        fail_closed_reason: message,
                    },
                    guardrail: mcpGuardrail(
                        'block',
                        'refuse',
                        'The durable attempt failed closed; ambiguous attempts consume the grant and never auto-relaunch.',
                        [message],
                        ['forge_execution_recovery'],
                    ),
                }, true);
            } catch {
                // Preserve the original error if receipt finalization itself fails.
            }
        }
        return errorResponse(error);
    }
}
