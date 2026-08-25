import { database } from '../../pennyone/intel/database.js';
import { saveForgeRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    findDispatchValidationError,
    hasDuplicatePackageLockMismatch,
    resolveDispatchSurface,
    verifyDispatchPackageLocks,
    type DispatchRequestArgs,
} from './dispatch_request.js';
import {
    forgeExecutionRequiresImplementationWrites,
    resolveForgeExecutionAdapterRef,
    sealForgeAdapterRuntime,
} from './forge_adapters.js';
import {
    assertForgeRequiredOutputsContained,
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type ForgeRequestContractArgs,
} from './forge_request_contract.js';
import { verifyOperatorAuthorization } from './operator_authorization.js';
import { sealForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';

export interface ForgeRequestArgs extends DispatchRequestArgs {
    execution_adapter_ref?: string;
}

function forgeRequestValidationError(args: ForgeRequestArgs): string | null {
    const baseError = findDispatchValidationError(args);
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

export async function handleForgeRequest(args: ForgeRequestArgs, requestContext?: McpRequestContext): Promise<McpTextResponse> {
    try {
        const validationError = forgeRequestValidationError(args);
        const decisionId = args.decision_id?.trim() ?? '';
        if (validationError) {
            return textResponse({
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
            }, true);
        }

        const root = registry.getRoot();
        const surface = resolveDispatchSurface('forge', args, root);
        if (!surface.found) {
            return textResponse({
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
            }, true);
        }

        const adapter = resolveForgeExecutionAdapterRef(args.execution_adapter_ref, root);
        const liveRequested = args.spend_policy.mode === 'live_authorized';
        if (liveRequested && !adapter.selected) {
            return textResponse({
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
            }, true);
        }
        if (
            liveRequested
            && adapter.selected?.write_capability === 'project_files'
            && (!args.required_output_paths || args.required_output_paths.length === 0)
        ) {
            return textResponse({
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
            }, true);
        }

        if (
            liveRequested
            && adapter.selected?.write_capability === 'response_only'
            && forgeExecutionRequiresImplementationWrites(args)
        ) {
            return textResponse({
                status: 'blocked',
                dispatch_kind: 'forge',
                decision_id: decisionId,
                bead_id: args.bead_id,
                error: 'adapter_lacks_implementation_write_capability',
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'A response-only Forge adapter cannot accept implementation work.',
                    ['adapter_lacks_implementation_write_capability'],
                    ['forge_adapter_capability'],
                ),
            }, true);
        }

        if (liveRequested && adapter.selected?.write_capability === 'project_files') {
            try {
                assertForgeRequiredOutputsContained(root, args.target_paths, args.required_output_paths);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                return textResponse({
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
                }, true);
            }
        }

        const authorizationRef = args.spend_policy.operator_authorization_ref?.trim();
        const packageLockProofs = liveRequested
            ? verifyDispatchPackageLocks(args.package_locks, root)
            : [];
        const verified = liveRequested
            ? await verifyOperatorAuthorization(authorizationRef!, {
                target_paths: [
                    ...(args.target_paths ?? []),
                    ...(args.required_output_paths ?? []),
                ],
                requires_forge_hermes_m3: true,
                request_context: requestContext,
            })
            : null;
        const maxAttempts = verified?.max_attempts ?? 1;
        const selectedAdapter = adapter.selected;
        const adapterRuntimeProof = selectedAdapter ? sealForgeAdapterRuntime(selectedAdapter) : null;
        const hermesRuntimeExpectation = selectedAdapter?.ref === 'cstar-forge-hermes-minimax-worker-adapter'
            && adapterRuntimeProof
            ? await sealForgeHermesRuntimeExpectation(adapterRuntimeProof)
            : null;
        const writeCapability = selectedAdapter?.write_capability === 'project_files'
            ? 'project_files'
            : selectedAdapter?.write_capability === 'response_only'
                ? 'response_only'
                : null;
        const canonical = canonicalizeForgeRequest(
            args as ForgeRequestContractArgs,
            root,
            decisionId,
            selectedAdapter?.ref ?? adapter.canonical_ref,
            writeCapability,
            maxAttempts,
            adapterRuntimeProof,
            hermesRuntimeExpectation,
        );
        const requestSha256 = hashCanonicalForgeRequest(canonical);
        const requestId = buildForgeRequestId(requestSha256);
        const db = database.getDb(root);
        const saved = saveForgeRequest(db, {
            request_id: requestId,
            repo_id: buildHallRepositoryId(normalizeHallPath(root)),
            bead_id: args.bead_id!.trim(),
            decision_id: decisionId,
            request_sha256: requestSha256,
            request_summary_json: stableJson(canonical),
            target_paths_sha256: hashForgeTargetPaths(canonical),
            live_source_allowed: verified?.live_source_allowed ?? false,
            max_attempts: maxAttempts,
            operator_authorization_ref: verified?.reference,
            operator_thread_id: verified?.thread_id,
            operator_turn_id: verified?.turn_id,
            operator_message_sha256: verified?.message_sha256,
            operator_record_sha256: verified?.session_record_sha256,
            operator_record_set_sha256: verified?.session_record_set_sha256,
            operator_record_count: verified?.session_record_count,
            adapter_ref: selectedAdapter?.ref,
            write_capability: writeCapability ?? undefined,
            authorized_at: verified?.authorized_at,
            expires_at: verified?.expires_at,
        });

        const ready = saved.request.status === 'AUTHORIZED';
        return textResponse({
            status: ready ? 'authorized_request_recorded' : 'pending_authorization_recorded',
            dispatch_kind: 'forge',
            decision_id: decisionId,
            receipt_id: requestId,
            bead_id: args.bead_id,
            request_sha256: requestSha256,
            request_replayed: saved.replayed,
            request_status: saved.request.status,
            max_attempts: saved.request.max_attempts,
            expires_at: saved.request.expires_at ?? null,
            target_paths: canonical.target_paths,
            target_paths_sha256: saved.request.target_paths_sha256,
            package_lock_proofs: packageLockProofs,
            authorized_dispatch_surface: surface,
            authorized_execution_adapter: adapter,
            adapter_runtime_proof: adapterRuntimeProof,
            hermes_runtime_expectation: hermesRuntimeExpectation,
            dispatch_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: ready ? null : 'operator_authorization_not_bound',
            },
            guardrail: mcpGuardrail(
                ready ? 'allow' : 'caution',
                ready ? 'continue' : 'verify',
                ready
                    ? 'The immutable request and one-shot operator grant are recorded; execute still requires atomic attempt reservation.'
                    : 'The request exists durably, but no live authority is bound.',
                ready ? [] : ['operator_authorization_not_bound'],
                ['durable_forge_request'],
            ),
            next_action: ready
                ? 'Call cstar_forge_execute once with this receipt, exact request fields, and a stable idempotency_key.'
                : 'Obtain an explicit operator grant and submit a new authorized Forge request; do not execute this pending receipt.',
        });
    } catch (error) {
        return errorResponse(error);
    }
}
