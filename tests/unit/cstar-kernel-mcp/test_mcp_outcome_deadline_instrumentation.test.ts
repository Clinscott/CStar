import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    MCP_OUTCOMES,
    mcpOutcomeResponse,
    textResponse,
} from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    DEFAULT_READ_DEADLINE_MS,
    MAX_READ_DEADLINE_MS,
    READ_DEADLINE_CANCELLED_CODE,
    READ_DEADLINE_TIMEOUT_CODE,
    clampReadDeadlineMs,
} from '../../../src/tools/cstar-kernel-mcp/contracts/deadlines.js';
import {
    deriveMcpUsefulnessEvent,
    instrumentTool,
} from '../../../src/tools/cstar-kernel-mcp/telemetry/usage.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];

function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-outcome-deadline-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    registry.setRoot(root);
    return root;
}

function payload(response: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
    return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

function validationEvent(result: Record<string, unknown>) {
    return deriveMcpUsefulnessEvent(
        {
            ts: new Date().toISOString(),
            tool: 'cstar_record_result',
            ok: true,
            duration_ms: 1,
            root: '/tmp/cstar',
        },
        { bead_id: 'bead:set-01' },
        textResponse(result),
    );
}

afterEach(() => {
    registry.setRoot(originalRoot);
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('SET-01 MCP outcome and deadline instrumentation', () => {
    it('canonicalizes every instrumented response and preserves MCP disposition', async () => {
        makeRoot();
        const responses = await Promise.all(MCP_OUTCOMES.map((outcome) => (
            instrumentTool('cstar_status', async () => (
                outcome === 'ok' ? textResponse({ status: 'ok' }) : mcpOutcomeResponse(outcome)
            ))({})
        )));

        for (const [index, response] of responses.entries()) {
            const outcome = MCP_OUTCOMES[index]!;
            const body = payload(response);
            assert.equal(body.outcome, outcome);
            assert.equal(body.is_error, outcome === 'transport_error' || outcome === 'internal_error');
            assert.equal(response.isError, outcome === 'transport_error' || outcome === 'internal_error'
                ? true : undefined);
        }
    });

    it('bounds public READ calls, returns a stable timeout, and never retries the handler', async () => {
        makeRoot();
        assert.equal(clampReadDeadlineMs(), DEFAULT_READ_DEADLINE_MS);
        assert.equal(clampReadDeadlineMs(60_000), MAX_READ_DEADLINE_MS);

        let invocations = 0;
        const read = instrumentTool('cstar_status', async () => {
            invocations += 1;
            return new Promise<never>(() => { /* synthetic provider work remains pending */ });
        });
        const response = await read({ timeoutMs: 1 });
        const body = payload(response);
        assert.equal(invocations, 1);
        assert.equal(body.outcome, 'transport_error');
        assert.equal(body.error_code, READ_DEADLINE_TIMEOUT_CODE);
        assert.equal(response.isError, true);
    });

    it('maps an already-cancelled caller to a distinct transport error without starting work', async () => {
        makeRoot();
        const caller = new AbortController();
        caller.abort('operator_cancelled');
        let invocations = 0;
        const response = await instrumentTool('cstar_status', async () => {
            invocations += 1;
            return textResponse({ status: 'unexpected' });
        })({}, { signal: caller.signal } as never);
        const body = payload(response);
        assert.equal(invocations, 0);
        assert.equal(body.outcome, 'transport_error');
        assert.equal(body.error_code, READ_DEADLINE_CANCELLED_CODE);
        assert.notEqual(body.error_code, READ_DEADLINE_TIMEOUT_CODE);
        assert.equal(response.isError, true);
    });

    it('never labels partial, rolled-back, or unpersisted validation as recorded', async () => {
        assert.equal(validationEvent({ validation_persisted: true }).validation_recorded, true);
        assert.equal(validationEvent({ status: 'recorded' }).validation_recorded, true);
        assert.equal(validationEvent({ status: 'recorded_verified' }).validation_recorded, true);
        assert.equal(validationEvent({ status: 'recorded_unverified' }).validation_recorded, true);
        for (const result of [
            { status: 'recorded', validation_persisted: false },
            { status: 'recorded', validation_warning: 'validation_transaction_rolled_back' },
            { status: 'recorded', error_code: 'validation_not_persisted' },
            { status: 'partial', validation_persisted: false },
            { status: 'recorded_verified', validation_persisted: false, validation_warning: 'validation_transaction_rolled_back' },
            { status: 'not_persisted', validation_persisted: false },
        ]) {
            const event = validationEvent(result);
            assert.equal(event.validation_recorded, false, JSON.stringify(result));
            assert.notEqual(event.outcome_kind, 'validation_recorded', JSON.stringify(result));
        }

        const root = makeRoot();
        const response = await instrumentTool('cstar_record_result', async () => textResponse({
            status: 'partial',
            validation_persisted: false,
            validation_warning: 'validation_transaction_rolled_back',
        }))({});
        assert.equal(payload(response).outcome, 'ok');
        const usefulness = fs.readFileSync(
            path.join(root, '.agents', 'state', 'cstar-kernel-mcp-usefulness.jsonl'),
            'utf8',
        ).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
        const event = usefulness.at(-1)!;
        assert.equal(event.outcome_kind, 'validation_not_recorded');
        assert.equal(event.validation_recorded, false);
    });
});
