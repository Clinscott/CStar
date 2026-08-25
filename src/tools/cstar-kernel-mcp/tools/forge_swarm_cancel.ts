import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { cancelForgeNativeRun } from '../../pennyone/intel/forge_native_swarm_controller.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';

export const forgeNativeCancelSchema = z.object({
    run_id: z.string().trim().min(1).max(192),
    reason: z.string().trim().min(1).max(256),
}).strict();

export interface ForgeNativeCancelDependencies { db?: Database.Database; controlRoot?: string }

export async function handleForgeSwarmCancel(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeNativeCancelDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeNativeCancelSchema.safeParse(args);
    if (!parsed.success) return mcpOutcomeResponse('guardrail_block', {
        error_code: 'forge_native_cancel_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native cancellation input is outside the bounded contract.', ['contract'], []),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const run = cancelForgeNativeRun(db, parsed.data.run_id);
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_cancel_requested.v1',
            run_id: run.run_id,
            state: run.state,
            reason: parsed.data.reason,
            guardrail: mcpGuardrail('caution', 'verify', 'Cancellation requires native interrupt evidence; uninspectable work remains UNKNOWN.', [], ['interrupt_all', 'worktree_retained']),
        });
    } catch (error) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: mcpErrorCode(error, 'forge_native_cancel_failed'),
            error: error instanceof Error ? error.message : String(error),
            guardrail: mcpGuardrail('block', 'repair', 'Native cancellation was not completed.', ['native_cancel'], []),
        });
    }
}
