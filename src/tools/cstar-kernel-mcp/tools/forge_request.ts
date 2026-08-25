import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { activeForgeAuthorizationMatchesRequest, getForgeAuthorizationByRequest, getForgeRequest }
    from '../../pennyone/intel/forge_receipt_controller.js';
import { getForgeMissionGrantByRequest }
    from '../../pennyone/intel/forge_mission_grant_controller.js';
import { isForgeMissionGrantCandidate, missionGrantInputFromSetAuthority }
    from '../../pennyone/intel/forge_mission_grant_scope.js';
import { errorPayloadResponse, errorResponse, mcpErrorCode, mcpGuardrail, mcpMutation,
    preAuthorizationErrorResponse, preAuthorizationResponse, textResponse,
    type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    findDispatchValidationError,
    hasDuplicatePackageLockMismatch,
    resolveDispatchSurface,
    type DispatchRequestArgs,
} from './dispatch_request.js';
import { resolveForgeExecutionAdapterRef } from './forge_adapters.js';
import { assertDispatchAdapterCapability, resolveDispatchActionAuthority }
    from './dispatch_action_authority.js';
import {
    assertForgeRequiredOutputsContained,
    stableJson,
} from './forge_request_contract.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import { reconcileLegacyV2ForgeRequest } from './forge_legacy_v2_reconciliation.js';
import { findForgeRequestByDecisionBeforeMutation } from './forge_execute_request_authority.js';
import { assertLiveForgeRuntimeReady } from '../contracts/runtime.js';
import { resolveForgeRuntimeRoots } from './forge_runtime_roots.js';
import { verifyPendingForgeSetManifestAuthority } from './forge_set_manifest_autonomous_authority.js';
import { isForgeAutonomousPolicyCandidate, verifyPendingForgeAutonomousPolicyAuthority }
    from './forge_autonomous_policy_authority.js';
import {
    authorizePreparedForgeMissionGrant,
    persistPreparedForgeRequest,
    prepareForgeRequestMaterialization,
} from '../../pennyone/intel/forge_request_materialization.js';
import { autoAuthorizePendingForgeRequest } from './forge_request_auto_authorization.js';
export interface ForgeRequestArgs extends DispatchRequestArgs {
    execution_adapter_ref?: string;
}
function forgeRequestValidationError(args: ForgeRequestArgs): string | null {
    const baseError = findDispatchValidationError(args, {
        require_operator_authorization_ref: false,
    });
    if (baseError) return baseError;
    if (!args.bead_id?.trim()) return 'Forge requests require an explicit bead_id';
    if (!args.decision_id?.trim()) return 'Forge requests require an explicit decision_id';
    if (!args.target_paths || args.target_paths.length === 0) {
        return 'Forge requests require nonempty target_paths';
    }
    if (hasDuplicatePackageLockMismatch(args.package_locks)) {
        return 'package_locks contain inconsistent hashes for the same path';
    }
    if (args.spend_policy.mode === 'live_authorized') {
        if (args.spend_policy.operator_authorization_ref?.trim()) {
            return 'legacy freeform operator_authorization_ref is forbidden; use root-user Forge intent';
        }
        if (!args.execution_adapter_ref?.trim()) {
            return 'live Forge requests require execution_adapter_ref';
        }
        if (args.spend_policy.live_source_allowed === true) {
            return 'the bootstrap Forge authorization does not permit live source collection';
        }
        if ((args.spend_policy.max_retries ?? 0) !== 0 || (args.retry_policy?.budget ?? 0) !== 0) {
            return 'the bootstrap Forge authorization permits one attempt and zero retries';
        }
    }
    return null;
}
export async function handleForgeRequest(
    args: ForgeRequestArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    let requestIdentityVerified = false;
    try {
        const validationError = forgeRequestValidationError(args);
        const decisionId = args.decision_id?.trim() ?? '';
        if (validationError) {
            return preAuthorizationResponse({
                status: 'rejected',
                dispatch_kind: 'forge',
                decision_id: decisionId || null,
                bead_id: args.bead_id ?? null,
                error: validationError,
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'Forge request failed its durable request contract.',
                    ['forge_request_contract'],
                    ['request_validation'],
                ),
            }, 'forge_request_contract_invalid', validationError);
        }
        const { controlRoot, codeRoot } = resolveForgeRuntimeRoots();
        const actionAuthority = resolveDispatchActionAuthority(args, codeRoot);
        const surface = resolveDispatchSurface('forge', args);
        if (!surface.found) {
            return preAuthorizationResponse({
                status: 'blocked',
                dispatch_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id,
                error: 'missing_authorized_dispatch_surface',
                authorized_dispatch_surface: surface,
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'The canonical Forge contract surface is unavailable.',
                    ['missing_authorized_dispatch_surface'],
                    ['dispatch_authority'],
                ),
            }, 'missing_authorized_dispatch_surface');
        }

        const adapter = resolveForgeExecutionAdapterRef(args.execution_adapter_ref);
        const liveRequested = args.spend_policy.mode === 'live_authorized';
        if (liveRequested && !adapter.selected) {
            return preAuthorizationResponse({
                status: 'blocked',
                dispatch_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id,
                error: 'missing_authorized_execution_adapter',
                authorized_execution_adapter: adapter,
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'The requested Forge adapter is not registered and sealed.',
                    ['missing_authorized_execution_adapter'],
                    ['forge_adapter_registration'],
                ),
            }, 'missing_authorized_execution_adapter');
        }
        if (
            liveRequested
            && adapter.selected?.write_capability === 'project_files'
            && (!args.required_output_paths || args.required_output_paths.length === 0)
        ) {
            return preAuthorizationResponse({
                status: 'blocked',
                dispatch_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id,
                error: 'project_files_adapter_requires_required_output_paths',
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'A file-writing Forge request must name every required delivery path explicitly.',
                    ['project_files_adapter_requires_required_output_paths'],
                    ['forge_output_completeness'],
                ),
            }, 'project_files_adapter_requires_required_output_paths');
        }
        if (adapter.selected) {
            try {
                assertDispatchAdapterCapability(
                    actionAuthority,
                    adapter.selected.write_capability,
                    { require_adapter: liveRequested },
                );
            } catch (error) {
                const reason = error instanceof Error
                    ? error.message
                    : 'dispatch_action_adapter_capability_mismatch';
                return preAuthorizationResponse({
                    status: 'blocked',
                    dispatch_kind: 'forge',
                    decision_id: decisionId,
                    bead_id: args.bead_id,
                    error: reason,
                    guardrail: mcpGuardrail(
                        'block',
                        'refuse',
                        'The selected adapter capability does not exactly match the canonical primary action.',
                        [reason],
                        ['dispatch_action_authority', 'forge_adapter_capability'],
                    ),
                }, mcpErrorCode(reason, 'dispatch_action_adapter_capability_mismatch'), reason);
            }
        } else if (liveRequested) {
            return preAuthorizationResponse({
                status: 'blocked',
                dispatch_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id,
                error: 'dispatch_action_adapter_capability_missing',
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'A live Forge request requires an adapter whose capability exactly matches its canonical primary action.',
                    ['dispatch_action_adapter_capability_missing'],
                    ['dispatch_action_authority', 'forge_adapter_capability'],
                ),
            }, 'dispatch_action_adapter_capability_missing');
        }

        const requesterIdentity = await verifyCodexRequestIdentity(requestContext);
        requestIdentityVerified = true;
        if (liveRequested) assertLiveForgeRuntimeReady();

        if (liveRequested && adapter.selected?.write_capability === 'project_files') {
            try {
                assertForgeRequiredOutputsContained(codeRoot, args.target_paths, args.required_output_paths);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                return errorPayloadResponse({
                    status: 'blocked',
                    dispatch_kind: 'forge',
                    decision_id: decisionId,
                    bead_id: args.bead_id,
                    error: reason,
                    guardrail: mcpGuardrail(
                        'block',
                        'refuse',
                        'Every required output must be contained by an explicit target before authorization is accepted.',
                        [reason],
                        ['forge_output_containment'],
                    ),
                }, mcpErrorCode(reason, 'forge_required_output_containment_invalid'), reason);
            }
        }

        const selectedAdapter = adapter.selected;
        const prepared = await prepareForgeRequestMaterialization({
            args, code_root: codeRoot, decision_id: decisionId, adapter,
        });
        const packageLockProofs = prepared.package_lock_proofs;
        const adapterRuntimeProof = prepared.canonical.adapter_runtime;
        const hermesRuntimeExpectation = prepared.canonical.hermes_runtime;
        const canonical = prepared.canonical;
        const existingByDecision = findForgeRequestByDecisionBeforeMutation(
            controlRoot,
            args.bead_id!.trim(),
            decisionId,
        );
        try {
            const existing = existingByDecision.request;
            if (existing) {
                let existingSchema: unknown;
                try {
                    const parsedExisting = JSON.parse(existing.request_summary_json) as unknown;
                    existingSchema = parsedExisting && typeof parsedExisting === 'object'
                        && !Array.isArray(parsedExisting)
                        ? (parsedExisting as Record<string, unknown>).schema
                        : null;
                } catch {
                    throw new Error('forge_request_summary_invalid');
                }
                if (existingSchema === 'cstar.forge_request.v2') {
                    if (!liveRequested || !adapterRuntimeProof || !hermesRuntimeExpectation) {
                        throw new Error('forge_legacy_v2_reconciliation_requires_live_worker_contract');
                    }
                    existingByDecision.release();
                    const reconciliation = reconcileLegacyV2ForgeRequest({
                        request: existing,
                        attempt_count: existingByDecision.attemptCount,
                        root: controlRoot,
                        canonical,
                        adapter_runtime: adapterRuntimeProof,
                        hermes_runtime: hermesRuntimeExpectation,
                        requester_identity: requesterIdentity,
                    });
                    const compatibility = reconciliation.compatibility;
                    return textResponse({
                        status: 'legacy_v2_compatibility_pending',
                        dispatch_kind: 'forge',
                        decision_id: decisionId,
                        receipt_id: reconciliation.request.request_id,
                        bead_id: reconciliation.request.bead_id,
                        request_sha256: reconciliation.request.request_sha256,
                        request_replayed: true,
                        compatibility_requester_lineage_replayed: reconciliation.requester_lineage_replayed,
                        legacy_challenge_upgraded: false,
                        request_status: reconciliation.request.status,
                        max_attempts: reconciliation.request.max_attempts,
                        expires_at: null,
                        authorization_profile: 'exact_request_challenge_v1',
                        authorization_challenge: reconciliation.authorization_challenge,
                        authorization_challenge_sha256: reconciliation.authorization_challenge_sha256,
                        authorization_manifest: {
                            schema: 'cstar.forge_v2_compatibility_authorization_manifest.v1',
                            request_sha256: reconciliation.request.request_sha256,
                            compatibility_manifest_sha256: reconciliation.compatibility_sha256,
                            compatibility_manifest: compatibility,
                            compatibility_manifest_json: stableJson(compatibility),
                        },
                        target_paths: compatibility.effective_request.target_paths,
                        required_output_paths: compatibility.effective_request.required_output_paths,
                        target_paths_sha256: reconciliation.request.target_paths_sha256,
                        package_lock_proofs: packageLockProofs,
                        authorized_dispatch_surface: surface,
                        authorized_execution_adapter: adapter,
                        adapter_runtime_proof: adapterRuntimeProof,
                        hermes_runtime_expectation: hermesRuntimeExpectation,
                        action_authority: compatibility.effective_request.action_authority,
                        prohibited_actions: compatibility.effective_request.prohibited_actions,
                        requested_actions: compatibility.effective_request.requested_actions,
                        dispatch_execution: {
                            attempted: false,
                            live_spend: false,
                            live_source_collection: false,
                            codex_worker_fallback_allowed: false,
                            fail_closed_reason: 'exact_v2_compatibility_challenge_required',
                        },
                        mutation: reconciliation.requester_lineage_replayed ? null : mcpMutation(
                            'forge_legacy_v2_requester_lineage_bind',
                            reconciliation.request.request_id,
                            'Verified reconciliation identity was bound once without changing the legacy request JSON or hashes.',
                        ),
                        guardrail: mcpGuardrail(
                            'caution',
                            'verify',
                            'The immutable legacy request is unchanged. A fresh exact challenge binds its synthetic-only typed-action overlay and current sealed runtime before one attempt can be reserved.',
                            ['exact_v2_compatibility_challenge_required'],
                            ['durable_forge_request', 'forge_v2_compatibility_manifest'],
                        ),
                        next_action: 'Legacy v2 recovery retains its exact compatibility challenge internally; do not surface it in the normal operator workflow.',
                    });
                }
            }
        } finally {
            existingByDecision.release();
        }
        const requestSha256 = prepared.request_sha256;
        const requestId = prepared.request_id;
        const db = getForgeWritableDb(controlRoot);
        const saved = persistPreparedForgeRequest({
            db,
            control_root: controlRoot,
            code_root: codeRoot,
            prepared,
            requester: requesterIdentity,
        });
        let currentRequest = saved.request;
        let authorization = getForgeAuthorizationByRequest(db, currentRequest.request_id);
        if (liveRequested && !authorization && currentRequest.status === 'PENDING_AUTH') {
            if (isForgeAutonomousPolicyCandidate(db, currentRequest)) {
                const authority = verifyPendingForgeAutonomousPolicyAuthority({
                    db, request: currentRequest, caller: requesterIdentity,
                });
                authorization = authorizePreparedForgeMissionGrant({
                    db,
                    control_root: controlRoot,
                    code_root: codeRoot,
                    prepared,
                    request: currentRequest,
                    grant: authority.grant,
                }).authorization;
                currentRequest = getForgeRequest(db, currentRequest.request_id)!;
            } else if (isForgeMissionGrantCandidate(db, currentRequest)) {
                try {
                    const authority = verifyPendingForgeSetManifestAuthority({
                        db, request: currentRequest, caller: requesterIdentity,
                    });
                    authorization = authorizePreparedForgeMissionGrant({
                        db,
                        control_root: controlRoot,
                        code_root: codeRoot,
                        prepared,
                        request: currentRequest,
                        grant: missionGrantInputFromSetAuthority(currentRequest, authority),
                    }).authorization;
                    currentRequest = getForgeRequest(db, currentRequest.request_id)!;
                } catch (error) {
                    if ((error as Error).message !== 'forge_set_manifest_operator_signal_missing') throw error;
                }
            }
            if (!authorization && !isForgeMissionGrantCandidate(db, currentRequest)) {
                await autoAuthorizePendingForgeRequest(
                    db,
                    currentRequest.request_id,
                    currentRequest.request_sha256,
                    requestContext,
                );
                currentRequest = getForgeRequest(db, currentRequest.request_id)!;
                authorization = getForgeAuthorizationByRequest(db, currentRequest.request_id);
            }
        }
        const missionGrant = getForgeMissionGrantByRequest(db, currentRequest.request_id);
        const autonomousPolicy = missionGrant !== null
            && isForgeAutonomousPolicyCandidate(db, currentRequest);
        const authorizationBound = activeForgeAuthorizationMatchesRequest(
            currentRequest,
            authorization,
        );
        const authorizationExpired = authorizationBound
            && authorization!.expires_at <= Date.now();
        const authorizationCurrentTurn = authorizationBound
            && authorization!.operator_thread_id === requesterIdentity.thread_id
            && authorization!.operator_turn_id === requesterIdentity.turn_id
            && authorization!.operator_record_set_sha256 === requesterIdentity.turn_record_set_sha256;
        const terminalRequest = ['SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS', 'REVOKED']
            .includes(currentRequest.status);
        const ready = liveRequested && authorizationBound
            && (missionGrant !== null || authorizationCurrentTurn)
            && !authorizationExpired && !terminalRequest;
        const historicalAuthorization = liveRequested && authorizationBound
            && missionGrant === null && !authorizationCurrentTurn
            && !authorizationExpired && !terminalRequest;
        return textResponse({
            status: !liveRequested
                ? 'no_spend_request_recorded'
                : terminalRequest ? 'terminal_request_replayed'
                : authorizationExpired ? 'authorization_expired_replayed'
                : historicalAuthorization ? 'authorized_request_historical_retrieval'
                : ready ? (missionGrant ? 'AUTHORIZED' : 'authorized_request_replayed')
                    : 'pending_authorization_recorded',
            dispatch_kind: 'forge',
            decision_id: decisionId,
            receipt_id: requestId,
            bead_id: args.bead_id,
            request_sha256: requestSha256,
            request_replayed: saved.replayed,
            request_corrected: saved.superseded_request_id !== undefined,
            superseded_receipt_id: saved.superseded_request_id ?? null,
            legacy_challenge_upgraded: saved.challenge_upgraded,
            request_status: currentRequest.status,
            max_attempts: currentRequest.max_attempts,
            expires_at: currentRequest.expires_at ?? null,
            authorization_profile: currentRequest.authorization_profile ?? null,
            operator_authorization_ref: authorization?.operator_authorization_ref ?? null,
            mission_grant_id: missionGrant?.mission_grant_id ?? null,
            mission_grant_status: missionGrant?.status ?? null,
            authorization_challenge: null,
            authorization_challenge_sha256: null,
            authorization_manifest: liveRequested ? {
                schema: 'cstar.forge_authorization_manifest.v1',
                request_sha256: requestSha256,
                canonical_request: canonical,
                canonical_request_json: stableJson(canonical),
            } : null,
            target_paths: canonical.target_paths,
            required_output_paths: canonical.required_output_paths,
            target_paths_sha256: currentRequest.target_paths_sha256,
            package_lock_proofs: packageLockProofs,
            authorized_dispatch_surface: surface,
            authorized_execution_adapter: adapter,
            adapter_runtime_proof: adapterRuntimeProof,
            hermes_runtime_expectation: hermesRuntimeExpectation,
            action_authority: canonical.action_authority,
            prohibited_actions: canonical.prohibited_actions,
            requested_actions: canonical.requested_actions,
            dispatch_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: !liveRequested
                    ? 'no_live_execution_requested'
                    : terminalRequest
                        ? `terminal_forge_request_${currentRequest.status.toLowerCase()}`
                        : authorizationExpired
                            ? 'forge_authorization_expired'
                        : historicalAuthorization
                            ? 'forge_authorization_turn_mismatch'
                    : ready ? null : 'root_user_forge_intent_required',
            },
            guardrail: mcpGuardrail(
                terminalRequest || authorizationExpired || historicalAuthorization
                    ? 'block' : !liveRequested || ready ? 'allow' : 'caution',
                terminalRequest || authorizationExpired || historicalAuthorization
                    ? 'refuse' : !liveRequested || ready ? 'continue' : 'verify',
                ready
                    ? 'The immutable request has a hash-bound request-scoped authorization receipt.'
                    : terminalRequest || authorizationExpired || historicalAuthorization
                        ? 'The immutable request cannot reserve a new attempt.'
                        : 'The immutable request grants no current live execution authority.',
                terminalRequest
                    ? [`terminal_forge_request_${currentRequest.status.toLowerCase()}`]
                    : authorizationExpired
                        ? ['forge_authorization_expired']
                        : historicalAuthorization
                            ? ['forge_authorization_turn_mismatch']
                        : !liveRequested || ready ? [] : ['root_user_forge_intent_required'],
                ['durable_forge_request'],
            ),
            next_action: !liveRequested
                ? 'No live execution is authorized by this receipt.'
                : ready
                    ? missionGrant
                        ? autonomousPolicy
                            ? 'CStar may call cstar_forge_execute once from this same-root structural workflow with a stable idempotency_key.'
                            : 'Call cstar_forge_execute from a later root-thread turn with a stable idempotency_key.'
                        : 'Call cstar_forge_execute once from the same authorizing turn with a stable idempotency_key.'
                    : 'Do not execute; use compatibility authorization only for an eligible pending legacy receipt.',
        });
    } catch (error) {
        return requestIdentityVerified
            ? errorResponse(error)
            : preAuthorizationErrorResponse(
                mcpErrorCode(error, 'forge_request_pre_authorization_failed'),
                error,
            );
    }
}
