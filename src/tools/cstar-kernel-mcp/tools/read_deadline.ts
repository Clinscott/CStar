import {
    DEFAULT_READ_DEADLINE_MS,
    MAX_READ_DEADLINE_MS,
    classifyReadFailure,
    classifyReadError,
    clampReadDeadline,
    clampReadDeadlineMs,
    createReadDeadline,
    isReadCancellation,
    isReadTimeout,
    READ_DEADLINE_CANCELLED_CODE,
    READ_DEADLINE_DEFAULT_MS,
    READ_DEADLINE_HARD_MAX_MS,
    READ_DEADLINE_TIMEOUT_CODE,
    ReadCancellationError,
    ReadCancelledError,
    ReadDeadlineExceededError,
    ReadTimeoutError,
    type ReadDeadline,
    type ReadFailureClassification,
    type ReadFailureKind,
    type ReadDeadlineOptions,
    withReadDeadline,
} from '../contracts/deadlines.js';
import {
    mcpOutcomeResponse,
    normalizeErrorMessage,
    type McpTextResponse,
} from '../contracts/responses.js';

export type ReadOperation<T> = (
    signal: AbortSignal,
    deadline: ReadDeadline,
) => T | PromiseLike<T>;

export interface ReadToolContext {
    signal: AbortSignal;
    deadlineMs: number;
    startedAt: number;
    deadlineAt: number;
}

export async function runBoundedRead<T>(
    operation: ReadOperation<T>,
    options: ReadDeadlineOptions = {},
): Promise<T> {
    return withReadDeadline(operation, options);
}

export const withBoundedRead = runBoundedRead;

export function wrapReadOperation<TArgs, TResult>(
    handler: (args: TArgs, context: ReadToolContext) => TResult | PromiseLike<TResult>,
    defaults: ReadDeadlineOptions = {},
): (args: TArgs, options?: ReadDeadlineOptions) => Promise<TResult> {
    return (args, options = {}) => runBoundedRead(
        (_signal, deadline) => handler(args, {
            signal: deadline.signal,
            deadlineMs: deadline.deadlineMs,
            startedAt: deadline.startedAt,
            deadlineAt: deadline.deadlineAt,
        }),
        { ...defaults, ...options },
    );
}

export const createBoundedReadHandler = wrapReadOperation;

export function readFailureResponse(error: unknown): McpTextResponse {
    const failure = classifyReadFailure(error);
    return mcpOutcomeResponse(failure.outcome, {
        error_code: failure.error_code,
        error: normalizeErrorMessage(error),
        read_failure: failure.classification,
        read_outcome_kind: failure.outcome_kind,
    });
}

export const readDeadlineResponse = readFailureResponse;

export {
    classifyReadError,
    classifyReadFailure,
    clampReadDeadline,
    clampReadDeadlineMs,
    createReadDeadline,
    isReadCancellation,
    isReadTimeout,
    MAX_READ_DEADLINE_MS,
    DEFAULT_READ_DEADLINE_MS,
    READ_DEADLINE_CANCELLED_CODE,
    READ_DEADLINE_DEFAULT_MS,
    READ_DEADLINE_HARD_MAX_MS,
    READ_DEADLINE_TIMEOUT_CODE,
    ReadCancellationError,
    ReadCancelledError,
    ReadDeadlineExceededError,
    ReadTimeoutError,
    type ReadFailureClassification,
    type ReadFailureKind,
    type ReadDeadlineOptions,
    type ReadDeadline,
    withReadDeadline,
};
