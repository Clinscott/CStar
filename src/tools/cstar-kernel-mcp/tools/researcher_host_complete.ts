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
import { CONTROL_ROOT, MCP_ERROR_MESSAGE_MAX } from '../contracts/runtime.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    completeResearcherHostWorker,
    researcherCompletionError,
    type ResearcherHostWorkerCompletionResult,
} from '../../pennyone/intel/researcher_host_worker_completion.js';

export const RESEARCHER_HOST_COMPLETE_TOOL_NAME = 'cstar_researcher_host_complete' as const;

export interface ResearcherHostCompleteHandlerDependencies {
    db?: Database.Database;
    controlRoot?: string;
}

function boundedError(error: unknown): string {
    const message = researcherCompletionError(error);
    return message.replace(/\s+/g, ' ').slice(0, MCP_ERROR_MESSAGE_MAX);
}

function responsePayload(
    input: ResearcherHostCompleteInput,
    result: ResearcherHostWorkerCompletionResult,
): Record<string, unknown> {
    return {
        schema: 'cstar.researcher_terminal_receipt.v1',
        status: result.replayed ? 'host_completion_replayed' : 'DELIVERED_UNVERIFIED',
        outcome: 'ok',
        replayed: result.replayed,
        request_id: input.request_id,
        request_sha256: input.request_sha256,
        bead_id: input.bead_id,
        set_id: input.set_id,
        decision_id: input.decision_id,
        authorization_id: input.authorization_id,
        authorization_sha256: input.authorization_sha256,
        attempt_id: input.attempt_id,
        host_job_id: input.host_job_id,
        handoff_sha256: input.handoff_sha256,
        work_package_sha256: input.work_package_sha256,
        completion_fingerprint_sha256: result.completion_fingerprint_sha256,
        artifact_manifest_sha256: result.artifact_manifest_sha256,
        terminal_receipt_sha256: result.terminal_receipt_sha256,
        validation_binding: result.validation_binding,
        worker_job: result.attempt,
        native_worker_attempts: 1,
        source_tool_calls: input.source_tool_calls,
        source_queries: input.source_queries,
        source_provider_requests_started: input.source_provider_requests_started,
        provider_requests_started: 0,
        retries: 0,
        replays: 0,
        fallbacks: 0,
        descendants: 0,
        hermes_transport_calls: 0,
        legacy_hermes_subprocess_calls: 0,
        requested_model: input.job.requested_model,
        requested_reasoning: input.job.requested_reasoning,
        selector_enforcement: input.job.selector_status,
        actual_identity: input.actual_identity ?? 'unreported',
        protected_effects: {
            cstar_launch: false, network_accessed: false, credentials_accessed: false,
            git_mutation: false, runtime_activation: false,
        },
        guardrail: mcpGuardrail(
            'caution', 'verify',
            'Researcher host evidence was recorded as DELIVERED_UNVERIFIED; delivery is not acceptance.',
            [], ['independent_researcher_validation_required'],
        ),
        next_action: 'Use the one-use Researcher validation subject with a distinct read-only validator, then record cstar_record_result.',
    };
}

export async function handleResearcherHostComplete(
    args: unknown,
    _requestContext?: unknown,
    dependencies: ResearcherHostCompleteHandlerDependencies = {},
): Promise<McpTextResponse> {
    const parsed = researcherHostCompleteSchema.safeParse(args);
    if (!parsed.success) return mcpOutcomeResponse('guardrail_block', {
        status: 'blocked', error_code: 'researcher_host_completion_contract_invalid',
        error: 'Researcher host completion input failed the bounded contract.',
        guardrail: mcpGuardrail('block', 'refuse', 'Host completion was not ingested.',
            ['researcher_host_completion_contract'], ['independent_researcher_validation']),
    });
    try {
        const db = dependencies.db ?? getForgeWritableDb(dependencies.controlRoot ?? CONTROL_ROOT);
        const result = completeResearcherHostWorker(db, parsed.data);
        return mcpOutcomeResponse('ok', responsePayload(parsed.data, result));
    } catch (error) {
        const code = mcpErrorCode(error, 'researcher_host_completion_blocked');
        return mcpOutcomeResponse('guardrail_block', {
            status: 'blocked', error_code: code, error: boundedError(error),
            guardrail: mcpGuardrail('block', 'refuse',
                'Researcher host completion failed closed before acceptance.',
                [code], ['researcher_host_completion', 'independent_researcher_validation']),
            researcher_execution: {
                host_execution_ingested: false, native_worker_attempts: 0,
                provider_requests_started: 0, hermes_transport_calls: 0,
                legacy_hermes_subprocess_calls: 0, retries: 0, replays: 0,
                fallbacks: 0, descendants: 0, network_accessed: false,
            },
        });
    }
}

export type ResearcherHostCompleteToolInput = ResearcherHostCompleteInput;
