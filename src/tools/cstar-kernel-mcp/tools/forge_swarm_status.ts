import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
} from '../../pennyone/intel/forge_native_swarm_controller.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';

export const forgeNativeStatusSchema = z.object({
    run_id: z.string().trim().min(1).max(192),
}).strict();

export interface ForgeNativeStatusDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

export async function handleForgeSwarmStatus(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeNativeStatusDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeNativeStatusSchema.safeParse(args);
    if (!parsed.success) return mcpOutcomeResponse('guardrail_block', {
        error_code: 'forge_native_status_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native Forge status input is outside the bounded contract.', ['contract'], []),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const run = getForgeNativeRun(db, parsed.data.run_id);
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_status.v1',
            run_id: run.run_id,
            request_id: run.request_id,
            state: run.state,
            plan_sha256: run.plan_sha256,
            unresolved_gaps: JSON.parse(run.unresolved_gaps_json),
            worker_receipts: listForgeNativeWorkerReceipts(db, run.run_id),
            guardrail: mcpGuardrail('caution', 'verify', 'Native delivery is not acceptance; use an independent validation ticket.', [], ['DELIVERED_UNVERIFIED']),
        });
    } catch (error) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: mcpErrorCode(error, 'forge_native_status_failed'),
            error: error instanceof Error ? error.message : String(error),
            guardrail: mcpGuardrail('block', 'repair', 'Native Forge status could not be read.', ['native_status'], []),
        });
    }
}
