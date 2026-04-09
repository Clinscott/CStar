import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    bindSharedHostSessionInvoker,
    clearSharedHostSessionInvoker,
    requestHostText,
} from  '../../src/core/host_intelligence.js';

describe('Host intelligence bridge (CS-P1-02)', () => {
    it('threads an explicitly bound hostSessionInvoker into the shared Mimir bridge', async () => {
        let capturedOptions: Record<string, unknown> | undefined;
        const boundInvoker = async () => 'Bound host session response';

        const restore = bindSharedHostSessionInvoker(boundInvoker);
        try {
            const result = await requestHostText(
                {
                    prompt: 'Explain the bound host bridge.',
                    projectRoot: '/tmp/corvus-host-intelligence',
                    source: 'test-suite',
                    env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                },
                {
                    clientFactory: (options) => {
                        capturedOptions = options as Record<string, unknown>;
                        return {
                            request: async () => ({
                                status: 'success',
                                raw_text: 'Bound bridge response.',
                                trace: {
                                    correlation_id: 'host-intelligence-bound-test',
                                    transport_mode: 'host_session',
                                    cached: false,
                                },
                            }),
                        };
                    },
                },
            );

            assert.equal(result.provider, 'codex');
            assert.equal(result.text, 'Bound bridge response.');
            assert.equal(capturedOptions?.hostSessionInvoker, boundInvoker);
        } finally {
            restore();
            clearSharedHostSessionInvoker();
        }
    });

    it('defaults to auto transport through the shared Mimir bridge', async () => {
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
        assert.match(String(capturedRequest?.system_prompt ?? ''), /^Respond in one sentence\./);
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

    it('leaves transport resolution to Mimir in an interactive Codex session when no broker is configured', async () => {
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

    it('leaves broker-aware transport resolution to Mimir when an interactive broker is explicitly configured', async () => {
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
        assert.equal(capturedRequest?.transport_mode, 'host_session');
    });

    it('honors an explicit transport override when provided', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                metadata: { transport_mode: 'synapse_db' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Explicit transport response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-explicit-test',
                                transport_mode: 'synapse_db',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Explicit transport response.');
        assert.equal(capturedRequest?.transport_mode, 'synapse_db');
    });
});
