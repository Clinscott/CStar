import type Database from 'better-sqlite3';
import {
    forgeNativeControlReceiptSchema,
    forgeNativePlanSchema,
} from '../contracts/forge_native_swarm.js';
import {
    mcpErrorCode,
    mcpGuardrail,
    mcpOutcomeResponse,
    normalizeErrorMessage,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeNativeRun,
    nativeRunScope,
    recordForgeNativePlan,
} from '../../pennyone/intel/forge_native_swarm_controller.js';
import {
    assertForgeNativeControlReceipt,
    validateDirectForgeNativePlan,
} from '../../pennyone/intel/forge_native_swarm_completion.js';

export const FORGE_SWARM_PLAN_TOOL_NAME = 'cstar_forge_swarm_plan' as const;

export interface ForgeSwarmPlanDependencies {
    db?: Database.Database;
    controlRoot?: string;
    now?: number;
}

function parseArgs(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).sort().join(',') !== 'control_receipt,plan,run_id') return null;
    const value = args as Record<string, unknown>;
    const control = forgeNativeControlReceiptSchema.safeParse(value.control_receipt);
    const plan = forgeNativePlanSchema.safeParse(value.plan);
    return typeof value.run_id === 'string' && control.success && plan.success
        ? { run_id: value.run_id, control_receipt: control.data, plan: plan.data } : null;
}

export async function handleForgeSwarmPlan(
    args: unknown,
    _context?: McpRequestContext,
    dependencies: ForgeSwarmPlanDependencies = {},
): Promise<McpTextResponse> {
    const parsed = parseArgs(args);
    if (!parsed) return mcpOutcomeResponse('guardrail_block', {
        status: 'blocked', error_code: 'forge_native_plan_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native plan input failed its closed contract.',
            ['forge_native_plan_contract_invalid']),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const existing = getForgeNativeRun(db, parsed.run_id);
        assertForgeNativeControlReceipt(db, parsed.run_id, parsed.control_receipt, {
            now: dependencies.now,
            allow_expired_replay: existing.plan_sha256 !== null,
        });
        const plan = validateDirectForgeNativePlan(parsed.plan, nativeRunScope(db, parsed.run_id));
        const result = recordForgeNativePlan(db, parsed.run_id, plan, nativeRunScope(db, parsed.run_id));
        const run = getForgeNativeRun(db, parsed.run_id);
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_swarm_plan_receipt.v1', status: 'swarm_plan_recorded',
            run_id: parsed.run_id, run_state: run.state, plan: result.plan,
            plan_sha256: result.plan_sha256, replayed: existing.plan_sha256 !== null,
            guardrail: mcpGuardrail('allow', 'continue', 'The exact direct-worker plan is recorded.'),
        });
    } catch (error) {
        const code = mcpErrorCode(error, 'forge_native_plan_internal_error');
        return mcpOutcomeResponse(code.includes('internal') ? 'internal_error' : 'guardrail_block', {
            status: 'blocked', error_code: code, error: normalizeErrorMessage(error),
            guardrail: mcpGuardrail('block', 'refuse', 'The plan produced no new worker authority.', [code]),
        });
    }
}
