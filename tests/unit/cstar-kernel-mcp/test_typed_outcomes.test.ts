import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MCP_OUTCOMES,
    errorPayloadResponse,
    errorResponse,
    isMcpErrorOutcome,
    mcpOutcomeMetadata,
    mcpOutcomeResponse,
    preAuthorizationErrorResponse,
    textResponse,
    type McpOutcome,
} from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';

function payload(response: ReturnType<typeof textResponse>): Record<string, unknown> {
    return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

describe('typed MCP outcomes', () => {
    it('publishes exactly the six supported outcomes', () => {
        assert.deepEqual(MCP_OUTCOMES, [
            'ok',
            'needs_input',
            'guardrail_block',
            'domain_terminal',
            'transport_error',
            'internal_error',
        ] satisfies readonly McpOutcome[]);
    });

    it('derives telemetry-visible categories and MCP error disposition', () => {
        assert.deepEqual(mcpOutcomeMetadata('guardrail_block'), {
            outcome: 'guardrail_block',
            outcome_kind: 'guardrail',
            is_error: false,
        });
        assert.deepEqual(mcpOutcomeMetadata('domain_terminal'), {
            outcome: 'domain_terminal',
            outcome_kind: 'domain',
            is_error: false,
        });
        assert.deepEqual(mcpOutcomeMetadata('transport_error'), {
            outcome: 'transport_error',
            outcome_kind: 'transport',
            is_error: true,
        });
        assert.deepEqual(mcpOutcomeMetadata('internal_error'), {
            outcome: 'internal_error',
            outcome_kind: 'internal',
            is_error: true,
        });
        assert.equal(isMcpErrorOutcome('needs_input'), false);
    });

    it('sets isError only for transport and internal outcomes', () => {
        for (const outcome of MCP_OUTCOMES) {
            const response = mcpOutcomeResponse(outcome, { value: outcome });
            assert.equal(response.isError, isMcpErrorOutcome(outcome) ? true : undefined, outcome);
            assert.equal(payload(response).outcome, outcome);
        }
    });

    it('keeps preauthorization and domain terminal results observable', () => {
        const preauthorization = preAuthorizationErrorResponse(
            'operator_authorization_missing',
            new Error('operator authorization is required'),
        );
        assert.equal(preauthorization.isError, undefined);
        assert.equal(payload(preauthorization).outcome, 'guardrail_block');
        assert.equal(payload(mcpOutcomeResponse('domain_terminal', { status: 'closed' })).outcome, 'domain_terminal');
        assert.equal(mcpOutcomeResponse('domain_terminal').isError, undefined);
    });

    it('does not allow a legacy error flag to override a typed normal outcome', () => {
        const response = textResponse({ outcome: 'domain_terminal', status: 'closed' }, true);
        assert.equal(response.isError, undefined);
    });

    it('classifies generic and guardrail payload errors without false transport errors', () => {
        const internal = errorResponse(new Error('database unavailable'));
        assert.equal(internal.isError, true);
        assert.equal(payload(internal).error_code, 'cstar_internal_error');

        const guardrail = errorPayloadResponse({
            status: 'blocked',
            guardrail: {
                verdict: 'block',
                action: 'refuse',
                reason: 'missing authority',
                failed_checks: ['authority'],
                warning_checks: [],
            },
        }, 'authority_missing');
        assert.equal(guardrail.isError, undefined);
        assert.equal(payload(guardrail).outcome, 'guardrail_block');
    });
});
