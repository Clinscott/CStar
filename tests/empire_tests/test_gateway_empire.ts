import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import corvusPlugin from '../../src/node/gateway/plugins/corvus.js';
import intentRoute from '../../src/node/gateway/routes/api/intent.js';
import telemetryRoute from '../../src/node/gateway/routes/streams/telemetry.js';

/**
 * [Ω] Test Gateway Empire
 * Validates Zero-Trust boundaries and SSE flow.
 */
describe('Gateway: Empire Boundary Validation', async () => {
    let fastify: any;

    beforeEach(async () => {
        fastify = Fastify();
        await fastify.register(corvusPlugin);
        await fastify.register(intentRoute, { prefix: '/api' });
        await fastify.register(telemetryRoute, { prefix: '/streams' });
        await fastify.ready();
    });

    afterEach(async () => {
        if (fastify) {
            await fastify.close();
        }
    });

    it('should reject malformed Intent payloads (Zero-Trust Amendment B)', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/intent',
            payload: {
                invalid_field: 'malicious'
            }
        });

        assert.strictEqual(response.statusCode, 400);
    });

    it('should accept valid Intent payloads', async () => {
        const payload = {
            system_meta: {},
            intent_raw: 'test',
            intent_normalized: 'TEST_INTENT',
            target_workflow: 'ping'
        };

        const response = await fastify.inject({
            method: 'POST',
            url: '/api/intent',
            payload
        });

        assert.strictEqual(response.statusCode, 202);
        assert.strictEqual(JSON.parse(response.body).status, 'accepted');
    });

    it('should return 503 if daemon is offline', async () => {
        // Force daemon offline
        fastify.corvus.isRunning = false;

        const response = await fastify.inject({
            method: 'POST',
            url: '/api/intent',
            payload: {
                system_meta: {},
                intent_raw: 'test',
                intent_normalized: 'TEST_INTENT',
                target_workflow: 'ping'
            }
        });

        assert.strictEqual(response.statusCode, 503);
    });
});
