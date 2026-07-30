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

const nonRecordablePreAuthorizationResponses = new WeakSet<object>();
const nonRecordablePreAuthorizationErrors = new WeakSet<object>();

export function mcpErrorCode(error: unknown, fallback = 'cstar_internal_error'): string {
    const message = normalizeErrorMessage(error, 256);
    const match = /^([a-z][a-z0-9_]{2,127})(?::|$)/.exec(message);
    return match?.[1] ?? fallback;
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
    return textResponse({
        error_code: mcpErrorCode(error),
        error: normalizeErrorMessage(error, maxLength),
    }, true);
}

export function errorPayloadResponse(
    payload: Record<string, unknown>,
    errorCode: string,
    error: unknown = payload.error ?? errorCode,
    maxLength = MCP_ERROR_MESSAGE_MAX,
): McpTextResponse {
    return textResponse({
        ...payload,
        error_code: mcpErrorCode(errorCode, 'cstar_internal_error'),
        error: normalizeErrorMessage(error, maxLength),
    }, true);
}

export function nonRecordablePreAuthorizationResponse(
    payload: unknown,
    isError = false,
): McpTextResponse {
    return markNonRecordablePreAuthorizationResponse(textResponse(payload, isError));
}

export function markNonRecordablePreAuthorizationResponse(
    response: McpTextResponse,
): McpTextResponse {
    nonRecordablePreAuthorizationResponses.add(response);
    return response;
}

export function preAuthorizationResponse(
    payload: Record<string, unknown>,
    errorCode: string,
    error: unknown = payload.error ?? errorCode,
): McpTextResponse {
    const response = errorPayloadResponse(payload, errorCode, error);
    return markNonRecordablePreAuthorizationResponse(response);
}

export function preAuthorizationErrorResponse(
    errorCode: string,
    error: unknown = errorCode,
): McpTextResponse {
    return preAuthorizationResponse({}, errorCode, error);
}

export function preAuthorizationError(errorCode: string, message: unknown = errorCode): Error {
    const error = new Error(normalizeErrorMessage(message));
    nonRecordablePreAuthorizationErrors.add(error);
    return error;
}

export function isNonRecordablePreAuthorization(value: unknown): boolean {
    return Boolean(
        value
        && typeof value === 'object'
        && (
            nonRecordablePreAuthorizationResponses.has(value)
            || nonRecordablePreAuthorizationErrors.has(value)
        )
    );
}
