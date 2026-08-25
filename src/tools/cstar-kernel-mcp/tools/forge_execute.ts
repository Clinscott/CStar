import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { finalizeForgeAttempt, getForgeAttemptByIdempotency, getForgeAuthorizationByRequest, getForgeRequest, markForgeAttemptStarted, reserveForgeAttempt } from '../../pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../pennyone/intel/forge_validation_controller.js';
import { registry } from '../../pennyone/pathRegistry.js';
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
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    projectCanonicalForgeInvocationArgs,
    stableJson,
} from './forge_request_contract.js';
import { forgeHermesRuntimeExpectationEquals, sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { createForgeOAuthHorizon, preflightForgeHermesOAuthBeforeReservation } from './forge_hermes_oauth_contract.js';
import { forgeRequestAuthorityMatches, readForgeRequestBeforeMutation } from './forge_execute_request_authority.js';
import {
    forgeAuthorizationMatches,
    forgeExecutionAuthorityMatches,
    verifyForgeExecutionAuthorization,
    verifyForgeReplayAuthorization,
} from './forge_execution_authority.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import { buildForgeAttemptReplayResponse } from './forge_execute_replay.js';
import { resolveRecordedForgeExecutionContract } from './forge_legacy_v2_compatibility.js';
import { createForgeHandlerRuntimeReadinessAssertion, type ForgeRuntimeReadinessAssertion } from '../contracts/runtime.js';

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

        const root = registry.getRoot();
        const suppliedActionAuthority = resolveDispatchActionAuthority(args, root);
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

        await verifyCodexRequestIdentity(requestContext);
        const { db: readDb, request, release } = readForgeRequestBeforeMutation(
            root,
            args.forge_request_receipt_id,
        );
        releaseReadDb = release;
        await verifyForgeReplayAuthorization(
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
        const existingAttempt = getForgeAttemptByIdempotency(
            readDb,
            request.request_id,
            args.idempotency_key.trim(),
        );
        if (existingAttempt) {
            releaseReadDb();
            releaseReadDb = null;
            return markNonRecordablePreAuthorizationResponse(buildForgeAttemptReplayResponse(
                args,
                existingAttempt as unknown as Record<string, unknown>,
                request.status,
            ));
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
            assertForgeRequiredOutputsContained(root, args.target_paths, args.required_output_paths);
        }
        const adapterRuntimeProof = sealForgeAdapterRuntime(adapter.selected);

        if (request.live_source_allowed !== 0 || args.spend_policy.live_source_allowed === true) {
            throw new Error('forge_live_source_not_authorized');
        }
        const packageLockProofs = verifyDispatchPackageLocks(args.package_locks, root);
        const resolvedContract = await resolveRecordedForgeExecutionContract(
            request,
            executionAuthority.authorization,
            root,
            adapter.selected.ref,
            adapterRuntimeProof,
        );
        const recordedCanonical = resolvedContract.canonical;
        const legacyCompatibility = resolvedContract.legacyCompatibility;
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
            (legacyCompatibility
                ? requestSha256 !== hashCanonicalForgeRequest(recordedCanonical)
                    || stableJson(canonical) !== stableJson(recordedCanonical)
                : requestSha256 !== request.request_sha256
                    || stableJson(canonical) !== request.request_summary_json)
            || hashForgeTargetPaths(canonical) !== request.target_paths_sha256
        ) {
            throw new Error('forge_execution_request_hash_mismatch');
        }

        // Only durable canonical paths may reach the model-visible adapter
        // intent. Raw execute arguments can be lexically different while
        // hashing to the same authority and therefore must not shape prompts.
        const invocationArgs = projectCanonicalForgeInvocationArgs(args, canonical);
        const executionReceiptId = buildForgeExecutionReceiptId(request.request_id, args.idempotency_key.trim());
        const oauthHorizon = expectedHermesRuntime ? createForgeOAuthHorizon(
            invocationArgs, decisionId, executionReceiptId, adapter.selected, expectedHermesRuntime,
        ) : null;
        const preReservationHermesPreflight = expectedHermesRuntime
            ? await preflightForgeHermesOAuthBeforeReservation(
                invocationArgs, decisionId, executionReceiptId, root,
                adapter.selected, adapterRuntimeProof, expectedHermesRuntime, oauthHorizon!,
            )
            : null;
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
        hallDb = getForgeWritableDb(root);
        const currentRequest = getForgeRequest(hallDb, request.request_id);
        if (!currentRequest || !forgeRequestAuthorityMatches(request, currentRequest)) {
            throw new Error('forge_request_authority_drift_before_reservation');
        }
        const currentAuthorization = getForgeAuthorizationByRequest(hallDb, request.request_id);
        if (
            !currentAuthorization
            || !forgeAuthorizationMatches(executionAuthority.authorization, currentAuthorization)
        ) {
            throw new Error('forge_authorization_drift_before_reservation');
        }
        const racedAttempt = getForgeAttemptByIdempotency(
            hallDb,
            currentRequest.request_id,
            args.idempotency_key.trim(),
        );
        if (racedAttempt) {
            return buildForgeAttemptReplayResponse(
                args,
                racedAttempt as unknown as Record<string, unknown>,
                currentRequest.status,
            );
        }
        const reservation = reserveForgeAttempt(hallDb, {
            request_id: request.request_id,
            authorization_id: executionAuthority.authorization.authorization_id,
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
            return buildForgeAttemptReplayResponse(args, reservation.attempt as unknown as Record<string, unknown>, reservation.request.status);
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
            oauthHorizon,
        );
        assertStableRuntimeReady();
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
            required_metrics: canonical.required_metrics,
            artifact_expectations: canonical.artifact_expectations,
            prohibited_actions: canonical.prohibited_actions,
            requested_actions: canonical.requested_actions,
            action_authority: canonical.action_authority,
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
