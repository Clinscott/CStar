import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_READ_DEADLINE_MS,
    MAX_READ_DEADLINE_MS,
    READ_DEADLINE_CANCELLED_CODE,
    READ_DEADLINE_TIMEOUT_CODE,
    ReadCancellationError,
    ReadDeadlineExceededError,
    classifyReadError,
    classifyReadFailure,
    clampReadDeadlineMs,
    withReadDeadline,
} from '../../../src/tools/cstar-kernel-mcp/contracts/deadlines.js';
import {
    readFailureResponse,
    runBoundedRead,
    wrapReadOperation,
} from '../../../src/tools/cstar-kernel-mcp/tools/read_deadline.js';

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responsePayload(response: ReturnType<typeof readFailureResponse>): Record<string, unknown> {
    return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

describe('bounded MCP read deadlines', () => {
    it('uses a five-second default and clamps at the thirty-second hard maximum', () => {
        assert.equal(clampReadDeadlineMs(), DEFAULT_READ_DEADLINE_MS);
        assert.equal(clampReadDeadlineMs(60_000), MAX_READ_DEADLINE_MS);
        assert.equal(clampReadDeadlineMs(-10), 0);
        assert.equal(clampReadDeadlineMs(Number.POSITIVE_INFINITY), MAX_READ_DEADLINE_MS);
        assert.equal(clampReadDeadlineMs(Number.NaN), DEFAULT_READ_DEADLINE_MS);
    });

    it('classifies a deadline timeout deterministically as transport_error', async () => {
        await assert.rejects(
            () => runBoundedRead(() => delay(30), { deadlineMs: 5 }),
            (error: unknown) => {
                assert.ok(error instanceof ReadDeadlineExceededError);
                assert.equal((error as ReadDeadlineExceededError).code, READ_DEADLINE_TIMEOUT_CODE);
                assert.equal(classifyReadError(error), 'timeout');
                assert.deepEqual(classifyReadFailure(error), {
                    classification: 'timeout',
                    kind: 'timeout',
                    outcome: 'transport_error',
                    outcome_kind: 'transport',
                    error_code: READ_DEADLINE_TIMEOUT_CODE,
                });
                return true;
            },
        );
        const response = readFailureResponse(new ReadDeadlineExceededError(5));
        assert.equal(response.isError, true);
        assert.equal(responsePayload(response).outcome, 'transport_error');
    });

    it('propagates caller cancellation to the operation signal and classifies it', async () => {
        const caller = new AbortController();
        let observedSignal: AbortSignal | undefined;
        const pending = withReadDeadline((signal) => {
            observedSignal = signal;
            return new Promise<never>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
        }, { deadlineMs: 100, signal: caller.signal });

        await delay(2);
        caller.abort('operator_cancelled');
        await assert.rejects(
            pending,
            (error: unknown) => {
                assert.ok(error instanceof ReadCancellationError);
                assert.equal((error as ReadCancellationError).code, READ_DEADLINE_CANCELLED_CODE);
                assert.equal(classifyReadError(error), 'cancelled');
                return true;
            },
        );
        assert.equal(observedSignal?.aborted, true);
        assert.equal(observedSignal?.reason, 'operator_cancelled');
    });

    it('lets an already completed read win the completion race and cleans up', async () => {
        const deadline = await withReadDeadline(() => 'complete', { deadlineMs: 0 });
        assert.equal(deadline, 'complete');

        const controller = new AbortController();
        let observedSignal: AbortSignal | undefined;
        await withReadDeadline((signal) => {
            observedSignal = signal;
            return 'done';
        }, { deadlineMs: 10, signal: controller.signal });
        controller.abort();
        assert.equal(observedSignal?.aborted, false);
    });

    it('provides a composable future registration wrapper with the bounded signal', async () => {
        let received: { deadlineMs: number; aborted: boolean } | undefined;
        const read = wrapReadOperation<{ key: string }, string>((args, context) => {
            received = { deadlineMs: context.deadlineMs, aborted: context.signal.aborted };
            return `${args.key}:ok`;
        }, { deadlineMs: 40 });

        assert.equal(await read({ key: 'value' }), 'value:ok');
        assert.deepEqual(received, { deadlineMs: 40, aborted: false });
    });
});
