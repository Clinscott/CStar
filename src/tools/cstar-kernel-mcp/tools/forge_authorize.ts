import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { getForgeAuthorizationByRequest, getForgeRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import { authorizeForgeRequest } from '../../pennyone/intel/forge_request_authorization_controller.js';
import { forgeOperatorIntentProjectionJson, hashRootUserForgeIntentBinding, LEGACY_EXACT_FORGE_CHALLENGE_PROFILE, ROOT_USER_FORGE_INTENT_PROFILE } from '../../pennyone/intel/forge_authorization_policy.js';
import { registry } from '../../pennyone/pathRegistry.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { errorResponse, mcpErrorCode, mcpGuardrail, mcpMutation, preAuthorizationErrorResponse, preAuthorizationResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { hashForgeAuthorizationChallenge, verifyCurrentForgeAuthorizationChallenge } from './forge_authorization_challenge.js';
import { verifyCurrentForgeOperatorIntent, type VerifiedForgeOperatorIntent } from './forge_operator_intent_attestation.js';
import { resolveForgeOperatorWorkItem } from './forge_operator_work_item_resolution.js';
import { resolveForgeExecutionAdapterRef, sealForgeAdapterRuntime } from './forge_adapters.js';
import { assertDispatchAdapterCapability } from './dispatch_action_authority.js';
import { verifyDispatchPackageLocks } from './dispatch_request.js';
import { buildLegacyV2ExecutionGrant, hashLegacyV2ExecutionGrant, type LegacyV2ExecutionGrant } from './forge_legacy_v2_compatibility.js';
import { sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { verifyCodexRequestIdentity, type VerifiedCodexRequestIdentity } from './operator_authorization.js';
import { buildForgeRequestId, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson, type CanonicalForgeRequest } from './forge_request_contract.js';
import { forgeRequestAuthorityMatches, readForgeRequestBeforeMutation } from './forge_execute_request_authority.js';
import { assertLiveForgeRuntimeReady } from '../contracts/runtime.js';
import { revalidateForgeGoalResumeV2Authority, verifyForgeGoalResumeV2Authority } from './forge_goal_resume_v2_authority.js';
import { isGoalResumeV1Id, isGoalResumeV2Id } from '../../pennyone/intel/goal_resume_v2_contract.js';
import { revalidateForgeSetManifestAuthority, verifyCurrentForgeSetManifestAuthority } from './forge_set_manifest_authority.js';
import { parseForgeStructuralCaller, verifyPendingForgeSetManifestAuthority, verifyPersistedForgeSetManifestAuthority } from './forge_set_manifest_autonomous_authority.js';
import { buildForgeRootRepairContinuationIntent, isForgeRootRepairContinuationReference } from '../../pennyone/intel/forge_request_root_repair_binding.js';
import { FORGE_NATIVE_CONNECTION_ID } from '../../../types/forge_native_swarm.js';
import { bindForgeNativeAuthorization, deriveNativeAuthorizationIntent } from './forge_native_authorization_binding.js';
import { bindForgeNativeRequest, rejectNativeCallerAuthority } from './forge_native_request_binding.js';
import { resolveForgeRuntimeRoots } from './forge_runtime_roots.js';
export interface ForgeAuthorizeArgs { forge_request_receipt_id: string; request_sha256: string; goal_resume_id?: string; }
function assertPendingChallengePolicy(requestSummary: CanonicalForgeRequest): void {
    if (
        requestSummary.schema !== 'cstar.forge_request.v3'
        || requestSummary.spend_policy.mode !== 'live_authorized'
        || requestSummary.spend_policy.max_retries !== 0
        || requestSummary.spend_policy.live_source_allowed !== false
        || requestSummary.retry_budget !== 0
        || requestSummary.fixture_policy !== 'synthetic_only'
        || requestSummary.max_attempts !== 1
        || (requestSummary.adapter_ref !== null && requestSummary.adapter_ref !== FORGE_NATIVE_CONNECTION_ID)
        || !requestSummary.write_capability
    ) {
        throw new Error('forge_authorization_request_policy_invalid');
    }
}
function assertUnusedCurrentTurn(db: ReturnType<typeof getForgeWritableDb>, repoId: string,
    requestId: string, intent: VerifiedForgeOperatorIntent): void {
    if (intent.binding_mode !== 'current_turn_continuation') return;
    const reused = db.prepare(
        'SELECT 1 FROM hall_forge_requests r JOIN hall_forge_authorizations z ON z.request_id = r.request_id '
        + 'WHERE r.repo_id = ? AND r.request_id <> ? AND r.requester_thread_id = ? '
        + 'AND r.requester_turn_id = ? LIMIT 1',
    ).get(repoId, requestId, intent.thread_id, intent.turn_id);
    if (reused) throw new Error('forge_operator_intent_current_turn_reused');
}

export async function handleForgeAuthorize(
    args: ForgeAuthorizeArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    let requestIdentityVerified = false;
    let operatorAuthorizationVerified = false;
    let requestReadFailed = false;
    let requestReadWithValidIdentity = false;
    let releaseReadDb: (() => void) | null = null;
    try {
        rejectNativeCallerAuthority(args);
        const requestId = args.forge_request_receipt_id?.trim();
        const requestSha256 = args.request_sha256?.trim().toLowerCase();
        const goalResumeId = args.goal_resume_id || undefined;
        if (!/^dispatch-forge-[a-f0-9]{32}$/.test(requestId ?? '')) {
            throw new Error('forge_authorization_request_id_invalid');
        }
        if (!/^[a-f0-9]{64}$/.test(requestSha256 ?? '')) {
            throw new Error('forge_authorization_request_sha256_invalid');
        }
        if (goalResumeId && !isGoalResumeV1Id(goalResumeId) && !isGoalResumeV2Id(goalResumeId)) {
            throw new Error('forge_goal_resume_id_invalid');
        }
        if (goalResumeId && isGoalResumeV1Id(goalResumeId)) {
            throw new Error('forge_goal_resume_v1_historical_only');
        }
        const structuralCaller = parseForgeStructuralCaller(requestContext);
        let requestIdentity: VerifiedCodexRequestIdentity | null = null;
        const ensureFullIdentity = async (): Promise<VerifiedCodexRequestIdentity> => {
            if (!requestIdentity) requestIdentity = await verifyCodexRequestIdentity(requestContext);
            requestIdentityVerified = true;
            return requestIdentity;
        };
        let naturalIntent: Awaited<ReturnType<typeof verifyCurrentForgeOperatorIntent>> | null = null;
        let naturalIntentError: unknown;
        let setManifestAuthority: Awaited<
            ReturnType<typeof verifyCurrentForgeSetManifestAuthority>
        > = null;
        let pendingSetManifestAuthority: ReturnType<
            typeof verifyPendingForgeSetManifestAuthority
        > | null = null;
        let persistedSetManifestAuthority: ReturnType<
            typeof verifyPersistedForgeSetManifestAuthority
        > | null = null;
        const root = registry.getRoot();
        let requestRead: ReturnType<typeof readForgeRequestBeforeMutation>;
        try {
            requestRead = readForgeRequestBeforeMutation(root, requestId!);
        } catch (error) {
            requestReadFailed = true;
            await ensureFullIdentity();
            requestReadWithValidIdentity = true;
            throw error;
        }
        const { db: readDb, request, release } = requestRead;
        releaseReadDb = release;
        if (request.request_sha256 !== requestSha256) {
            throw new Error('forge_authorization_request_hash_mismatch');
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(request.request_summary_json);
        } catch {
            throw new Error('forge_request_summary_invalid');
        }
        let executionGrant: LegacyV2ExecutionGrant | null = null;
        const parsedSchema = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>).schema
            : null;
        let nativeConnection = false;
        let nativeRequestBinding: ReturnType<typeof bindForgeNativeRequest> | null = null;
        let nativeAuthorizationBinding: ReturnType<typeof bindForgeNativeAuthorization> | null = null;
        if (parsedSchema === 'cstar.forge_request.v2') {
            const adapter = resolveForgeExecutionAdapterRef(request.adapter_ref);
            if (!adapter.selected
                || adapter.selected.ref !== 'cstar-forge-hermes-minimax-worker-adapter') {
                throw new Error('forge_legacy_v2_execution_adapter_unavailable');
            }
            const adapterRuntime = sealForgeAdapterRuntime(adapter.selected);
            const hermesRuntime = await sealForgeHermesRuntimeExpectation(adapterRuntime);
            executionGrant = buildLegacyV2ExecutionGrant(
                request,
                root,
                adapterRuntime,
                hermesRuntime,
            );
            assertDispatchAdapterCapability(
                executionGrant.effective_request.action_authority,
                adapter.selected.write_capability,
                { require_adapter: true },
            );
            verifyDispatchPackageLocks(executionGrant.effective_request.package_locks, root);
        } else {
            const canonical = parsed as CanonicalForgeRequest;
            assertPendingChallengePolicy(canonical);
            if (
                stableJson(canonical) !== request.request_summary_json
                || hashCanonicalForgeRequest(canonical) !== request.request_sha256
                || buildForgeRequestId(request.request_sha256) !== request.request_id
                || hashForgeTargetPaths(canonical) !== request.target_paths_sha256
                || canonical.adapter_ref !== (request.adapter_ref ?? null)
                || canonical.write_capability !== request.write_capability
            ) {
                throw new Error('forge_authorization_request_integrity_invalid');
            }
            nativeConnection = canonical.adapter_ref === FORGE_NATIVE_CONNECTION_ID;
            if (nativeConnection) {
                const roots = resolveForgeRuntimeRoots();
                nativeRequestBinding = bindForgeNativeRequest({
                    request,
                    canonical,
                    code_root: roots.codeRoot,
                    control_root: roots.controlRoot,
                    caller: args,
                });
                nativeAuthorizationBinding = bindForgeNativeAuthorization({
                    binding: nativeRequestBinding,
                    caller: args,
                });
            }
        }
        const existingAuthorization = getForgeAuthorizationByRequest(readDb, request.request_id);
        if (!goalResumeId && existingAuthorization?.authorization_profile
            === ROOT_USER_FORGE_INTENT_PROFILE
            && existingAuthorization.operator_authorization_ref
                .startsWith('cstar-forge-set-manifest:') && !nativeConnection) {
            if (structuralCaller.turn_id !== existingAuthorization.operator_turn_id) {
                persistedSetManifestAuthority = verifyPersistedForgeSetManifestAuthority({
                    db: readDb,
                    request,
                    authorization: existingAuthorization,
                    caller: structuralCaller,
                });
                naturalIntent = persistedSetManifestAuthority.intent;
            } else {
                const identity = await ensureFullIdentity();
                setManifestAuthority = await verifyCurrentForgeSetManifestAuthority({
                    db: readDb, request, identity,
                });
                naturalIntent = setManifestAuthority?.intent ?? null;
            }
        } else if (!goalResumeId && !nativeConnection) {
            if (request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
                && request.status === 'PENDING_AUTH'
                && (structuralCaller.thread_id !== request.requester_thread_id
                    || structuralCaller.turn_id !== request.requester_turn_id)) {
                try {
                    pendingSetManifestAuthority = verifyPendingForgeSetManifestAuthority({
                        db: readDb, request, caller: structuralCaller,
                    });
                    naturalIntent = pendingSetManifestAuthority.intent;
                } catch (error) {
                    if (error instanceof Error && (
                        error.message === 'forge_set_manifest_child_metadata_invalid'
                        || error.message === 'forge_set_manifest_parent_reference_invalid'
                        || error.message === 'forge_set_manifest_parent_metadata_invalid'
                        || error.message === 'forge_set_manifest_child_identity_invalid'
                        || error.message === 'forge_set_manifest_parent_identity_invalid'
                        || error.message === 'forge_set_manifest_mutation_identity_mismatch'
                        || error.message === 'forge_set_manifest_operator_signal_missing'
                    )) {
                        pendingSetManifestAuthority = null;
                    } else {
                        throw error;
                    }
                }
            }
            if (!pendingSetManifestAuthority && !setManifestAuthority) {
                const identity = await ensureFullIdentity();
                setManifestAuthority = await verifyCurrentForgeSetManifestAuthority({
                    db: readDb, request, identity,
                });
                if (setManifestAuthority) {
                    naturalIntent = setManifestAuthority.intent;
                } else {
                    const continuationReplay = Boolean(existingAuthorization
                        && isForgeRootRepairContinuationReference(existingAuthorization.operator_authorization_ref)
                        && request.status === 'AUTHORIZED');
                    const durableRepairIntent = request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
                        && (request.status === 'PENDING_AUTH' || continuationReplay)
                        ? buildForgeRootRepairContinuationIntent({
                            db: readDb,
                            request,
                            identity,
                            existingAuthorization,
                        })
                        : null;
                    if (durableRepairIntent) {
                        naturalIntent = durableRepairIntent;
                    } else {
                        try {
                            naturalIntent = await verifyCurrentForgeOperatorIntent(
                                requestContext, Date.now(), {
                                    request_id: request.request_id,
                                    request_sha256: request.request_sha256,
                                    bead_id: request.bead_id,
                                    decision_id: request.decision_id,
                                    requester_record_set_sha256: request.requester_record_set_sha256,
                                });
                        } catch (error) {
                            naturalIntentError = error;
                        }
                    }
                }
            }
        }
        const executionGrantSha256 = executionGrant ? hashLegacyV2ExecutionGrant(executionGrant) : undefined;
        let authorizationProfile: typeof ROOT_USER_FORGE_INTENT_PROFILE | typeof LEGACY_EXACT_FORGE_CHALLENGE_PROFILE;
        let authorizationBindingSha256: string;
        let challengeSha256: string | undefined;
        let operatorIntentJson: string | undefined;
        let operatorAuthorizationRef: string;
        let operatorThreadId: string;
        let operatorTurnId: string;
        let operatorMessageSha256: string;
        let operatorRecordSha256: string;
        let operatorRecordSetSha256: string;
        let operatorRecordCount: number;
        let authorizedAt: number;
        let expiresAt: number;
        let naturalProjection: ReturnType<typeof resolveForgeOperatorWorkItem> | null = null;
        const goalAuthority = goalResumeId ? await verifyForgeGoalResumeV2Authority({
            db: readDb, request, goalResumeId, identity: await ensureFullIdentity(),
        }) : null;
        if (nativeConnection) {
            if (!nativeAuthorizationBinding) throw new Error('forge_native_authorization_binding_missing');
            ({ authorization_profile: authorizationProfile,
                authorization_binding_sha256: authorizationBindingSha256,
                operator_intent_json: operatorIntentJson,
                operator_authorization_ref: operatorAuthorizationRef,
                operator_thread_id: operatorThreadId,
                operator_turn_id: operatorTurnId,
                operator_message_sha256: operatorMessageSha256,
                operator_record_sha256: operatorRecordSha256,
                operator_record_set_sha256: operatorRecordSetSha256,
                operator_record_count: operatorRecordCount,
                authorized_at: authorizedAt, expires_at: expiresAt } = deriveNativeAuthorizationIntent({
                binding: nativeAuthorizationBinding, request,
            }));
        } else if (goalAuthority) {
            if (executionGrant) throw new Error('forge_goal_resume_legacy_v2_unsupported');
            authorizationProfile = ROOT_USER_FORGE_INTENT_PROFILE;
            operatorIntentJson = goalAuthority.operator_intent_json;
            authorizationBindingSha256 = goalAuthority.authorization_binding_sha256;
            operatorAuthorizationRef = goalAuthority.operator_authorization_ref;
            operatorThreadId = goalAuthority.operator_thread_id;
            operatorTurnId = goalAuthority.operator_turn_id;
            operatorMessageSha256 = goalAuthority.operator_message_sha256;
            operatorRecordSha256 = goalAuthority.operator_record_sha256;
            operatorRecordSetSha256 = goalAuthority.operator_record_set_sha256;
            operatorRecordCount = goalAuthority.operator_record_count;
            authorizedAt = goalAuthority.authorized_at;
            expiresAt = goalAuthority.expires_at;
        } else if (naturalIntent) {
            if (executionGrant) throw new Error('forge_natural_authorization_legacy_v2_unsupported');
            assertUnusedCurrentTurn(readDb, request.repo_id, request.request_id, naturalIntent);
            naturalProjection = resolveForgeOperatorWorkItem(readDb, request, naturalIntent);
            authorizationProfile = ROOT_USER_FORGE_INTENT_PROFILE;
            operatorIntentJson = forgeOperatorIntentProjectionJson(naturalProjection);
            authorizationBindingSha256 = hashRootUserForgeIntentBinding({
                request,
                projection: naturalProjection,
                operator_thread_id: naturalIntent.thread_id,
                operator_turn_id: naturalIntent.turn_id,
                operator_message_sha256: naturalIntent.message_sha256,
                operator_record_sha256: naturalIntent.session_record_sha256,
                operator_record_set_sha256: naturalIntent.session_record_set_sha256,
                operator_record_count: naturalIntent.session_record_count,
            });
            operatorAuthorizationRef = naturalIntent.operator_authorization_ref;
            operatorThreadId = naturalIntent.thread_id;
            operatorTurnId = naturalIntent.turn_id;
            operatorMessageSha256 = naturalIntent.message_sha256;
            operatorRecordSha256 = naturalIntent.session_record_sha256;
            operatorRecordSetSha256 = naturalIntent.session_record_set_sha256;
            operatorRecordCount = naturalIntent.session_record_count;
            authorizedAt = naturalIntent.authorized_at;
            expiresAt = naturalIntent.expires_at;
        } else {
            if (request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE) {
                throw naturalIntentError ?? new Error('forge_operator_intent_required');
            }
            challengeSha256 = hashForgeAuthorizationChallenge(requestId!, requestSha256!, executionGrantSha256);
            const exact = await verifyCurrentForgeAuthorizationChallenge(
                requestContext, requestId!, requestSha256!, executionGrantSha256);
            authorizationProfile = LEGACY_EXACT_FORGE_CHALLENGE_PROFILE;
            authorizationBindingSha256 = challengeSha256;
            operatorAuthorizationRef = exact.reference;
            operatorThreadId = exact.thread_id;
            operatorTurnId = exact.turn_id;
            operatorMessageSha256 = exact.message_sha256;
            operatorRecordSha256 = exact.session_record_sha256;
            operatorRecordSetSha256 = exact.session_record_set_sha256;
            operatorRecordCount = exact.session_record_count;
            authorizedAt = exact.authorized_at;
            expiresAt = exact.expires_at;
        }
        operatorAuthorizationVerified = true;
        if (!nativeConnection) assertLiveForgeRuntimeReady();
        releaseReadDb();
        releaseReadDb = null;
        const writable = getForgeWritableDb(root);
        const authorizeAgainstStableCandidateSet = writable.transaction(() => {
            const current = getForgeRequest(writable, request.request_id);
            if (!current || !forgeRequestAuthorityMatches(request, current)) {
                throw new Error('forge_request_authority_drift_before_authorization');
            }
            if (naturalIntent && naturalProjection) {
                assertUnusedCurrentTurn(writable, current.repo_id, current.request_id, naturalIntent);
                const currentProjection = resolveForgeOperatorWorkItem(writable, current, naturalIntent);
                if (forgeOperatorIntentProjectionJson(currentProjection)
                    !== forgeOperatorIntentProjectionJson(naturalProjection)) {
                    throw new Error('forge_operator_intent_candidate_set_drift');
                }
            }
            if (goalAuthority && goalResumeId) {
                revalidateForgeGoalResumeV2Authority({
                    db: writable,
                    request: current,
                    goalResumeId,
                    identity: requestIdentity!,
                    authority: goalAuthority,
                });
            }
            if (pendingSetManifestAuthority) {
                const currentPending = verifyPendingForgeSetManifestAuthority({
                    db: writable,
                    request: current,
                    caller: structuralCaller,
                });
                if (currentPending.authority_manifest_sha256
                    !== pendingSetManifestAuthority.authority_manifest_sha256
                    || currentPending.intent.operator_authorization_ref
                        !== pendingSetManifestAuthority.intent.operator_authorization_ref
                    || currentPending.binding !== pendingSetManifestAuthority.binding) {
                    throw new Error('forge_set_manifest_authority_projection_drift');
                }
            } else if (persistedSetManifestAuthority && existingAuthorization) {
                verifyPersistedForgeSetManifestAuthority({
                    db: writable,
                    request: current,
                    authorization: existingAuthorization,
                    caller: structuralCaller.turn_id === existingAuthorization.operator_turn_id
                        ? requestIdentity! : structuralCaller,
                });
            } else if (setManifestAuthority) {
                revalidateForgeSetManifestAuthority({
                    db: writable,
                    request: current,
                    identity: requestIdentity!,
                    authorityManifestSha256:
                        setManifestAuthority.authority_manifest_sha256,
                });
            }
            return authorizeForgeRequest(writable, {
                request_id: request.request_id,
                request_sha256: request.request_sha256,
                authorization_profile: authorizationProfile,
                authorization_binding_sha256: authorizationBindingSha256,
                challenge_sha256: challengeSha256,
                operator_intent_json: operatorIntentJson,
                operator_authorization_ref: operatorAuthorizationRef,
                operator_thread_id: operatorThreadId,
                operator_turn_id: operatorTurnId,
                operator_message_sha256: operatorMessageSha256,
                operator_record_sha256: operatorRecordSha256,
                operator_record_set_sha256: operatorRecordSetSha256,
                operator_record_count: operatorRecordCount,
                execution_grant_schema: executionGrant?.schema,
                execution_grant_sha256: executionGrantSha256,
                execution_grant_json: executionGrant ? stableJson(executionGrant) : undefined,
                authorized_at: authorizedAt,
                expires_at: expiresAt,
            });
        });
        const authorized = authorizeAgainstStableCandidateSet.immediate();
        const terminal = ['SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS', 'REVOKED']
            .includes(authorized.request.status);
        const expired = authorized.authorization.expires_at <= Date.now();
        const autonomousSetAuthority = Boolean(
            pendingSetManifestAuthority || persistedSetManifestAuthority,
        );
        const autonomousSetMessage = 'The original SET grant authorized this unchanged immutable Forge request; CStar may execute it from a later same-root structural turn without a fresh operator instruction.';
        return textResponse({
            status: terminal
                ? 'terminal_authorization_replay'
                : expired ? 'expired_authorization_replay' : 'authorized',
            forge_request_receipt_id: authorized.request.request_id,
            request_sha256: authorized.request.request_sha256,
            request_status: authorized.request.status,
            operator_authorization_ref: authorized.request.operator_authorization_ref,
            authorization_id: authorized.authorization.authorization_id,
            authorization_profile: authorized.authorization.authorization_profile,
            authorization_binding_sha256: authorized.authorization.authorization_binding_sha256,
            authorization_challenge_sha256: authorized.authorization.challenge_sha256 ?? null,
            native_request: nativeRequestBinding?.request ?? null,
            native_authorization: nativeAuthorizationBinding?.authorization ?? null,
            native_scope_sha256: nativeAuthorizationBinding?.scope_sha256 ?? null,
            native_evidence_root: nativeAuthorizationBinding?.evidence_root ?? null,
            execution_grant_schema: authorized.authorization.execution_grant_schema ?? null,
            execution_grant_sha256: authorized.authorization.execution_grant_sha256 ?? null,
            authorized_at: authorized.request.authorized_at,
            expires_at: authorized.request.expires_at,
            authorization_replayed: authorized.replayed,
            authorization_challenge: null,
            mutation: terminal || expired || authorized.replayed
                ? null
                : mcpMutation(
                    'forge_request_authorize',
                    authorized.request.request_id,
                    autonomousSetAuthority
                        ? autonomousSetMessage
                        : 'The unchanged pending Forge request was authorized by one hash-bound root-user instruction.',
                ),
            forge_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
            },
            guardrail: mcpGuardrail(
                terminal || expired ? 'block' : 'allow',
                terminal || expired ? 'refuse' : 'continue',
                terminal
                    ? 'The authorization is historical evidence for a terminal request and grants no new attempt.'
                    : expired
                        ? 'The authorization expired and grants no new attempt.'
                        : 'The immutable request is authorized for one attempt and zero retries; no provider was invoked.',
                terminal
                    ? [`terminal_forge_request_${authorized.request.status.toLowerCase()}`]
                    : expired ? ['forge_operator_authorization_expired'] : [],
                ['forge_hash_bound_operator_authorization'],
            ),
            next_action: terminal
                ? 'Use the original idempotency key only to retrieve the durable attempt; do not spend again.'
                : expired
                    ? 'Do not execute this expired grant.'
                    : autonomousSetAuthority
                        ? autonomousSetMessage
                        : 'Call cstar_forge_execute in this same root-user turn with the returned authorization reference.',
        });
    } catch (error) {
        releaseReadDb?.();
        if (
            !requestIdentityVerified
            && !requestReadFailed
            && error instanceof Error
            && error.message === 'codex_request_identity_turn_match_count:0'
        ) {
            return preAuthorizationResponse({
                status: 'operator_signal_required',
                mutation: null,
                forge_execution: {
                    attempted: false,
                    live_spend: false,
                    live_source_collection: false,
                },
                guardrail: mcpGuardrail(
                    'block',
                    'recover',
                    'The host resumed without a canonical root-user instruction; goal context never grants Forge authority.',
                    ['forge_operator_signal_required'],
                ),
                next_action: 'Send a fresh ordinary instruction that names the work, such as: Continue building TokenPath Q0 phase one.',
            }, 'forge_operator_signal_required');
        }
        if (requestReadWithValidIdentity) return errorResponse(error);
        const errorText = error instanceof Error ? error.message : '';
        const identityFailure = errorText.startsWith('operator_authorization_')
            || errorText.startsWith('codex_request_identity_')
            || errorText === 'forge_authorization_request_integrity_invalid';
        return operatorAuthorizationVerified
            ? errorResponse(error)
            : requestIdentityVerified || identityFailure
                ? preAuthorizationErrorResponse(
                    'forge_operator_authorization_required',
                    'forge_operator_authorization_required',
                )
            : preAuthorizationErrorResponse(
                mcpErrorCode(error, 'forge_operator_authorization_required'),
                error,
            );
    }
}
