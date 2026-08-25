import type Database from 'better-sqlite3';

import {
    researcherHostCompleteSchema,
    type ResearcherHostCompleteInput,
} from '../contracts/researcher_host_completion.js';
import {
    mcpErrorCode,
    mcpGuardrail,
    mcpOutcomeResponse,
    type McpTextResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CONTROL_ROOT, MCP_ERROR_MESSAGE_MAX } from '../contracts/runtime.js';
import { database } from '../../pennyone/intel/database.js';
import {
    completeResearcherHostWorker,
    type ResearcherHostWorkerCompletionResult,
} from '../../pennyone/intel/researcher_host_worker_completion.js';

export const RESEARCHER_HOST_COMPLETE_TOOL_NAME = 'cstar_researcher_host_complete' as const;

export interface ResearcherHostCompleteHandlerDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

function boundedError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').slice(0, MCP_ERROR_MESSAGE_MAX);
}

function failureOutcome(error: unknown): 'guardrail_block' | 'domain_terminal' | 'internal_error' {
    const code = mcpErrorCode(error, 'cstar_researcher_host_completion_internal_error');
    if (code.includes('terminal_attempt') || code.includes('replay_conflict') || code.includes('unknown_attempt')) return 'domain_terminal';
    if (code.startsWith('cstar_researcher_')) return 'guardrail_block';
    return 'internal_error';
}

function failureResponse(outcome: ReturnType<typeof failureOutcome>, errorCode: string, error: string): McpTextResponse {
    return mcpOutcomeResponse(outcome, {
        status: 'blocked', error_code: errorCode, error,
        guardrail: mcpGuardrail('block', outcome === 'internal_error' ? 'repair' : 'refuse',
            'Researcher host completion was not ingested; delivery remains unaccepted until the boundary is repaired or independently validated.',
            [errorCode], ['researcher_host_completion', 'independent_validation']),
        researcher_execution: {
            host_execution_ingested: false, provider_requests_started: 0,
            network_accessed: false, cognition_launch: false, cstar_launch: false,
        },
    });
}

function responsePayload(
    input: ResearcherHostCompleteInput,
    result: ResearcherHostWorkerCompletionResult,
): Record<string, unknown> {
    return {
        schema: 'cstar.researcher_host_completion_receipt.v1',
        status: result.replayed ? 'researcher_host_completion_replayed' : 'researcher_host_completion_recorded',
        replayed: result.replayed, request_id: input.request_id,
        request_sha256: input.request_sha256, job_id: input.job_id, attempt_id: input.attempt_id,
        handoff_sha256: input.handoff_sha256, fingerprint_sha256: result.fingerprint_sha256,
        artifact_manifest: input.artifact_manifest,
        artifact_manifest_sha256: result.artifact_manifest_sha256,
        terminal_outcome: input.terminal_receipt.outcome, ledger_state: result.job.state,
        validation_binding: result.validation_binding,
        researcher_execution: {
            host_execution_ingested: true,
            provider_requests_started: input.provider_requests_started,
            source_tool_calls: input.source_tool_calls,
            network_accessed: false, cognition_launch: false, cstar_launch: false,
            requested_model: input.job.requested_model,
            requested_reasoning: input.job.requested_reasoning,
            actual_identity: input.terminal_receipt.actual_identity,
        },
        guardrail: mcpGuardrail('caution', 'verify',
            'Host evidence was ingested as Researcher delivery pending independent validation; no acceptance was performed.',
            [], ['researcher_host_completion', 'independent_validation']),
        next_action: 'Provide the binding to a distinct independent validator and record cstar_record_result; delivery is not acceptance.',
    };
}

export async function handleResearcherHostComplete(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: ResearcherHostCompleteHandlerDependencies = {},
): Promise<McpTextResponse> {
    const parsed = researcherHostCompleteSchema.safeParse(args);
    if (!parsed.success) return failureResponse('guardrail_block', 'cstar_researcher_host_completion_contract_invalid', 'Host completion input failed the bounded contract.');
    try {
        const db = dependencies.db ?? database.getWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const result = completeResearcherHostWorker(db, parsed.data);
        return mcpOutcomeResponse('ok', responsePayload(parsed.data, result));
    } catch (error) {
        return failureResponse(failureOutcome(error), mcpErrorCode(error, 'cstar_researcher_host_completion_blocked'), boundedError(error));
    }
}

export type ResearcherHostCompleteToolInput = ResearcherHostCompleteInput;
