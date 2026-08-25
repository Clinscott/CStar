import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { getForgeNativeRun, nativeRunScope, recordForgeNativePlan } from '../../pennyone/intel/forge_native_swarm_controller.js';
import { forgeNativePlanSchema } from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';

export const forgeNativePlanToolSchema = z.object({
    run_id: z.string().trim().min(1).max(192),
    plan: forgeNativePlanSchema,
}).strict();

export interface ForgeNativePlanDependencies { db?: Database.Database; controlRoot?: string }

export async function handleForgeSwarmPlan(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeNativePlanDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeNativePlanToolSchema.safeParse(args);
    if (!parsed.success) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: 'forge_native_plan_contract_invalid',
            guardrail: mcpGuardrail('block', 'refuse', 'Native Forge plan input is outside the bounded contract.', ['contract'], []),
        });
    }
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const scope = nativeRunScope(db, parsed.data.run_id);
        const before = getForgeNativeRun(db, parsed.data.run_id);
        const result = recordForgeNativePlan(db, parsed.data.run_id, parsed.data.plan, scope);
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_plan_recorded.v1',
            run_id: parsed.data.run_id,
            replayed: before.plan_sha256 !== null,
            plan: result.plan,
            plan_sha256: result.plan_sha256,
            guardrail: mcpGuardrail('caution', 'verify', 'A plan receipt is source evidence; workers remain bounded direct siblings.', [], ['direct_sibling_only']),
        });
    } catch (error) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: mcpErrorCode(error, 'forge_native_plan_failed'),
            error: error instanceof Error ? error.message : String(error),
            guardrail: mcpGuardrail('block', 'repair', 'Native Forge plan recording failed closed.', ['native_plan'], ['no_fallback']),
        });
    }
}
