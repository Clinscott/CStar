import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    findDispatchValidationError,
    hasDuplicatePackageLockMismatch,
    isLegacyLiveExecutionEnabled,
    makeDispatchDecisionId,
    normalizeActionList,
    resolveDispatchSurface,
    type DispatchRequestArgs,
} from './dispatch_request.js';
import {
    forgeExecutionRequiresImplementationWrites,
    invokeForgeHermesMinimaxAdapter,
    resolveForgeExecutionAdapter,
} from './forge_adapters.js';

export type ForgeExecutionMode = 'no_op' | 'live_authorized';

export interface ForgeExecutionArgs extends DispatchRequestArgs {
    forge_request_receipt_id: string;
    forge_request_decision_id: string;
    forge_request_bead_id?: string;
    execution_mode: ForgeExecutionMode;
    execution_adapter_ref?: string;
    operator_authorization_ref?: string;
}

function findForgeExecutionValidationError(args: ForgeExecutionArgs): string | null {
    const baseError = findDispatchValidationError(args);
    if (baseError) {
        return baseError;
    }
    if (!args.forge_request_receipt_id?.trim()) {
        return 'forge_request_receipt_id is required';
    }
    if (!args.forge_request_receipt_id.startsWith('dispatch-forge-')) {
        return 'forge_request_receipt_id must reference a cstar_forge_request receipt';
    }
    if (!args.forge_request_decision_id?.trim()) {
        return 'forge_request_decision_id is required';
    }
    if (args.decision_id?.trim() && args.decision_id.trim() !== args.forge_request_decision_id.trim()) {
        return 'decision_id must match forge_request_decision_id';
    }
    if (args.bead_id?.trim() && args.forge_request_bead_id?.trim() && args.bead_id.trim() !== args.forge_request_bead_id.trim()) {
        return 'bead_id must match forge_request_bead_id';
    }
    if (hasDuplicatePackageLockMismatch(args.package_locks)) {
        return 'package_locks contain inconsistent hashes for the same path';
    }
    if (args.execution_mode === 'live_authorized' && !args.operator_authorization_ref?.trim()) {
        return 'live Forge execution requires operator_authorization_ref';
    }
    return null;
}

export async function handleForgeExecute(args: ForgeExecutionArgs): Promise<McpTextResponse> {
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
        const adapter = resolveForgeExecutionAdapter(args);
        const failClosedReason = !surface.found
            ? 'missing_authorized_dispatch_surface'
            : args.execution_mode === 'no_op'
                ? null
                : !isLegacyLiveExecutionEnabled()
                    ? 'legacy_live_execution_disabled'
                : !adapter.found
                    ? 'missing_authorized_execution_adapter'
                    : adapter.selected?.write_capability === 'response_only' && forgeExecutionRequiresImplementationWrites(args)
                        ? 'adapter_lacks_implementation_write_capability'
                    : null;
        const status = args.execution_mode === 'no_op'
            ? 'validated_noop'
            : failClosedReason
                ? 'blocked'
                : 'ready_for_authorized_execution';
        const executionReceiptId = `forge-execute-${decisionId}-${Date.now().toString(36)}`;
        const adapterInvocation = (!failClosedReason && args.execution_mode === 'live_authorized' && adapter.selected)
            ? await invokeForgeHermesMinimaxAdapter(args, decisionId, executionReceiptId, root, adapter.selected)
            : null;
        const finalStatus = adapterInvocation
            ? adapterInvocation.status === 'ok'
                ? 'executed'
                : 'adapter_degraded'
            : status;
        const finalFailClosedReason = adapterInvocation && adapterInvocation.status !== 'ok'
            ? `adapter_${adapterInvocation.status}`
            : failClosedReason;
        const isError = (finalFailClosedReason !== null && args.execution_mode !== 'no_op')
            || finalStatus === 'adapter_degraded';

        return textResponse({
            status: finalStatus,
            execution_kind: 'forge',
            decision_id: decisionId,
            execution_receipt_id: executionReceiptId,
            forge_request_receipt_id: args.forge_request_receipt_id,
            bead_id: args.bead_id ?? args.forge_request_bead_id ?? null,
            owner_pmt_thread_id: args.owner_pmt_thread_id,
            source_callback_thread_id: args.source_callback_thread_id,
            objective: args.objective,
            target_paths: args.target_paths ?? [],
            scope: args.scope,
            authority_lane: args.authority_lane,
            required_metrics: args.required_metrics,
            artifact_expectations: args.artifact_expectations,
            prohibited_actions: normalizeActionList(args.prohibited_actions),
            requested_actions: normalizeActionList(args.requested_actions),
            spend_policy: {
                mode: args.spend_policy.mode,
                ...(args.spend_policy.max_retries !== undefined ? { max_retries: args.spend_policy.max_retries } : {}),
                live_source_allowed: args.spend_policy.live_source_allowed === true,
            },
            retry_policy: args.retry_policy ?? { budget: args.spend_policy.max_retries ?? 0, spent: 0 },
            callback_contract: {
                ...args.callback_contract,
                callback_required: args.callback_contract.callback_required !== false,
                callback_thread_id: args.callback_contract.callback_thread_id ?? args.source_callback_thread_id,
            },
            package_locks: args.package_locks ?? [],
            authorized_dispatch_surface: surface,
            authorized_execution_adapter: adapter,
            forge_execution: {
                mode: args.execution_mode,
                attempted: adapterInvocation !== null,
                live_spend: adapterInvocation?.live_spend === true,
                live_source_collection: adapterInvocation?.live_source_collection === true,
                codex_worker_fallback_allowed: false,
                adapter_invoked: adapterInvocation !== null,
                adapter_result: adapterInvocation,
                fail_closed_reason: finalFailClosedReason,
            },
            guardrail: mcpGuardrail(
                finalFailClosedReason ? 'block' : 'allow',
                finalFailClosedReason ? 'refuse' : 'continue',
                finalFailClosedReason
                    ? 'Forge execution failed closed before an acceptable Forge adapter result was produced.'
                    : args.execution_mode === 'no_op'
                        ? 'Forge execution contract is validated without live spend.'
                        : 'Forge execution ran through the approved adapter path under the supplied operator authorization.',
                finalFailClosedReason ? [finalFailClosedReason] : [],
                ['forge_execution_authority'],
            ),
            next_action: finalFailClosedReason
                ? 'Do not substitute cstar_autobot, Codex workers, or ad hoc shell. Route the missing adapter repair to CStar PMT/CoS.'
                : args.execution_mode === 'no_op'
                    ? 'Use this no-op receipt as contract proof only; live Forge execution still requires a registered adapter and separate operator authorization.'
                    : 'Review the adapter result, package artifacts, and callback packet through the owning PMT before acceptance.',
        }, isError);
    } catch (error) {
        return errorResponse(error);
    }
}
