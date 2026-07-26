import { MCP_ERROR_MESSAGE_MAX } from './runtime.js';

export interface McpTextResponse {
    [key: string]: unknown;
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export type McpGuardrailVerdict = 'allow' | 'caution' | 'block';
export type McpGuardrailAction = 'continue' | 'recover' | 'repair' | 'verify' | 'refuse';

export interface McpGuardrailPayload {
    verdict: McpGuardrailVerdict;
    action: McpGuardrailAction;
    reason: string;
    failed_checks: string[];
    warning_checks: string[];
}

export interface McpMutationPayload {
    kind: string;
    persisted: boolean;
    record_id?: string;
    guardrail: McpGuardrailPayload;
}

export function mcpGuardrail(
    verdict: McpGuardrailVerdict,
    action: McpGuardrailAction,
    reason: string,
    failedChecks: string[] = [],
    warningChecks: string[] = [],
): McpGuardrailPayload {
    return {
        verdict,
        action,
        reason,
        failed_checks: failedChecks,
        warning_checks: warningChecks,
    };
}

export function mcpMutation(kind: string, recordId: string | undefined, reason: string): McpMutationPayload {
    return {
        kind,
        persisted: true,
        ...(recordId ? { record_id: recordId } : {}),
        guardrail: mcpGuardrail('allow', 'continue', reason),
    };
}

export function mcpFailedMutation(kind: string, reason: string): McpMutationPayload {
    return {
        kind,
        persisted: false,
        guardrail: mcpGuardrail('block', 'recover', reason, ['persistence_failed']),
    };
}

export function textResponse(payload: unknown, isError = false): McpTextResponse {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        ...(isError ? { isError: true } : {}),
    };
}

export function normalizeErrorMessage(error: unknown, maxLength = MCP_ERROR_MESSAGE_MAX): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/\s+/g, ' ').slice(0, maxLength);
}

export function errorResponse(error: unknown, maxLength = MCP_ERROR_MESSAGE_MAX): McpTextResponse {
    return textResponse({ error: normalizeErrorMessage(error, maxLength) }, true);
}
