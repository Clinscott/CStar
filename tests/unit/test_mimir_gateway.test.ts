import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import mimirRoute from  '../../src/node/gateway/routes/api/mimir.js';

describe('Mimir gateway route (CS-P1-02)', () => {
    let fastify: ReturnType<typeof Fastify>;

    beforeEach(async () => {
        fastify = Fastify();
        fastify.decorate('corvus', {
            requestIntelligence: async () => ({
                status: 'success' as const,
                raw_text: 'Gateway intelligence response',
                parsed_data: undefined,
                error: undefined,
                trace: {
                    correlation_id: 'gateway-think',
                    transport_mode: 'host_session' as const,
                    cached: false,
                },
            }),
            requestSectorIntent: async () => ({
                status: 'success' as const,
                raw_text: 'Sector intent response',
                parsed_data: undefined,
                error: undefined,
                trace: {
                    correlation_id: 'gateway-intent',
                    transport_mode: 'synapse_db' as const,
                    cached: true,
                },
            }),
        });

        await fastify.register(mimirRoute, { prefix: '/api' });
        await fastify.ready();
    });

    afterEach(async () => {
        await fastify.close();
    });

    it('returns the canonical intelligence envelope for /mimir/think', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/mimir/think',
            payload: {
                query: 'Explain the bridge.',
            },
        });

        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(response.body), {
            status: 'success',
            raw_text: 'Gateway intelligence response',
            trace: {
                correlation_id: 'gateway-think',
                transport_mode: 'host_session',
                cached: false,
            },
        });
    });

    it('returns the canonical intelligence envelope for /mimir/intent', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/mimir/intent?path=src/core/engine/vector.py',
        });

        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(response.body), {
            status: 'success',
            raw_text: 'Sector intent response',
            trace: {
                correlation_id: 'gateway-intent',
                transport_mode: 'synapse_db',
                cached: true,
            },
        });
    });
});
