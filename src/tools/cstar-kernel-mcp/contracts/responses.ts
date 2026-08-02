import { MCP_ERROR_MESSAGE_MAX } from './runtime.js';

export interface McpTextResponse {
    [key: string]: unknown;
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export const MCP_OUTCOMES = [
    'ok',
    'needs_input',
    'guardrail_block',
    'domain_terminal',
    'transport_error',
    'internal_error',
] as const;

export type McpOutcome = typeof MCP_OUTCOMES[number];
export type McpOutcomeKind = McpOutcome;

export const MCP_OUTCOME_KINDS = MCP_OUTCOMES;

export type McpOutcomeCategory =
    | 'success'
    | 'input'
    | 'guardrail'
    | 'domain'
    | 'transport'
    | 'internal';

export interface McpOutcomeMetadata {
    outcome: McpOutcome;
    outcome_kind: McpOutcomeCategory;
    is_error: boolean;
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

const MCP_OUTCOME_CATEGORIES: Record<McpOutcome, McpOutcomeCategory> = {
    ok: 'success',
    needs_input: 'input',
    guardrail_block: 'guardrail',
    domain_terminal: 'domain',
    transport_error: 'transport',
    internal_error: 'internal',
};

export function isMcpOutcome(value: unknown): value is McpOutcome {
    return typeof value === 'string'
        && (MCP_OUTCOMES as readonly string[]).includes(value);
}

export function isMcpErrorOutcome(outcome: McpOutcome): boolean {
    return outcome === 'transport_error' || outcome === 'internal_error';
}

export function mcpOutcomeMetadata(outcome: McpOutcome): McpOutcomeMetadata {
    return {
        outcome,
        outcome_kind: MCP_OUTCOME_CATEGORIES[outcome],
        is_error: isMcpErrorOutcome(outcome),
    };
}

function inferMcpOutcome(payload: unknown): McpOutcome | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const candidate = (payload as Record<string, unknown>).outcome;
    if (isMcpOutcome(candidate)) return candidate;
    const guardrail = (payload as Record<string, unknown>).guardrail;
    if (
        guardrail
        && typeof guardrail === 'object'
        && (guardrail as Record<string, unknown>).verdict === 'block'
    ) return 'guardrail_block';
    return undefined;
}

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
    const outcome = inferMcpOutcome(payload);
    const effectiveIsError = outcome === undefined ? isError : isMcpErrorOutcome(outcome);
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        ...(effectiveIsError ? { isError: true } : {}),
    };
}

export function mcpOutcomeResponse(
    outcome: McpOutcome,
    payload: Record<string, unknown> = {},
): McpTextResponse {
    return textResponse({
        ...payload,
        ...mcpOutcomeMetadata(outcome),
    });
}

export const typedOutcomeResponse = mcpOutcomeResponse;

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
    const outcome = inferMcpOutcome(payload) ?? 'internal_error';
    return mcpOutcomeResponse(outcome, {
        ...payload,
        error_code: mcpErrorCode(errorCode, 'cstar_internal_error'),
        error: normalizeErrorMessage(error, maxLength),
    });
}

export function nonRecordablePreAuthorizationResponse(
    payload: unknown,
    _isError = false,
): McpTextResponse {
    const responsePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : { value: payload };
    return markNonRecordablePreAuthorizationResponse(
        mcpOutcomeResponse('guardrail_block', responsePayload),
    );
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
    const response = mcpOutcomeResponse('guardrail_block', {
        ...payload,
        error_code: mcpErrorCode(errorCode, 'cstar_guardrail_block'),
        error: normalizeErrorMessage(error),
    });
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
