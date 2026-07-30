import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { finalizeForgeAttempt, getForgeAttemptByIdempotency, getForgeRequest, markForgeAttemptStarted } from '../../pennyone/intel/forge_receipt_controller.js';
import { getForgeContinuationByAttempt, getPendingForgeContinuation } from '../../pennyone/intel/forge_continuation_controller.js';
import {
    errorResponse,
    markNonRecordablePreAuthorizationResponse,
    mcpErrorCode,
    mcpGuardrail,
    nonRecordablePreAuthorizationResponse,
    preAuthorizationErrorResponse,
    preAuthorizationResponse,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { makeDispatchDecisionId, resolveDispatchSurface, verifyDispatchPackageLocks } from './dispatch_request.js';
import { findForgeExecutionValidationError, type ForgeExecutionArgs } from './forge_execute_contract.js';
export type { ForgeExecutionArgs, ForgeExecutionMode } from './forge_execute_contract.js';
import {
    cleanupPreparedForgeAdapterInvocation,
    invokeForgeHermesMinimaxAdapter,
    prepareForgeHermesMinimaxAdapterInvocation,
    resolveForgeExecutionAdapter,
    sealForgeAdapterRuntime,
    type PreparedForgeAdapterInvocation,
} from './forge_adapters.js';
import { assertDispatchAdapterCapability, findDispatchAdapterCapabilityError, resolveDispatchActionAuthority } from './dispatch_action_authority.js';
import {
    assertForgeRequiredOutputsContained,
    buildForgeExecutionReceiptId,
    canonicalizeForgeRequest,
    assertForgeContinuationScope,
    hashCanonicalForgeRequest,
    hashForgeRuntimeBinding,
    hashForgeTargetPaths,
    projectCanonicalForgeInvocationArgs,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import { forgeHermesRuntimeExpectationEquals, sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { createForgeOAuthHorizon, preflightForgeHermesOAuthAfterReservation } from './forge_hermes_oauth_contract.js';
import { readForgeRequestBeforeMutation } from './forge_execute_request_authority.js';
import {
    forgeExecutionAuthorityMatches,
    verifyForgeExecutionAuthorization,
    verifyForgeReplayAuthorization,
} from './forge_execution_authority.js';
import {
    buildForgeAttemptReplayAfterRecovery,
    buildForgeAttemptReplayResponse,
} from './forge_execute_replay.js';
import {
    finalizeForgeAdapterExecutionResult,
    finalizeForgeKernelPreProviderFailure,
} from './forge_execute_result.js';
import { resolveRecordedForgeExecutionContract } from './forge_legacy_v2_compatibility.js';
import { createForgeHandlerRuntimeReadinessAssertion, type ForgeRuntimeReadinessAssertion } from '../contracts/runtime.js';
import {
    reconcileForgePreProviderFailureFromTrace,
    verifyForgeContinuationLineage,
    verifyForgeContinuationRepairBinding,
    verifyPreparedForgeContinuationRepairBinding,
} from './forge_continuation_authority.js';
import { reserveVerifiedForgeExecution } from './forge_execute_reservation.js';
import { resolveForgeRuntimeRoots } from './forge_runtime_roots.js';
export async function handleForgeExecute(
    args: ForgeExecutionArgs,
    requestContext?: McpRequestContext,
    runtimeReadinessTestOverride?: ForgeRuntimeReadinessAssertion,
): Promise<McpTextResponse> {
    let hallDb: Database.Database | null = null;
    let reservedAttemptId: string | null = null;
    let adapterStarted = false;
    let preparedInvocation: PreparedForgeAdapterInvocation | null = null;
    let completedAdapterVersion: string | undefined;
    let recordedCanonicalForFailure: CanonicalForgeRequest | null = null;
    let currentCanonicalForFailure: CanonicalForgeRequest | null = null;
    let executionAuthorizationVerified = false;
    let releaseReadDb: (() => void) | null = null;
    const assertStableRuntimeReady = createForgeHandlerRuntimeReadinessAssertion(runtimeReadinessTestOverride);
    try {
        const validationError = findForgeExecutionValidationError(args);
        const decisionId = args.forge_request_decision_id?.trim() || makeDispatchDecisionId('forge', args);
        if (validationError) {
            return preAuthorizationResponse({
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
            }, 'forge_execution_contract_invalid', validationError);
        }
        const { controlRoot, codeRoot } = resolveForgeRuntimeRoots();
        const suppliedActionAuthority = resolveDispatchActionAuthority(args, codeRoot);
        const surface = resolveDispatchSurface('forge', args);
        if (args.execution_mode === 'no_op') {
            const adapter = resolveForgeExecutionAdapter(args);
            let failClosedReason = !surface.found ? 'missing_authorized_dispatch_surface' : null;
            if (!failClosedReason && adapter.selected) {
                failClosedReason = findDispatchAdapterCapabilityError(
                    suppliedActionAuthority,
                    adapter.selected.write_capability,
                );
            }
            return nonRecordablePreAuthorizationResponse({
                status: 'validated_noop',
                execution_kind: 'forge',
                decision_id: decisionId,
                execution_receipt_id: buildForgeExecutionReceiptId(args.forge_request_receipt_id, args.idempotency_key),
                forge_request_receipt_id: args.forge_request_receipt_id,
                bead_id: args.bead_id ?? args.forge_request_bead_id ?? null,
                authorized_dispatch_surface: surface,
                authorized_execution_adapter: adapter,
                action_authority: suppliedActionAuthority,
                ...(failClosedReason ? {
                    error_code: mcpErrorCode(failClosedReason, 'forge_noop_contract_invalid'),
                    error: failClosedReason,
                } : {}),
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
        const { db: readDb, request: initialRequest, release } = readForgeRequestBeforeMutation(
            controlRoot,
            args.forge_request_receipt_id,
        );
        let request = initialRequest;
        releaseReadDb = release;
        const replayAuthority = await verifyForgeReplayAuthorization(
            readDb,
            request,
            args.operator_authorization_ref,
            requestContext,
        );
        if (request.decision_id !== decisionId) throw new Error('forge_request_decision_mismatch');
        const suppliedBeadId = args.bead_id?.trim() || args.forge_request_bead_id?.trim() || '';
        if (request.bead_id !== suppliedBeadId) throw new Error('forge_request_bead_mismatch');
        if (request.operator_authorization_ref !== args.operator_authorization_ref?.trim()) {
            throw new Error('forge_operator_authorization_reference_mismatch');
        }
        if (request.status === 'FAILED_FINAL' && args.retry_of_attempt_id?.trim()) {
            let recorded: CanonicalForgeRequest;
            try { recorded = JSON.parse(request.request_summary_json) as CanonicalForgeRequest; } catch {
                throw new Error('forge_request_summary_invalid');
            }
            if (recorded.schema !== 'cstar.forge_request.v3') {
                throw new Error('forge_preprovider_reconciliation_request_schema_invalid');
            }
            hallDb = getForgeWritableDb(controlRoot);
            if (replayAuthority.mode !== 'full') {
                throw new Error('forge_continuation_requires_full_caller');
            }
            verifyForgeContinuationLineage({
                authorization: replayAuthority.authorization,
                caller: replayAuthority.caller,
            });
            reconcileForgePreProviderFailureFromTrace({
                root: controlRoot,
                db: hallDb,
                request,
                authorization: replayAuthority.authorization,
                parent_attempt_id: args.retry_of_attempt_id.trim(),
                recorded_canonical: recorded,
            });
            request = getForgeRequest(hallDb, request.request_id)!;
        }
        const existingAttempt = getForgeAttemptByIdempotency(
            readDb,
            request.request_id,
            args.idempotency_key.trim(),
        );
        if (existingAttempt) {
            releaseReadDb();
            releaseReadDb = null;
            return markNonRecordablePreAuthorizationResponse(
                buildForgeAttemptReplayAfterRecovery(controlRoot, args, existingAttempt),
            );
        }
        const executionAuthority = await verifyForgeExecutionAuthorization(
            readDb,
            request,
            args.operator_authorization_ref,
            requestContext,
        );
        executionAuthorizationVerified = true;
        assertStableRuntimeReady();
        if (!surface.found) throw new Error('missing_authorized_dispatch_surface');
        const adapter = resolveForgeExecutionAdapter(args);
        if (!adapter.selected) throw new Error('missing_authorized_execution_adapter');
        if (request.adapter_ref !== adapter.selected.ref) throw new Error('forge_request_adapter_mismatch');
        if (!request.write_capability) throw new Error('forge_request_write_capability_missing');
        assertDispatchAdapterCapability(
            suppliedActionAuthority,
            adapter.selected.write_capability,
            { require_adapter: true },
        );
        if (request.write_capability !== adapter.selected.write_capability) {
            throw new Error('forge_request_adapter_capability_mismatch');
        }
        if (adapter.selected.write_capability === 'project_files') {
            assertForgeRequiredOutputsContained(codeRoot, args.target_paths, args.required_output_paths);
        }
        const adapterRuntimeProof = sealForgeAdapterRuntime(adapter.selected);
        if (request.live_source_allowed !== 0 || args.spend_policy.live_source_allowed === true) {
            throw new Error('forge_live_source_not_authorized');
        }
        const packageLockProofs = verifyDispatchPackageLocks(args.package_locks, codeRoot);
        const resolvedContract = await resolveRecordedForgeExecutionContract(
            request,
            executionAuthority.authorization,
            controlRoot,
            adapter.selected.ref,
            adapterRuntimeProof,
        );
        const recordedCanonical = resolvedContract.canonical;
        recordedCanonicalForFailure = recordedCanonical;
        const legacyCompatibility = resolvedContract.legacyCompatibility;
        const expectedHermesRuntime = recordedCanonical.hermes_runtime;
        const continuationMode = executionAuthority.mode === 'pre_provider_continuation';
        let executionHermesRuntime = expectedHermesRuntime;
        let runtimeBindingDrift = false;
        if (adapter.selected.ref === 'cstar-forge-hermes-minimax-worker-adapter') {
            if (!expectedHermesRuntime) throw new Error('forge_request_hermes_runtime_missing');
            const currentHermesRuntime = await sealForgeHermesRuntimeExpectation(adapterRuntimeProof);
            if (!forgeHermesRuntimeExpectationEquals(currentHermesRuntime, expectedHermesRuntime)) {
                executionHermesRuntime = currentHermesRuntime;
            }
        }
        const canonical = canonicalizeForgeRequest(
            args,
            codeRoot,
            decisionId,
            adapter.selected.ref,
            request.write_capability,
            request.max_attempts,
            adapterRuntimeProof,
            executionHermesRuntime,
        );
        currentCanonicalForFailure = canonical;
        runtimeBindingDrift = hashForgeRuntimeBinding(recordedCanonical)
            !== hashForgeRuntimeBinding(canonical);
        const requestSha256 = hashCanonicalForgeRequest(canonical);
        if (continuationMode || runtimeBindingDrift) {
            assertForgeContinuationScope(recordedCanonical, canonical);
        }
        if (
            !continuationMode && !runtimeBindingDrift && (
            (legacyCompatibility
                ? requestSha256 !== hashCanonicalForgeRequest(recordedCanonical)
                    || stableJson(canonical) !== stableJson(recordedCanonical)
                : requestSha256 !== request.request_sha256
                    || stableJson(canonical) !== request.request_summary_json)
            || hashForgeTargetPaths(canonical) !== request.target_paths_sha256)
        ) {
            throw new Error('forge_execution_request_hash_mismatch');
        }
        if (hashForgeTargetPaths(canonical) !== request.target_paths_sha256) {
            throw new Error('forge_execution_target_paths_hash_mismatch');
        }
        if (continuationMode) {
            const continuation = getPendingForgeContinuation(readDb, request.request_id);
            if (!continuation
                || continuation.failure_fingerprint_sha256
                    !== executionAuthority.continuation_fingerprint) {
                throw new Error('forge_continuation_receipt_drift');
            }
            verifyForgeContinuationRepairBinding({
                root: controlRoot, db: readDb, continuation, request,
                authorization: executionAuthority.authorization,
                canonical, adapter_runtime: adapterRuntimeProof,
            });
        }
        // Only durable canonical paths may reach the model-visible adapter
        // intent. Raw execute arguments can be lexically different while
        // hashing to the same authority and therefore must not shape prompts.
        const invocationArgs = projectCanonicalForgeInvocationArgs(args, canonical);
        const executionReceiptId = buildForgeExecutionReceiptId(request.request_id, args.idempotency_key.trim());
        const oauthHorizon = executionHermesRuntime ? createForgeOAuthHorizon(
            invocationArgs, decisionId, executionReceiptId, adapter.selected, executionHermesRuntime,
        ) : null;
        const refreshedExecutionAuthority = await verifyForgeExecutionAuthorization(
            readDb,
            request,
            args.operator_authorization_ref,
            requestContext,
        );
        if (!forgeExecutionAuthorityMatches(executionAuthority, refreshedExecutionAuthority)) {
            throw new Error('forge_execution_authority_drift_before_reservation');
        }
        assertStableRuntimeReady();
        releaseReadDb();
        releaseReadDb = null;
        const reservation = reserveVerifiedForgeExecution({
            root: controlRoot,
            request,
            authorization: executionAuthority.authorization,
            args,
            executionReceiptId,
            adapterRef: adapter.selected.ref,
            canonical,
        });
        hallDb = reservation.db;
        if (reservation.kind === 'replay') {
            return buildForgeAttemptReplayResponse(
                args,
                reservation.attempt as unknown as Record<string, unknown>,
                reservation.current_request.status,
                getForgeContinuationByAttempt(hallDb, reservation.attempt.attempt_id),
            );
        }
        const currentRequest = reservation.current_request;
        const currentAuthorization = reservation.current_authorization;
        reservedAttemptId = reservation.attempt.attempt_id;
        if (runtimeBindingDrift && !continuationMode) {
            throw new Error('forge_hermes_request_runtime_drift');
        }
        const reservedHermesPreflight = executionHermesRuntime
            ? await preflightForgeHermesOAuthAfterReservation(
                invocationArgs, decisionId, executionReceiptId, controlRoot,
                adapter.selected, adapterRuntimeProof, executionHermesRuntime, oauthHorizon!,
            )
            : null;
        preparedInvocation = await prepareForgeHermesMinimaxAdapterInvocation(
            invocationArgs, decisionId, executionReceiptId, controlRoot, adapter.selected,
            adapterRuntimeProof, executionHermesRuntime, reservedHermesPreflight,
            oauthHorizon, codeRoot,
        );
        if (continuationMode) verifyPreparedForgeContinuationRepairBinding({
            root: controlRoot, db: hallDb, request: currentRequest, authorization: currentAuthorization,
            parent_attempt_id: args.retry_of_attempt_id!.trim(),
            continuation_fingerprint: executionAuthority.continuation_fingerprint!,
            canonical, adapter_runtime: adapterRuntimeProof,
            prepared_projection: preparedInvocation.workspaceProjection,
        });
        assertStableRuntimeReady();
        markForgeAttemptStarted(hallDb, reservation.attempt.attempt_id);
        const adapterResult = await invokeForgeHermesMinimaxAdapter(
            invocationArgs,
            decisionId,
            executionReceiptId,
            controlRoot,
            adapter.selected,
            adapterRuntimeProof,
            preparedInvocation,
        );
        adapterStarted = preparedInvocation.spendMayHaveStarted;
        preparedInvocation = null;
        const traceArtifactSha256 = typeof adapterResult.execution_trace_artifact?.sha256 === 'string'
            ? adapterResult.execution_trace_artifact.sha256
            : undefined;
        const runtimeDigest = typeof adapterResult.hermes_runtime_content_sha256 === 'string'
            ? adapterResult.hermes_runtime_content_sha256
            : null;
        const durableAdapterVersion = [adapter.selected.ref,
            runtimeDigest ? `hermes:${runtimeDigest}` : null,
            traceArtifactSha256 ? `trace:${traceArtifactSha256}` : null,
        ].filter(Boolean).join('@');
        completedAdapterVersion = durableAdapterVersion;
        const response = finalizeForgeAdapterExecutionResult({
            db: hallDb,
            args,
            request,
            attemptId: reservation.attempt.attempt_id,
            decisionId,
            executionReceiptId,
            adapterResult,
            adapterVersion: durableAdapterVersion,
            recordedCanonical,
            currentCanonical: canonical,
            surface,
            adapter,
            packageLockProofs,
        });
        reservedAttemptId = null;
        return response;
    } catch (error) {
        releaseReadDb?.();
        releaseReadDb = null;
        if (!executionAuthorizationVerified) {
            return preAuthorizationErrorResponse(
                'forge_execution_authorization_required',
                'Forge execution authorization was not established.',
            );
        }
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
                if (!invocationMayHaveStarted && recordedCanonicalForFailure) {
                    const continuationResponse = finalizeForgeKernelPreProviderFailure({
                        db: hallDb,
                        args,
                        attemptId: reservedAttemptId,
                        failureCode: message,
                        recordedCanonical: recordedCanonicalForFailure,
                        currentCanonical: currentCanonicalForFailure
                            ?? recordedCanonicalForFailure,
                    });
                    if (continuationResponse) {
                        reservedAttemptId = null;
                        return continuationResponse;
                    }
                }
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
