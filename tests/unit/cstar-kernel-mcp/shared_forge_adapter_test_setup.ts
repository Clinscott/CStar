import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { textResponse } from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    invokeForgeHermesMinimaxAdapter,
    prepareForgeHermesMinimaxAdapterInvocation,
    resolveForgeExecutionAdapter,
    sealForgeAdapterRuntime,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';
import { sealForgeHermesRuntimeExpectation } from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';
import {
    createForgeOAuthHorizon,
    preflightForgeHermesOAuthBeforeReservation,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_oauth_contract.js';
import {
    assertDispatchAdapterCapability,
    resolveDispatchActionAuthority,
} from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_action_authority.js';
import {
    resolveDispatchSurface,
    type DispatchRequestArgs,
} from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_request.js';
import type { ForgeExecutionArgs } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';

/**
 * Exercise Forge adapter internals without crossing the now fail-closed public
 * cstar_forge_execute authority boundary. This test harness deliberately lives
 * outside production code and cannot be registered as an MCP tool.
 */
export async function invokeForgeAdapterForTest(args: ForgeExecutionArgs) {
    const root = registry.getRoot();
    const surface = resolveDispatchSurface('forge', args as DispatchRequestArgs, root);
    const adapter = resolveForgeExecutionAdapter(args);
    let capabilityError: string | null = null;
    if (adapter.selected) {
        try {
            assertDispatchAdapterCapability(
                resolveDispatchActionAuthority(args, root),
                adapter.selected.write_capability,
                { require_adapter: true },
            );
        } catch (error) {
            capabilityError = error instanceof Error
                ? error.message
                : 'dispatch_action_adapter_capability_mismatch';
        }
    }
    const failClosedReason = !surface.found
        ? 'missing_authorized_dispatch_surface'
        : !adapter.found
            ? 'missing_authorized_execution_adapter'
            : capabilityError;
    const decisionId = args.forge_request_decision_id;
    const executionReceiptId = `forge-execute-${decisionId}-${Date.now().toString(36)}`;
    let adapterInvocation = null;
    if (!failClosedReason && adapter.selected) {
        const syntheticBoundWorker = adapter.selected.ref === 'cstar-forge-hermes-minimax-worker-adapter'
            && Boolean(process.env.HERMES_BIN);
        if (syntheticBoundWorker) {
            const runtimeProof = sealForgeAdapterRuntime(adapter.selected);
            const expectedRuntime = await sealForgeHermesRuntimeExpectation(runtimeProof);
            const oauthHorizon = createForgeOAuthHorizon(
                args, decisionId, executionReceiptId, adapter.selected, expectedRuntime,
            );
            const preflight = await preflightForgeHermesOAuthBeforeReservation(
                args, decisionId, executionReceiptId, root, adapter.selected,
                runtimeProof, expectedRuntime, oauthHorizon,
            );
            const prepared = await prepareForgeHermesMinimaxAdapterInvocation(
                args, decisionId, executionReceiptId, root, adapter.selected,
                runtimeProof, expectedRuntime, preflight, oauthHorizon,
            );
            adapterInvocation = await invokeForgeHermesMinimaxAdapter(
                args, decisionId, executionReceiptId, root, adapter.selected, runtimeProof, prepared,
            );
        } else {
            adapterInvocation = await invokeForgeHermesMinimaxAdapter(
                args, decisionId, executionReceiptId, root, adapter.selected,
            );
        }
    }
    const finalStatus = adapterInvocation
        ? adapterInvocation.status === 'ok'
            ? 'executed'
            : 'adapter_degraded'
        : 'blocked';
    const finalFailClosedReason = adapterInvocation && adapterInvocation.status !== 'ok'
        ? `adapter_${adapterInvocation.status}`
        : failClosedReason;
    const isError = finalFailClosedReason !== null || finalStatus === 'adapter_degraded';

    return textResponse({
        status: finalStatus,
        execution_kind: 'forge',
        decision_id: decisionId,
        execution_receipt_id: executionReceiptId,
        forge_request_receipt_id: args.forge_request_receipt_id,
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
    }, isError);
}
