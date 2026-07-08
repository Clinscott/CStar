import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    errorResponse,
    mcpGuardrail,
    mcpMutation,
    normalizeErrorMessage,
    textResponse,
} from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';

function parsePayload(result: ReturnType<typeof textResponse>) {
    return JSON.parse(result.content[0].text);
}

describe('CStar MCP response contract', () => {
    it('wraps payloads in MCP text content', () => {
        const result = textResponse({ status: 'ok' });

        assert.deepEqual(result, {
            content: [{ type: 'text', text: '{"status":"ok"}' }],
        });
    });

    it('marks error responses without changing the content shape', () => {
        const result = textResponse({ error: 'blocked' }, true);

        assert.equal(result.isError, true);
        assert.deepEqual(parsePayload(result), { error: 'blocked' });
    });

    it('normalizes and caps error text', () => {
        assert.equal(normalizeErrorMessage(new Error('one\n two\tthree'), 9), 'one two t');
        assert.deepEqual(parsePayload(errorResponse(new Error('one\n two'), 64)), { error: 'one two' });
    });

    it('publishes guardrail payloads with explicit failed and warning checks', () => {
        assert.deepEqual(
            mcpGuardrail('block', 'refuse', 'unsafe', ['secret'], ['scope']),
            {
                verdict: 'block',
                action: 'refuse',
                reason: 'unsafe',
                failed_checks: ['secret'],
                warning_checks: ['scope'],
            },
        );
    });

    it('publishes mutation envelopes with allow guardrails', () => {
        assert.deepEqual(mcpMutation('hall_bead_claim', 'bead-1', 'persisted'), {
            kind: 'hall_bead_claim',
            persisted: true,
            record_id: 'bead-1',
            guardrail: {
                verdict: 'allow',
                action: 'continue',
                reason: 'persisted',
                failed_checks: [],
                warning_checks: [],
            },
        });
    });
});
