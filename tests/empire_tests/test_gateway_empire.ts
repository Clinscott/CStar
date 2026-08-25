import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';
import corvusPlugin from '../../src/node/gateway/plugins/corvus.js';
import intentRoute from '../../src/node/gateway/routes/api/intent.js';
import mimirRoute from '../../src/node/gateway/routes/api/mimir.js';
import apiTelemetryRoute from '../../src/node/gateway/routes/api/telemetry.js';
import streamTelemetryRoute from '../../src/node/gateway/routes/streams/telemetry.js';
import webSocketEventsRoute from '../../src/node/gateway/routes/ws/events.js';

const retiredRoutes = [
    corvusPlugin,
    intentRoute,
    mimirRoute,
    apiTelemetryRoute,
    streamTelemetryRoute,
    webSocketEventsRoute,
];

describe('retired gateway family', () => {
    it('fails every registration before reading the host object', () => {
        let reads = 0;
        const poisonHost = new Proxy({}, {
            get() {
                reads += 1;
                throw new Error('gateway_touched_host');
            },
        });

        for (const route of retiredRoutes) {
            assert.throws(() => route(poisonHost), new RegExp(RETIRED_GATEWAY_ERROR));
        }
        assert.equal(reads, 0);
    });

    it('fails direct server import instead of loading configuration or listening', async () => {
        const specifier = `../../src/node/gateway/server.js?retired=${Date.now()}`;
        await assert.rejects(() => import(specifier), new RegExp(RETIRED_GATEWAY_ERROR));
    });
});
