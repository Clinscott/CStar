import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildIntelligenceSuccess,
    normalizeIntelligenceRequest,
    parseStructuredPayload,
} from '../../src/types/intelligence-contract.ts';
import { getHostMindLabel } from '../../src/core/host_session.ts';

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

    it('preserves requested and host-reported actual model identity separately', () => {
        const request = normalizeIntelligenceRequest({ prompt: 'Identify execution.' }, 'test-suite');
        const response = buildIntelligenceSuccess(
            request,
            'ok',
            'host_session',
            false,
            {
                provider: 'gemini',
                requested_model: 'gemini-3.1-pro',
                actual_model: 'gemini-3.5-flash',
                model_source: 'host_reported',
                adapter_version: 'agy-test',
                reasoning_profile: 'high',
            },
        );

        assert.deepStrictEqual(response.trace.execution_identity, {
            provider: 'gemini',
            requested_model: 'gemini-3.1-pro',
            actual_model: 'gemini-3.5-flash',
            model_source: 'host_reported',
            adapter_version: 'agy-test',
            reasoning_profile: 'high',
        });
        assert.strictEqual(getHostMindLabel('gemini'), 'GEMINI HOST (MODEL UNREPORTED)');
        assert.strictEqual(getHostMindLabel('gemini', 'gemini-3.5-flash'), 'gemini-3.5-flash');
    });
});
