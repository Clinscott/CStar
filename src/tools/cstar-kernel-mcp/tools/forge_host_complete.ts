import type Database from 'better-sqlite3';

import {
    forgeHostCompleteSchema,
    type ForgeHostCompleteInput,
} from '../contracts/forge_host_completion.js';
import {
    mcpErrorCode,
    mcpGuardrail,
    mcpOutcomeResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT, MCP_ERROR_MESSAGE_MAX } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    completeForgeHostWorker,
    type ForgeHostWorkerCompletionResult,
} from '../../pennyone/intel/forge_host_worker_completion.js';

export const FORGE_HOST_COMPLETE_TOOL_NAME = 'cstar_forge_host_complete' as const;

export interface ForgeHostCompleteHandlerDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

function boundedError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').slice(0, MCP_ERROR_MESSAGE_MAX);
}

type CompletionFailureOutcome = 'guardrail_block' | 'domain_terminal' | 'internal_error';

function failureOutcome(error: unknown): CompletionFailureOutcome {
    const code = mcpErrorCode(error, 'forge_host_completion_internal_error');
    if (code === 'forge_host_completion_unknown_attempt'
        || code.startsWith('forge_host_completion_terminal_attempt')
        || code === 'forge_host_completion_replay_conflict'
        || code === 'forge_host_completion_existing_delivery_conflict'
        || code === 'forge_delivery_transition_invalid') {
        return 'domain_terminal';
    }
    if (code === 'forge_host_completion_spend_normalization_race') return 'internal_error';
    if (code.startsWith('forge_host_completion_')
        || code.startsWith('forge_attempt_')
        || code.startsWith('validation_ticket_')
        || code.startsWith('forge_delivery_')) {
        return 'guardrail_block';
    }
    return 'internal_error';
}

function failureResponse(
    outcome: CompletionFailureOutcome,
    errorCode: string,
    error: string,
): McpTextResponse {
    return mcpOutcomeResponse(outcome, {
        status: 'blocked',
        error_code: errorCode,
        error,
        guardrail: mcpGuardrail(
            'block',
            outcome === 'internal_error' ? 'repair' : 'refuse',
            'Host completion was not ingested; delivery remains unaccepted until the boundary is repaired or independently resolved.',
            [errorCode],
            ['forge_host_completion', 'independent_validation_ticket'],
        ),
        forge_execution: {
            host_execution_ingested: false,
            provider_attempted: false,
            provider_requests_started: 0,
            live_spend: false,
            spend_uncertain: false,
            known_spend_observed: false,
            network_accessed: false,
            cognition_launch: false,
            cstar_launch: false,
        },
    });
}

function responsePayload(
    input: ForgeHostCompleteInput,
    result: ForgeHostWorkerCompletionResult,
): Record<string, unknown> {
    return {
        schema: 'cstar.forge_host_completion_receipt.v1',
        status: result.replayed ? 'host_completion_replayed' : 'host_completion_recorded',
        replayed: result.replayed,
        forge_request_receipt_id: input.forge_request_receipt_id,
        request_sha256: input.request_sha256,
        scope_sha256: input.scope_sha256,
        handoff_sha256: input.handoff_sha256,
        execution_receipt_id: input.execution_receipt_id,
        attempt_id: input.attempt_id,
        host_job_id: input.host_job_id,
        result_status: result.attempt.result_status,
        attempt_status: result.attempt.status,
        request_status: result.request.status,
        completion_fingerprint_sha256: result.completion_fingerprint_sha256,
        artifact_manifest: input.artifact_manifest,
        artifact_manifest_sha256: result.artifact_manifest_sha256,
        validation_ticket_status: result.validation_ticket_status,
        ...(result.validation_ticket ? { validation_ticket: result.validation_ticket } : {}),
        forge_execution: {
            host_execution_ingested: true,
            provider_attempted: false,
            provider_requests_started: 0,
            live_spend: false,
            spend_uncertain: false,
            known_spend_observed: false,
            network_accessed: false,
            cognition_launch: false,
            cstar_launch: false,
            requested_model: input.job.requested_model,
            requested_reasoning: input.job.requested_reasoning,
            actual_identity: input.job.actual_identity,
            codex_worker_fallback_allowed: false,
        },
        guardrail: mcpGuardrail(
            'caution',
            'verify',
            'Host evidence was ingested as delivery pending independent validation; no CStar or provider launch occurred.',
            [],
            ['forge_host_completion', 'independent_validation_ticket'],
        ),
        next_action: 'Use the bound one-use independent-validator ticket and record independent validation; this attempt remains STARTED until then.',
    };
}

export async function handleForgeHostComplete(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ForgeHostCompleteHandlerDependencies = {},
): Promise<McpTextResponse> {
    const parsed = forgeHostCompleteSchema.safeParse(args);
    if (!parsed.success) {
        return failureResponse(
            'guardrail_block',
            'forge_host_completion_contract_invalid',
            'Host completion input failed the bounded contract.',
        );
    }
    try {
        const db = dependencies.db
            ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const result = completeForgeHostWorker(db, parsed.data);
        return mcpOutcomeResponse('ok', responsePayload(parsed.data, result));
    } catch (error) {
        return failureResponse(
            failureOutcome(error),
            mcpErrorCode(error, 'forge_host_completion_blocked'),
            boundedError(error),
        );
    }
}

export type ForgeHostCompleteToolInput = ForgeHostCompleteInput;
