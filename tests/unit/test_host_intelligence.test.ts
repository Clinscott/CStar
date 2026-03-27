import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requestHostText } from  '../../src/core/host_intelligence.js';

describe('Host intelligence bridge (CS-P1-02)', () => {
    it('forces host-session transport through the shared Mimir bridge', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                systemPrompt: 'Respond in one sentence.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CORVUS_HOST_PROVIDER: 'claude' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: '  Shared bridge response.  ',
                            trace: {
                                correlation_id: 'host-intelligence-test',
                                transport_mode: 'host_session',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'claude');
        assert.equal(result.text, 'Shared bridge response.');
        assert.equal(capturedRequest?.transport_mode, 'host_session');
        assert.equal(capturedRequest?.system_prompt, 'Respond in one sentence.');
    });

    it('fails closed when no host session is active', async () => {
        await assert.rejects(
            requestHostText({
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: {},
            }),
            /Host Agent session inactive/i,
        );
    });

    it('uses direct host-session transport in an interactive Codex session when no broker is configured', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Synapse-backed response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-test',
                                transport_mode: 'host_session',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Synapse-backed response.');
        assert.equal(capturedRequest?.transport_mode, 'host_session');
    });

    it('uses synapse_db when an interactive broker is explicitly configured', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1', CORVUS_ONE_MIND_BROKER_ACTIVE: '1' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Broker-backed response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-broker-test',
                                transport_mode: 'synapse_db',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Broker-backed response.');
        assert.equal(capturedRequest?.transport_mode, 'synapse_db');
    });
});
