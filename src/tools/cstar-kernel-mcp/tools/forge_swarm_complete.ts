import type Database from 'better-sqlite3';
import { forgeNativeControlReceiptSchema, forgeNativeDeliverySchema }
    from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, normalizeErrorMessage,
    type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { completeForgeNativeRun } from '../../pennyone/intel/forge_native_swarm_completion.js';
import type { ForgeNativeAggregateReceipt } from '../../../types/forge_native_swarm.js';

export const FORGE_SWARM_COMPLETE_TOOL_NAME = 'cstar_forge_swarm_complete' as const;

export interface ForgeSwarmCompleteDependencies {
    db?: Database.Database;
    controlRoot?: string;
    now?: number;
}

export async function handleForgeSwarmComplete(
    args: unknown,
    _context?: McpRequestContext,
    dependencies: ForgeSwarmCompleteDependencies = {},
): Promise<McpTextResponse> {
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).sort().join(',') !== 'aggregate,control_receipt,run_id') {
        return mcpOutcomeResponse('guardrail_block', {
            status: 'blocked', error_code: 'forge_native_completion_contract_invalid',
            guardrail: mcpGuardrail('block', 'refuse', 'Native completion input failed its closed contract.',
                ['forge_native_completion_contract_invalid']),
        });
    }
    const value = args as Record<string, unknown>;
    const control = forgeNativeControlReceiptSchema.safeParse(value.control_receipt);
    const aggregate = forgeNativeDeliverySchema.safeParse(value.aggregate);
    if (typeof value.run_id !== 'string' || !control.success || !aggregate.success) {
        return mcpOutcomeResponse('guardrail_block', {
            status: 'blocked', error_code: 'forge_native_completion_contract_invalid',
            guardrail: mcpGuardrail('block', 'refuse', 'Native completion input failed its closed contract.',
                ['forge_native_completion_contract_invalid']),
        });
    }
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const result = completeForgeNativeRun(db, {
            run_id: value.run_id, control_receipt: control.data,
            aggregate: aggregate.data as ForgeNativeAggregateReceipt, now: dependencies.now,
        });
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_swarm_completion_receipt.v1',
            status: result.replayed ? 'swarm_completion_replayed' : 'swarm_completion_recorded',
            replayed: result.replayed, run_id: value.run_id,
            run_state: result.run.state,
            completion_fingerprint_sha256: result.completion_fingerprint_sha256,
            aggregate_receipt: result.aggregate,
            lifecycle_acceptance: false, independent_validation_required: true,
            guardrail: mcpGuardrail('caution', 'verify',
                'Delivery is recorded as DELIVERED_UNVERIFIED; independent validation remains required.'),
        });
    } catch (error) {
        const code = mcpErrorCode(error, 'forge_native_completion_internal_error');
        const outcome = code.includes('internal') ? 'internal_error'
            : code.includes('replay_conflict') || code.includes('run_terminal')
                ? 'domain_terminal' : 'guardrail_block';
        return mcpOutcomeResponse(outcome, {
            status: 'blocked', error_code: code, error: normalizeErrorMessage(error),
            guardrail: mcpGuardrail('block', 'refuse',
                'Completion did not advance lifecycle acceptance.', [code]),
        });
    }
}
