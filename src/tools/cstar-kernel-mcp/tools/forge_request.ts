import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { saveForgeRequest } from '../../pennyone/intel/forge_request_authorization_controller.js';
import {
    activeForgeAuthorizationMatchesRequest,
    getForgeAuthorizationByRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { ROOT_USER_FORGE_INTENT_PROFILE } from '../../pennyone/intel/forge_authorization_policy.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { errorPayloadResponse, errorResponse, mcpErrorCode, mcpGuardrail, mcpMutation, preAuthorizationErrorResponse, preAuthorizationResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { findDispatchValidationError, hasDuplicatePackageLockMismatch, resolveDispatchSurface, verifyDispatchPackageLocks, type DispatchRequestArgs } from './dispatch_request.js';
import { resolveForgeExecutionAdapterRef, sealForgeAdapterRuntime } from './forge_adapters.js';
import { assertDispatchAdapterCapability, resolveDispatchActionAuthority } from './dispatch_action_authority.js';
import { assertForgeRequiredOutputsContained, buildForgeRequestId, canonicalizeForgeRequest, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson, type ForgeRequestContractArgs } from './forge_request_contract.js';
import { sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import { reconcileLegacyV2ForgeRequest } from './forge_legacy_v2_reconciliation.js';
import { findForgeRequestByDecisionBeforeMutation } from './forge_execute_request_authority.js';
import { isLegacyV2ForgeRequest } from './forge_request_route.js';
import { assertLiveForgeRuntimeReady } from '../contracts/runtime.js';
import { resolveForgeRuntimeRoots } from './forge_runtime_roots.js';
import { FORGE_NATIVE_CONNECTION_ID } from '../../../types/forge_native_swarm.js';
import { bindForgeNativeRequest, rejectNativeCallerAuthority } from './forge_native_request_binding.js';

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
        rejectNativeCallerAuthority(args);
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
        const nativeConnection = args.execution_adapter_ref?.trim() === FORGE_NATIVE_CONNECTION_ID;
        const legacyV2 = isLegacyV2ForgeRequest(controlRoot, args.bead_id!.trim(), decisionId);
        if (!legacyV2 && args.execution_adapter_ref?.trim() && !nativeConnection) throw new Error('forge_v3_legacy_execution_adapter_forbidden');
        const adapter = legacyV2
            ? resolveForgeExecutionAdapterRef(args.execution_adapter_ref)
            : { requested_ref: null, canonical_ref: null, found: false, selected: null, checked: [] };
        const liveRequested = args.spend_policy.mode === 'live_authorized';
        const writeCapability: 'project_files' | 'response_only' | null = adapter.selected?.write_capability === 'project_files'
            ? 'project_files'
            : adapter.selected?.write_capability === 'response_only'
                ? 'response_only'
                : actionAuthority.primary_action === 'project_files'
                    ? 'project_files'
                    : actionAuthority.primary_action === 'response_only' ? 'response_only' : null;
        if (legacyV2 && liveRequested && !adapter.selected) {
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
            && writeCapability === 'project_files'
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
        } else if (legacyV2 && liveRequested) {
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

        if (liveRequested && writeCapability === 'project_files') {
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

        const packageLockProofs = liveRequested
            ? verifyDispatchPackageLocks(args.package_locks, codeRoot)
            : [];
        const maxAttempts = 1;
        const selectedAdapter = adapter.selected;
        const adapterRuntimeProof = selectedAdapter ? sealForgeAdapterRuntime(selectedAdapter) : null;
        const hermesRuntimeExpectation = selectedAdapter?.ref === 'cstar-forge-hermes-minimax-worker-adapter'
            && adapterRuntimeProof
            ? await sealForgeHermesRuntimeExpectation(adapterRuntimeProof)
            : null;
        const canonical = canonicalizeForgeRequest(
            args as ForgeRequestContractArgs,
            codeRoot,
            decisionId,
            nativeConnection ? FORGE_NATIVE_CONNECTION_ID : selectedAdapter?.ref ?? adapter.canonical_ref,
            writeCapability,
            maxAttempts,
            adapterRuntimeProof,
            hermesRuntimeExpectation,
        );
        const requestSha256 = hashCanonicalForgeRequest(canonical);
        const requestId = buildForgeRequestId(requestSha256);
        const nativeBinding = nativeConnection
            ? bindForgeNativeRequest({
                request: {
                    request_id: requestId,
                    request_sha256: requestSha256,
                    bead_id: canonical.bead_id,
                    decision_id: canonical.decision_id,
                    request_summary_json: stableJson(canonical),
                    target_paths_sha256: hashForgeTargetPaths(canonical),
                    adapter_ref: FORGE_NATIVE_CONNECTION_ID,
                    write_capability: canonical.write_capability,
                },
                canonical,
                code_root: codeRoot,
                control_root: controlRoot,
                caller: args,
            })
            : null;
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
                    if (!adapter.selected) throw new Error('missing_authorized_execution_adapter');
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
        const db = getForgeWritableDb(controlRoot);
        const saved = saveForgeRequest(db, {
            request_id: requestId,
            repo_id: buildHallRepositoryId(normalizeHallPath(controlRoot)),
            bead_id: args.bead_id!.trim(),
            decision_id: decisionId,
            request_sha256: requestSha256,
            request_summary_json: stableJson(canonical),
            target_paths_sha256: hashForgeTargetPaths(canonical),
            live_source_allowed: false,
            max_attempts: maxAttempts,
            requester_thread_id: requesterIdentity.thread_id,
            requester_turn_id: requesterIdentity.turn_id,
            requester_record_set_sha256: requesterIdentity.turn_record_set_sha256,
            authorization_profile: liveRequested
                ? ROOT_USER_FORGE_INTENT_PROFILE
                : undefined,
            adapter_ref: nativeConnection ? FORGE_NATIVE_CONNECTION_ID : selectedAdapter?.ref,
            write_capability: writeCapability ?? undefined,
        });

        const authorization = getForgeAuthorizationByRequest(db, saved.request.request_id);
        const authorizationBound = activeForgeAuthorizationMatchesRequest(
            saved.request,
            authorization,
        );
        const authorizationExpired = authorizationBound
            && authorization.expires_at <= Date.now();
        const authorizationCurrentTurn = authorizationBound
            && authorization.operator_thread_id === requesterIdentity.thread_id
            && authorization.operator_turn_id === requesterIdentity.turn_id
            && authorization.operator_record_set_sha256
                === requesterIdentity.turn_record_set_sha256;
        const terminalRequest = ['SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS', 'REVOKED']
            .includes(saved.request.status);
        const ready = liveRequested && authorizationBound
            && authorizationCurrentTurn && !authorizationExpired && !terminalRequest;
        const historicalAuthorization = liveRequested && authorizationBound
            && !authorizationCurrentTurn && !authorizationExpired && !terminalRequest;
        return textResponse({
            status: !liveRequested
                ? 'no_spend_request_recorded'
                : terminalRequest ? 'terminal_request_replayed'
                : authorizationExpired ? 'authorization_expired_replayed'
                : historicalAuthorization ? 'authorized_request_historical_retrieval'
                : ready ? 'authorized_request_replayed' : 'pending_authorization_recorded',
            dispatch_kind: 'forge',
            decision_id: decisionId,
            receipt_id: requestId,
            bead_id: args.bead_id,
            request_sha256: requestSha256,
            request_replayed: saved.replayed,
            legacy_challenge_upgraded: saved.challenge_upgraded,
            request_status: saved.request.status,
            max_attempts: saved.request.max_attempts,
            expires_at: saved.request.expires_at ?? null,
            authorization_profile: saved.request.authorization_profile ?? null,
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
            target_paths_sha256: saved.request.target_paths_sha256,
            package_lock_proofs: packageLockProofs,
            authorized_dispatch_surface: surface,
            authorized_execution_adapter: adapter,
            adapter_runtime_proof: adapterRuntimeProof,
            hermes_runtime_expectation: hermesRuntimeExpectation,
            action_authority: canonical.action_authority,
            prohibited_actions: canonical.prohibited_actions,
            requested_actions: canonical.requested_actions,
            native_request: nativeBinding?.request ?? null,
            native_scope_sha256: nativeBinding?.scope_sha256 ?? null,
            native_evidence_root: nativeBinding?.evidence_root ?? null,
            dispatch_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: !liveRequested
                    ? 'no_live_execution_requested'
                    : terminalRequest
                        ? `terminal_forge_request_${saved.request.status.toLowerCase()}`
                        : authorizationExpired
                            ? 'forge_authorization_expired'
                        : historicalAuthorization
                            ? 'forge_authorization_turn_mismatch'
                    : ready ? null : 'root_user_forge_intent_required',
            },
            guardrail: mcpGuardrail(
                terminalRequest || authorizationExpired || historicalAuthorization
                    ? 'block'
                    : !liveRequested || ready ? 'allow' : 'caution',
                terminalRequest || authorizationExpired || historicalAuthorization
                    ? 'refuse'
                    : !liveRequested || ready ? 'continue' : 'verify',
                !liveRequested
                    ? 'The durable request records a no-spend contract and grants no live execution authority.'
                    : terminalRequest
                        ? 'The immutable Forge request is terminal and cannot receive another authorization or attempt.'
                        : authorizationExpired
                            ? 'The request-bound authorization expired before a new attempt could be reserved.'
                        : historicalAuthorization
                            ? 'The request has a valid historical authorization, but only its exact authorizing turn may reserve the attempt.'
                    : ready
                    ? 'The immutable request already has a hash-bound one-shot authorization receipt.'
                    : 'The immutable request is pending one exact work-referenced root-user Forge intent; no live authority is bound.',
                terminalRequest
                    ? [`terminal_forge_request_${saved.request.status.toLowerCase()}`]
                    : authorizationExpired
                        ? ['forge_authorization_expired']
                        : historicalAuthorization
                            ? ['forge_authorization_turn_mismatch']
                        : !liveRequested || ready ? [] : ['root_user_forge_intent_required'],
                ['durable_forge_request'],
            ),
            next_action: !liveRequested
                ? 'No live execution is authorized by this receipt.'
                : terminalRequest
                    ? 'Use the original idempotency key only to retrieve its durable attempt; do not authorize or spend again.'
                    : authorizationExpired
                        ? 'Do not execute this expired grant; record a new operator decision if another attempt is wanted.'
                    : historicalAuthorization
                        ? 'Treat this as historical retrieval only; do not reserve or execute a new attempt from this turn.'
                : ready
                    ? 'Call cstar_forge_execute once from the same authorizing turn with a stable idempotency_key.'
                    : 'Call cstar_forge_authorize with this receipt id and hash while the current root-user build instruction is active; if the work reference is missing or ambiguous, ask one human-readable clarification.',
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
