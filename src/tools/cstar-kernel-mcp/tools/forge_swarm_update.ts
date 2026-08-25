import type Database from 'better-sqlite3';
import { forgeNativeControlReceiptSchema, forgeNativePlanSchema,
    forgeNativeWorkerReceiptSchema } from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, normalizeErrorMessage,
    type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeNativeRun,
    nativeRunScope,
    recordForgeNativeWorkerReceipt,
} from '../../pennyone/intel/forge_native_swarm_controller.js';
import {
    assertForgeNativeControlReceipt,
    validateDirectForgeNativePlan,
} from '../../pennyone/intel/forge_native_swarm_completion.js';

export const FORGE_SWARM_UPDATE_TOOL_NAME = 'cstar_forge_swarm_update' as const;

export interface ForgeSwarmUpdateDependencies {
    db?: Database.Database;
    controlRoot?: string;
    now?: number;
}

function parseArgs(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).sort().join(',') !== 'control_receipt,plan,run_id,worker_receipt') return null;
    const value = args as Record<string, unknown>;
    const control = forgeNativeControlReceiptSchema.safeParse(value.control_receipt);
    const plan = forgeNativePlanSchema.safeParse(value.plan);
    const receipt = forgeNativeWorkerReceiptSchema.safeParse(value.worker_receipt);
    return typeof value.run_id === 'string' && control.success && plan.success && receipt.success
        ? { run_id: value.run_id, control_receipt: control.data, plan: plan.data,
            worker_receipt: receipt.data } : null;
}

export async function handleForgeSwarmUpdate(
    args: unknown,
    _context?: McpRequestContext,
    dependencies: ForgeSwarmUpdateDependencies = {},
): Promise<McpTextResponse> {
    const parsed = parseArgs(args);
    if (!parsed) return mcpOutcomeResponse('guardrail_block', {
        status: 'blocked', error_code: 'forge_native_update_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native update input failed its closed contract.',
            ['forge_native_update_contract_invalid']),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        assertForgeNativeControlReceipt(db, parsed.run_id, parsed.control_receipt,
            { now: dependencies.now });
        const plan = validateDirectForgeNativePlan(parsed.plan, nativeRunScope(db, parsed.run_id));
        const run = getForgeNativeRun(db, parsed.run_id);
        if (!run.plan_sha256 || run.plan_sha256 !== plan.plan_sha256) {
            throw new Error('forge_native_plan_binding_invalid');
        }
        if (parsed.worker_receipt.role !== 'leaf'
            || parsed.worker_receipt.actual_identity !== 'unreported'
            || parsed.worker_receipt.actual_identity_attested) {
            throw new Error('forge_native_worker_identity_self_attestation_forbidden');
        }
        const result = recordForgeNativeWorkerReceipt(db, {
            run_id: parsed.run_id, plan, receipt: parsed.worker_receipt, now: dependencies.now,
            host_actual_identity: 'unreported', host_actual_identity_attested: false,
        });
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_swarm_update_receipt.v1',
            status: result.replayed ? 'worker_update_replayed' : 'worker_update_recorded',
            replayed: result.replayed, run_id: parsed.run_id,
            work_item_id: result.receipt.work_item_id,
            task_id: result.receipt.task_id, evidence_sha256: result.receipt.evidence_sha256,
            run_state: getForgeNativeRun(db, parsed.run_id).state,
            guardrail: mcpGuardrail('allow', 'continue', 'One exact direct-worker receipt is recorded.'),
        });
    } catch (error) {
        const code = mcpErrorCode(error, 'forge_native_update_internal_error');
        return mcpOutcomeResponse(code.includes('internal') ? 'internal_error' : 'guardrail_block', {
            status: 'blocked', error_code: code, error: normalizeErrorMessage(error),
            guardrail: mcpGuardrail('block', 'refuse', 'The worker update changed no authority.', [code]),
        });
    }
}
