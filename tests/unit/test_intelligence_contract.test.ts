import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildIntelligenceSuccess,
    normalizeIntelligenceRequest,
    parseStructuredPayload,
} from '../../src/types/intelligence-contract.ts';

describe('Canonical intelligence contract (CS-P1-02)', () => {
    it('extracts JSON payloads from conversational oracle output', () => {
        const parsed = parseStructuredPayload('Oracle reply:\n{"status":"ok","score":91}\nProceed.');
        assert.deepStrictEqual(parsed, { status: 'ok', score: 91 });
    });

    it('builds a typed success envelope with parsed data and trace', () => {
        const request = normalizeIntelligenceRequest(
            {
                prompt: 'Return JSON only.',
                correlation_id: 'corr-1',
            },
            'test-suite',
        );

        const response = buildIntelligenceSuccess(
            request,
            '{"status":"ok","answer":"aligned"}',
            'host_session',
        );

        assert.strictEqual(response.status, 'success');
        assert.deepStrictEqual(response.parsed_data, {
            status: 'ok',
            answer: 'aligned',
        });
        assert.deepStrictEqual(response.trace, {
            correlation_id: 'corr-1',
            transport_mode: 'host_session',
            cached: false,
        });
    });
});
