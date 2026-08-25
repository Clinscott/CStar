import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { completeForgeNativeRun } from '../../pennyone/intel/forge_native_swarm_completion.js';
import { forgeNativePlanSchema } from '../contracts/forge_native_swarm.js';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';

const checks = z.array(z.object({ command: z.string().trim().min(1).max(8_192), status: z.enum(['passed', 'failed', 'untested']), evidence_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()).max(256);
const artifacts = z.array(z.object({ path: z.string().trim().min(1).max(4_096), sha256: z.string().regex(/^[a-f0-9]{64}$/), byte_count: z.number().int().nonnegative() }).strict()).max(256);

export const forgeNativeCompleteSchema = z.object({
    run_id: z.string().trim().min(1).max(192),
    request_id: z.string().trim().min(1).max(192),
    plan: forgeNativePlanSchema,
    parent_task_id: z.string().trim().min(1).max(192),
    checks,
    artifacts,
    unresolved_gaps: z.array(z.string().trim().min(1).max(256)).max(256).optional(),
    actual_identities: z.record(z.string(), z.object({ identity: z.string().trim().min(1).max(256), attested: z.boolean() }).strict()).optional(),
    candidate_digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export interface ForgeNativeCompleteDependencies { db?: Database.Database; controlRoot?: string }

export async function handleForgeSwarmComplete(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeNativeCompleteDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeNativeCompleteSchema.safeParse(args);
    if (!parsed.success) return mcpOutcomeResponse('guardrail_block', {
        error_code: 'forge_native_complete_contract_invalid',
        guardrail: mcpGuardrail('block', 'refuse', 'Native aggregate input is outside the bounded contract.', ['contract'], []),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const actual = parsed.data.actual_identities
            ? new Map(Object.entries(parsed.data.actual_identities))
            : undefined;
        const result = completeForgeNativeRun(db, { ...parsed.data, actual_identities: actual });
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_delivery.v1',
            replayed: result.replayed,
            delivery: result.receipt,
            next_action: 'Launch a standalone validator and record cstar_record_result; delivery is DELIVERED_UNVERIFIED.',
            guardrail: mcpGuardrail('caution', 'verify', 'Native aggregation stops at DELIVERED_UNVERIFIED.', [], ['independent_validation_required']),
        });
    } catch (error) {
        return mcpOutcomeResponse('guardrail_block', {
            error_code: mcpErrorCode(error, 'forge_native_complete_failed'),
            error: error instanceof Error ? error.message : String(error),
            guardrail: mcpGuardrail('block', 'repair', 'Native aggregation failed closed; no acceptance transition occurred.', ['native_completion'], ['no_fallback']),
        });
    }
}
