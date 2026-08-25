import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import mimirRoute from '../../src/node/gateway/routes/api/mimir.js';
import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

describe('retired Mimir gateway route', () => {
    it('fails before registering a local intelligence handler', () => {
        let reads = 0;
        const poisonHost = new Proxy({}, {
            get() {
                reads += 1;
                throw new Error('mimir_route_touched_host');
            },
        });

        assert.throws(() => mimirRoute(poisonHost), new RegExp(RETIRED_GATEWAY_ERROR));
        assert.equal(reads, 0);
    });
});
