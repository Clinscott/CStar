import type Database from 'better-sqlite3';
import { forgeNativeControlReceiptSchema, forgeNativePlanSchema }
    from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, normalizeErrorMessage,
    type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    cancelForgeNativeRun,
    getForgeNativeRun,
    markForgeNativeRunUnknown,
    nativeRunScope,
    updateForgeNativeRunState,
} from '../../pennyone/intel/forge_native_swarm_controller.js';
import {
    assertForgeNativeControlReceipt,
    taskGraphIsTerminal,
    validateDirectForgeNativePlan,
} from '../../pennyone/intel/forge_native_swarm_completion.js';
import type { ForgeNativeTaskGraphNode } from '../../../types/forge_native_swarm.js';

export const FORGE_SWARM_CANCEL_TOOL_NAME = 'cstar_forge_swarm_cancel' as const;

export interface ForgeSwarmCancelDependencies {
    db?: Database.Database;
    controlRoot?: string;
    now?: number;
}

function directGraphValid(plan: ReturnType<typeof validateDirectForgeNativePlan>, graph: ForgeNativeTaskGraphNode[]): boolean {
    if (graph.length !== plan.work_items.length + 1) return false;
    const keys = ['actual_identity', 'actual_identity_attested', 'parent_task_id', 'requested_model',
        'requested_reasoning', 'role', 'status', 'task_id', 'work_item_id'];
    if (graph.some((node) => Object.keys(node).sort().join(',') !== keys.join(',')
        || typeof node.task_id !== 'string' || !node.task_id
        || node.actual_identity !== 'unreported' || node.actual_identity_attested)) return false;
    const root = graph[0];
    if (root.task_id !== plan.parent_task_id || root.parent_task_id !== null
        || root.role !== 'parent' || root.work_item_id !== null) return false;
    return plan.work_items.every((item, index) => {
        const node = graph[index + 1];
        return node.role === 'leaf' && node.parent_task_id === plan.parent_task_id
            && node.work_item_id === item.work_item_id;
    }) && new Set(graph.map((node) => node.task_id)).size === graph.length;
}

export async function handleForgeSwarmCancel(
    args: unknown,
    _context?: McpRequestContext,
    dependencies: ForgeSwarmCancelDependencies = {},
): Promise<McpTextResponse> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return contractFailure();
    const value = args as Record<string, unknown>;
    const allowed = ['action', 'all_tasks_inspectable', 'control_receipt', 'observed_task_graph',
        'plan', 'reason', 'run_id'];
    if (Object.keys(value).some((key) => !allowed.includes(key))
        || !['request', 'finalize'].includes(String(value.action))
        || typeof value.run_id !== 'string') return contractFailure();
    const control = forgeNativeControlReceiptSchema.safeParse(value.control_receipt);
    if (!control.success) return contractFailure();
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        assertForgeNativeControlReceipt(db, value.run_id, control.data, { now: dependencies.now });
        if (value.action === 'request') {
            if (value.plan !== undefined || value.observed_task_graph !== undefined
                || value.all_tasks_inspectable !== undefined || value.reason !== undefined) return contractFailure();
            const run = cancelForgeNativeRun(db, value.run_id, control.data);
            return success(run.state, value.run_id, false);
        }
        if (typeof value.all_tasks_inspectable !== 'boolean'
            || !Array.isArray(value.observed_task_graph)) return contractFailure();
        const run = getForgeNativeRun(db, value.run_id);
        if (run.state !== 'CANCEL_REQUESTED') throw new Error('forge_native_cancellation_not_requested');
        if (!value.all_tasks_inspectable) {
            const reason = typeof value.reason === 'string' && value.reason.trim()
                ? value.reason.trim() : 'forge_native_cancellation_task_uninspectable';
            return success(markForgeNativeRunUnknown(db, value.run_id, reason).state,
                value.run_id, true);
        }
        if (!run.plan_sha256) {
            if (value.plan !== undefined || value.observed_task_graph.length !== 0) {
                return success(markForgeNativeRunUnknown(db, value.run_id,
                    'forge_native_cancellation_stop_proof_invalid').state, value.run_id, true);
            }
        } else {
            const parsedPlan = forgeNativePlanSchema.safeParse(value.plan);
            const graph = value.observed_task_graph as ForgeNativeTaskGraphNode[];
            if (!parsedPlan.success) return contractFailure();
            const plan = validateDirectForgeNativePlan(parsedPlan.data, nativeRunScope(db, value.run_id));
            if (plan.plan_sha256 !== run.plan_sha256 || !directGraphValid(plan, graph)
                || !taskGraphIsTerminal(graph) || graph.some((node) => node.status === 'UNKNOWN')) {
                return success(markForgeNativeRunUnknown(db, value.run_id,
                    'forge_native_cancellation_stop_proof_invalid').state, value.run_id, true);
            }
        }
        const cancelled = updateForgeNativeRunState(db, value.run_id, 'CANCELLED', [], dependencies.now);
        return success(cancelled.state, value.run_id, true);
    } catch (error) {
        const code = mcpErrorCode(error, 'forge_native_cancel_internal_error');
        return mcpOutcomeResponse(code.includes('internal') ? 'internal_error' : 'guardrail_block', {
            status: 'blocked', error_code: code, error: normalizeErrorMessage(error),
            guardrail: mcpGuardrail('block', 'refuse', 'Cancellation did not prove a terminal stop.', [code]),
        });
    }
}

function contractFailure(): McpTextResponse {
    return mcpOutcomeResponse('guardrail_block', {
        status: 'blocked', error_code: 'forge_native_cancel_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native cancel input failed its closed contract.',
            ['forge_native_cancel_contract_invalid']),
    });
}

function success(state: string, runId: string, finalized: boolean): McpTextResponse {
    return mcpOutcomeResponse('ok', {
        schema: 'cstar.forge_native_swarm_cancel_receipt.v1', status: 'swarm_cancel_recorded',
        run_id: runId, run_state: state, finalized, worktree_retained: true,
        replacement_launched: false,
        guardrail: mcpGuardrail('caution', 'verify',
            finalized ? 'Cancellation terminal evidence is recorded.'
                : 'CANCEL_REQUESTED is recorded; the host must interrupt and report every observed task.'),
    });
}
