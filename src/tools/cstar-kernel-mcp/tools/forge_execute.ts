import { handleForgeSwarmUpdate } from './forge_swarm_update.js';
import { mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import type { ForgeExecutionArgs, ForgeExecutionMode } from './forge_execute_contract.js';

export type { ForgeExecutionArgs, ForgeExecutionMode } from './forge_execute_contract.js';

/**
 * Forge execution is now a native request-bound reservation surface. Legacy
 * host-handoff, Hermes, provider, CLI, and fallback execution is tombstoned;
 * callers must use the native package and the four `forge_swarm_*` tools.
 */
export async function handleForgeExecute(
    args: ForgeExecutionArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    if (args.connection_id !== 'forge-native-codex-swarm-v1' || !args.native_request || !args.native_evidence_root) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: 'forge_connection_generation_rejected',
            error: 'Only forge-native-codex-swarm-v1 is executable; legacy Forge connections are tombstoned.',
            guardrail: mcpGuardrail('block', 'refuse', 'Forge did not accept a legacy or fallback execution path.', ['forge_connection_generation_rejected'], ['native_connection_required']),
        });
    }
    return handleForgeSwarmUpdate({
        action: 'reserve',
        request: args.native_request,
        evidence_root: args.native_evidence_root,
        run_id: args.native_run_id,
    }, requestContext);
}
