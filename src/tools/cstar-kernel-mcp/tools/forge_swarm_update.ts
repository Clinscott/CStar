import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    intersectNativeAuthority,
    recordForgeNativePlan,
    recordForgeNativeWorkerReceipt,
    reserveForgeNativeRun,
    type NativeAuthorityIntersectionInput,
} from '../../pennyone/intel/forge_native_swarm_controller.js';
import {
    forgeNativeAuthorityScopeSchema,
    forgeNativePlanSchema,
    forgeNativeRequestSchema,
    forgeNativeWorkerReceiptSchema,
} from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';

const scopeBinding = z.object({
    durable_set: forgeNativeAuthorityScopeSchema,
    immutable_request: forgeNativeAuthorityScopeSchema,
    connection_policy: forgeNativeAuthorityScopeSchema,
    run_lease: forgeNativeAuthorityScopeSchema,
}).strict();

export const forgeNativeUpdateSchema = z.object({
    action: z.enum(['reserve', 'plan', 'worker_receipt', 'intersect']),
    request: forgeNativeRequestSchema.optional(),
    evidence_root: z.string().trim().min(1).max(4_096).optional(),
    run_id: z.string().trim().min(1).max(192).optional(),
    run_idempotency_key: z.string().trim().min(1).max(192).optional(),
    plan: forgeNativePlanSchema.optional(),
    scope: forgeNativeAuthorityScopeSchema.optional(),
    receipt: forgeNativeWorkerReceiptSchema.optional(),
    authority_intersection: scopeBinding.optional(),
    host_actual_identity: z.string().trim().min(1).max(256).optional(),
    host_actual_identity_attested: z.boolean().optional(),
}).strict();

export interface ForgeNativeUpdateDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

function bad(message: string, code: string): McpTextResponse {
    return mcpOutcomeResponse('guardrail_block', {
        error_code: code,
        error: message,
        guardrail: mcpGuardrail('block', 'refuse', 'Native Forge update was rejected before an unsafe transition.', [code], []),
    });
}

export async function handleForgeSwarmUpdate(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeNativeUpdateDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeNativeUpdateSchema.safeParse(args);
    if (!parsed.success) return bad('Native Forge update input failed the bounded contract.', 'forge_native_update_contract_invalid');
    try {
        if (parsed.data.action === 'intersect') {
            if (!parsed.data.authority_intersection) return bad('Authority intersection is required.', 'forge_native_authority_missing');
            const result = intersectNativeAuthority(parsed.data.authority_intersection as NativeAuthorityIntersectionInput);
            return mcpOutcomeResponse('ok', { schema: 'cstar.forge_native_authority_intersection.v1', ...result });
        }
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        if (parsed.data.action === 'reserve') {
            if (!parsed.data.request || !parsed.data.evidence_root) return bad('Reserve requires request and evidence_root.', 'forge_native_reserve_input_missing');
            const result = reserveForgeNativeRun(db, { request: parsed.data.request, evidence_root: parsed.data.evidence_root, run_id: parsed.data.run_id });
            return mcpOutcomeResponse('ok', {
                schema: 'cstar.forge_native_reservation.v1',
                replayed: result.replayed,
                run_id: result.run.run_id,
                worker_package: result.worker_package,
                control_receipt: result.control_receipt,
            });
        }
        if (!parsed.data.run_id) return bad('run_id is required.', 'forge_native_run_id_missing');
        if (parsed.data.action === 'plan') {
            if (!parsed.data.plan || !parsed.data.scope) return bad('Plan requires plan and scope.', 'forge_native_plan_input_missing');
            const result = recordForgeNativePlan(db, parsed.data.run_id, parsed.data.plan, parsed.data.scope);
            return mcpOutcomeResponse('ok', { schema: 'cstar.forge_native_plan_recorded.v1', ...result });
        }
        if (!parsed.data.receipt || !parsed.data.plan) return bad('Worker receipt requires receipt and plan.', 'forge_native_receipt_input_missing');
        const result = recordForgeNativeWorkerReceipt(db, {
            run_id: parsed.data.run_id,
            plan: parsed.data.plan,
            receipt: parsed.data.receipt,
            host_actual_identity: parsed.data.host_actual_identity,
            host_actual_identity_attested: parsed.data.host_actual_identity_attested,
        });
        return mcpOutcomeResponse('ok', { schema: 'cstar.forge_native_worker_recorded.v1', ...result });
    } catch (error) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: mcpErrorCode(error, 'forge_native_update_failed'),
            error: error instanceof Error ? error.message : String(error),
            guardrail: mcpGuardrail('block', 'repair', 'Native Forge update failed closed with no fallback.', ['native_update'], ['no_fallback']),
        });
    }
}
