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
});
