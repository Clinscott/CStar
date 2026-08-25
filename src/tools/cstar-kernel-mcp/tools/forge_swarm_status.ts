import type Database from 'better-sqlite3';
import { mcpErrorCode, mcpGuardrail, mcpOutcomeResponse, normalizeErrorMessage,
    type McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT } from '../contracts/runtime.js';
import { openForgeReadDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
    nativeRunPackage,
} from '../../pennyone/intel/forge_native_swarm_controller.js';

export const FORGE_SWARM_STATUS_TOOL_NAME = 'cstar_forge_swarm_status' as const;

export interface ForgeSwarmStatusDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

export async function handleForgeSwarmStatus(
    args: unknown,
    _context?: McpRequestContext,
    dependencies: ForgeSwarmStatusDependencies = {},
): Promise<McpTextResponse> {
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).join(',') !== 'run_id'
        || typeof (args as Record<string, unknown>).run_id !== 'string') {
        return mcpOutcomeResponse('guardrail_block', {
            status: 'blocked', error_code: 'forge_native_status_contract_invalid',
            guardrail: mcpGuardrail('block', 'refuse', 'Native status input failed its closed contract.',
                ['forge_native_status_contract_invalid']),
        });
    }
    const runId = (args as { run_id: string }).run_id;
    const handle = dependencies.db ? null : openForgeReadDb(dependencies.controlRoot ?? CONTROL_ROOT);
    const db = dependencies.db ?? handle!.db;
    try {
        const run = getForgeNativeRun(db, runId);
        const workerPackage = nativeRunPackage(db, runId);
        const receipts = listForgeNativeWorkerReceipts(db, runId);
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.forge_native_swarm_status.v1', status: 'swarm_status',
            run_id: run.run_id, request_id: run.request_id, connection_id: run.connection_id,
            generation: run.generation, state: run.state, plan_sha256: run.plan_sha256,
            lease_expires_at: run.lease_expires_at, worker_package_id: workerPackage.work_package_id,
            requested_identity: workerPackage.requested_identity,
            worker_receipts: receipts.map((receipt) => ({
                work_item_id: receipt.work_item_id, task_id: receipt.task_id,
                status: receipt.status, evidence_sha256: receipt.evidence_sha256,
                actual_identity: receipt.actual_identity,
            })),
            aggregate_receipt: run.aggregate_receipt_json
                ? JSON.parse(run.aggregate_receipt_json) : null,
            unresolved_gaps: JSON.parse(run.unresolved_gaps_json),
            created_at: run.created_at, updated_at: run.updated_at, completed_at: run.completed_at,
            guardrail: mcpGuardrail('allow', 'verify', 'Read-only native run state was projected.'),
        });
    } catch (error) {
        const code = mcpErrorCode(error, 'forge_native_status_internal_error');
        return mcpOutcomeResponse(code.includes('internal') ? 'internal_error' : 'domain_terminal', {
            status: 'blocked', error_code: code, error: normalizeErrorMessage(error),
            guardrail: mcpGuardrail('block', 'refuse', 'No native run state was changed.', [code]),
        });
    } finally {
        handle?.release();
    }
}
