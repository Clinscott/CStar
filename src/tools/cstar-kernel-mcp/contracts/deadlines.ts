import {
    mcpErrorCode,
    type McpOutcome,
} from './responses.js';

export const DEFAULT_READ_DEADLINE_MS = 5_000;
export const MAX_READ_DEADLINE_MS = 30_000;
export const READ_DEADLINE_DEFAULT_MS = DEFAULT_READ_DEADLINE_MS;
export const READ_DEADLINE_HARD_MAX_MS = MAX_READ_DEADLINE_MS;
export const READ_DEADLINE_TIMEOUT_CODE = 'read_deadline_exceeded';
export const READ_DEADLINE_CANCELLED_CODE = 'read_cancelled';

export type ReadFailureKind = 'timeout' | 'cancelled' | 'error';

export interface ReadFailureClassification {
    classification: ReadFailureKind;
    kind: ReadFailureKind;
    outcome: Extract<McpOutcome, 'transport_error' | 'internal_error'>;
    outcome_kind: 'transport' | 'internal';
    error_code: string;
}

export interface ReadDeadlineOptions {
    deadlineMs?: number | null;
    timeoutMs?: number | null;
    signal?: AbortSignal | null;
}

export interface ReadDeadline {
    readonly signal: AbortSignal;
    readonly deadlineMs: number;
    readonly startedAt: number;
    readonly deadlineAt: number;
    cancel(reason?: unknown): void;
    cleanup(): void;
}

export class ReadDeadlineExceededError extends Error {
    readonly code = READ_DEADLINE_TIMEOUT_CODE;
    readonly outcome = 'transport_error' as const;
    readonly deadlineMs: number;

    constructor(deadlineMs: number) {
        super(`${READ_DEADLINE_TIMEOUT_CODE}:${deadlineMs}`);
        this.name = 'ReadDeadlineExceededError';
        this.deadlineMs = deadlineMs;
    }
}

export { ReadDeadlineExceededError as ReadTimeoutError };

export class ReadCancellationError extends Error {
    readonly code = READ_DEADLINE_CANCELLED_CODE;
    readonly outcome = 'transport_error' as const;

    constructor(reason?: unknown) {
        super(
            READ_DEADLINE_CANCELLED_CODE,
            reason === undefined ? undefined : { cause: reason },
        );
        this.name = 'ReadCancellationError';
    }
}

export { ReadCancellationError as ReadCancelledError };

export function clampReadDeadlineMs(value?: number | null): number {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return DEFAULT_READ_DEADLINE_MS;
    }
    if (value === Number.POSITIVE_INFINITY) return MAX_READ_DEADLINE_MS;
    if (value === Number.NEGATIVE_INFINITY) return 0;
    if (!Number.isFinite(value)) return DEFAULT_READ_DEADLINE_MS;
    return Math.min(MAX_READ_DEADLINE_MS, Math.max(0, Math.trunc(value)));
}

export const clampReadDeadline = clampReadDeadlineMs;

function hasProperty(value: unknown, property: string): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && property in value);
}

export function isReadTimeout(error: unknown): boolean {
    if (error instanceof ReadDeadlineExceededError) return true;
    if (!hasProperty(error, 'code') && !hasProperty(error, 'name')) return false;
    const code = hasProperty(error, 'code') ? error.code : undefined;
    const name = hasProperty(error, 'name') ? error.name : undefined;
    return code === READ_DEADLINE_TIMEOUT_CODE
        || code === 'ETIMEDOUT'
        || name === 'TimeoutError'
        || (typeof error === 'object'
            && error !== null
            && 'message' in error
            && typeof error.message === 'string'
            && error.message.startsWith(`${READ_DEADLINE_TIMEOUT_CODE}:`));
}

export function isReadCancellation(error: unknown): boolean {
    if (error instanceof ReadCancellationError) return true;
    if (!hasProperty(error, 'code') && !hasProperty(error, 'name')) return false;
    const code = hasProperty(error, 'code') ? error.code : undefined;
    const name = hasProperty(error, 'name') ? error.name : undefined;
    return code === READ_DEADLINE_CANCELLED_CODE
        || code === 'ABORT_ERR'
        || name === 'AbortError';
}

export function classifyReadError(error: unknown): ReadFailureKind {
    if (isReadTimeout(error)) return 'timeout';
    if (isReadCancellation(error)) return 'cancelled';
    return 'error';
}

export function classifyReadFailure(error: unknown): ReadFailureClassification {
    const classification = classifyReadError(error);
    if (classification === 'timeout') {
        return {
            classification,
            kind: classification,
            outcome: 'transport_error',
            outcome_kind: 'transport',
            error_code: READ_DEADLINE_TIMEOUT_CODE,
        };
    }
    if (classification === 'cancelled') {
        return {
            classification,
            kind: classification,
            outcome: 'transport_error',
            outcome_kind: 'transport',
            error_code: READ_DEADLINE_CANCELLED_CODE,
        };
    }
    return {
        classification,
        kind: classification,
        outcome: 'internal_error',
        outcome_kind: 'internal',
        error_code: mcpErrorCode(error, 'read_operation_failed'),
    };
}

function failureFromSignal(signal: AbortSignal, deadlineMs: number): Error {
    if (isReadTimeout(signal.reason)) return new ReadDeadlineExceededError(deadlineMs);
    return new ReadCancellationError(signal.reason);
}

function requestedDeadlineMs(options: ReadDeadlineOptions): number {
    return clampReadDeadlineMs(options.deadlineMs ?? options.timeoutMs);
}

export function createReadDeadline(options: ReadDeadlineOptions = {}): ReadDeadline {
    const controller = new AbortController();
    const parentSignal = options.signal ?? undefined;
    const deadlineMs = requestedDeadlineMs(options);
    const startedAt = Date.now();
    const deadlineAt = startedAt + deadlineMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleaned = false;

    const abort = (reason: unknown): void => {
        if (!controller.signal.aborted) controller.abort(reason);
    };
    const onParentAbort = (): void => {
        abort(parentSignal?.reason ?? new ReadCancellationError());
    };

    if (parentSignal?.aborted) {
        onParentAbort();
    } else {
        parentSignal?.addEventListener('abort', onParentAbort, { once: true });
        timer = setTimeout(() => {
            abort(new ReadDeadlineExceededError(deadlineMs));
        }, deadlineMs);
    }

    return {
        signal: controller.signal,
        deadlineMs,
        startedAt,
        deadlineAt,
        cancel(reason?: unknown): void {
            abort(reason instanceof ReadCancellationError ? reason : new ReadCancellationError(reason));
        },
        cleanup(): void {
            if (cleaned) return;
            cleaned = true;
            parentSignal?.removeEventListener('abort', onParentAbort);
            if (timer !== undefined) clearTimeout(timer);
        },
    };
}

export async function withReadDeadline<T>(
    operation: (signal: AbortSignal, deadline: ReadDeadline) => T | PromiseLike<T>,
    options: ReadDeadlineOptions = {},
): Promise<T> {
    const deadline = createReadDeadline(options);
    if (deadline.signal.aborted) {
        const failure = failureFromSignal(deadline.signal, deadline.deadlineMs);
        deadline.cleanup();
        throw failure;
    }

    let completed = false;
    const cancellation = new Promise<never>((_resolve, reject) => {
        const rejectOnAbort = (): void => {
            if (!completed) reject(failureFromSignal(deadline.signal, deadline.deadlineMs));
        };
        if (deadline.signal.aborted) rejectOnAbort();
        else deadline.signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
    const work = Promise.resolve().then(() => operation(deadline.signal, deadline));

    try {
        const result = await Promise.race([work, cancellation]);
        completed = true;
        return result;
    } finally {
        completed = true;
        deadline.cleanup();
    }
}

export const runWithReadDeadline = withReadDeadline;
