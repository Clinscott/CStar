import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { getForgeRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import { authorizeForgeRequest } from '../../pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../pennyone/pathRegistry.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    errorResponse,
    mcpErrorCode,
    mcpGuardrail,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import {
    buildForgeAuthorizationChallenge,
    hashForgeAuthorizationChallenge,
    verifyCurrentForgeAuthorizationChallenge,
} from './forge_authorization_challenge.js';
import {
    resolveForgeExecutionAdapterRef,
    sealForgeAdapterRuntime,
} from './forge_adapters.js';
import { assertDispatchAdapterCapability } from './dispatch_action_authority.js';
import { verifyDispatchPackageLocks } from './dispatch_request.js';
import {
    buildLegacyV2ExecutionGrant,
    hashLegacyV2ExecutionGrant,
    type LegacyV2ExecutionGrant,
} from './forge_legacy_v2_compatibility.js';
import { sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import {
    buildForgeRequestId,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import {
    forgeRequestAuthorityMatches,
    readForgeRequestBeforeMutation,
} from './forge_execute_request_authority.js';
import { assertLiveForgeRuntimeReady } from '../contracts/runtime.js';

export interface ForgeAuthorizeArgs {
    forge_request_receipt_id: string;
    request_sha256: string;
}

function assertPendingChallengePolicy(requestSummary: CanonicalForgeRequest): void {
    if (
        requestSummary.schema !== 'cstar.forge_request.v3'
        || requestSummary.spend_policy.mode !== 'live_authorized'
        || requestSummary.spend_policy.max_retries !== 0
        || requestSummary.spend_policy.live_source_allowed !== false
        || requestSummary.retry_budget !== 0
        || requestSummary.fixture_policy !== 'synthetic_only'
        || requestSummary.max_attempts !== 1
        || !requestSummary.adapter_ref
        || !requestSummary.write_capability
    ) {
        throw new Error('forge_authorization_request_policy_invalid');
    }
}

export async function handleForgeAuthorize(
    args: ForgeAuthorizeArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    let requestIdentityVerified = false;
    let authorizationChallengeVerified = false;
    let releaseReadDb: (() => void) | null = null;
    try {
        const requestId = args.forge_request_receipt_id?.trim();
        const requestSha256 = args.request_sha256?.trim().toLowerCase();
        if (!/^dispatch-forge-[a-f0-9]{32}$/.test(requestId ?? '')) {
            throw new Error('forge_authorization_request_id_invalid');
        }
        if (!/^[a-f0-9]{64}$/.test(requestSha256 ?? '')) {
            throw new Error('forge_authorization_request_sha256_invalid');
        }
        await verifyCodexRequestIdentity(requestContext);
        requestIdentityVerified = true;
        const root = registry.getRoot();
        const { request, release } = readForgeRequestBeforeMutation(root, requestId!);
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
                || canonical.adapter_ref !== request.adapter_ref
                || canonical.write_capability !== request.write_capability
            ) {
                throw new Error('forge_authorization_request_integrity_invalid');
            }
        }
        const executionGrantSha256 = executionGrant
            ? hashLegacyV2ExecutionGrant(executionGrant)
            : undefined;
        const challenge = buildForgeAuthorizationChallenge(
            requestId!,
            requestSha256!,
            executionGrantSha256,
        );
        const challengeSha256 = hashForgeAuthorizationChallenge(
            requestId!,
            requestSha256!,
            executionGrantSha256,
        );
        const attestation = await verifyCurrentForgeAuthorizationChallenge(
            requestContext,
            requestId!,
            requestSha256!,
            executionGrantSha256,
        );
        authorizationChallengeVerified = true;
        assertLiveForgeRuntimeReady();
        releaseReadDb();
        releaseReadDb = null;
        const writable = getForgeWritableDb(root);
        const current = getForgeRequest(writable, request.request_id);
        if (!current || !forgeRequestAuthorityMatches(request, current)) {
            throw new Error('forge_request_authority_drift_before_authorization');
        }
        const authorized = authorizeForgeRequest(writable, {
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            authorization_profile: 'exact_request_challenge_v1',
            challenge_sha256: challengeSha256,
            operator_authorization_ref: attestation.reference,
            operator_thread_id: attestation.thread_id,
            operator_turn_id: attestation.turn_id,
            operator_message_sha256: attestation.message_sha256,
            operator_record_sha256: attestation.session_record_sha256,
            operator_record_set_sha256: attestation.session_record_set_sha256,
            operator_record_count: attestation.session_record_count,
            execution_grant_schema: executionGrant?.schema,
            execution_grant_sha256: executionGrantSha256,
            execution_grant_json: executionGrant ? stableJson(executionGrant) : undefined,
            authorized_at: attestation.authorized_at,
            expires_at: attestation.expires_at,
        });
        const terminal = ['SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS', 'REVOKED']
            .includes(authorized.request.status);
        const expired = authorized.authorization.expires_at <= Date.now();
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
            authorization_challenge_sha256: authorized.authorization.challenge_sha256,
            execution_grant_schema: authorized.authorization.execution_grant_schema ?? null,
            execution_grant_sha256: authorized.authorization.execution_grant_sha256 ?? null,
            authorized_at: authorized.request.authorized_at,
            expires_at: authorized.request.expires_at,
            authorization_replayed: authorized.replayed,
            authorization_challenge: challenge,
            mutation: terminal || expired || authorized.replayed
                ? null
                : mcpMutation(
                    'forge_request_authorize',
                    authorized.request.request_id,
                    'The unchanged pending Forge request was authorized by one exact hash-bound root-user challenge.',
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
                    ? 'The exact authorization is historical evidence for a terminal request and grants no new attempt.'
                    : expired
                        ? 'The exact authorization expired and grants no new attempt.'
                        : 'The exact immutable request is authorized for one attempt and zero retries; no provider was invoked.',
                terminal
                    ? [`terminal_forge_request_${authorized.request.status.toLowerCase()}`]
                    : expired ? ['forge_exact_authorization_expired'] : [],
                ['forge_hash_bound_authorization'],
            ),
            next_action: terminal
                ? 'Use the original idempotency key only to retrieve the durable attempt; do not spend again.'
                : expired
                    ? 'Do not execute this expired grant.'
                    : 'Call cstar_forge_execute in this same root-user turn with the returned authorization reference.',
        });
    } catch (error) {
        releaseReadDb?.();
        return authorizationChallengeVerified
            ? errorResponse(error)
            : requestIdentityVerified
                ? preAuthorizationErrorResponse(
                    'forge_authorization_challenge_exact_match_required',
                    'forge_authorization_challenge_exact_match_required',
                )
            : preAuthorizationErrorResponse(
                mcpErrorCode(error, 'forge_authorization_challenge_required'),
                error,
            );
    }
}
