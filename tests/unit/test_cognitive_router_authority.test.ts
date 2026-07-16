import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CognitiveRouter } from '../../src/node/core/CognitiveRouter.js';
import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

describe('retired CognitiveRouter authority boundary', () => {
    afterEach(() => mock.reset());

    it('fails before provider, kernel, or callback selection', () => {
        const fetchCall = mock.method(globalThis, 'fetch', async () => {
            throw new Error('provider_must_not_run');
        });

        assert.throws(() => CognitiveRouter.getInstance(), new RegExp(RETIRED_GATEWAY_ERROR));
        assert.equal(fetchCall.mock.callCount(), 0);
    });

    it('keeps routeIntent terminal if construction is bypassed', async () => {
        const forged = Object.create(CognitiveRouter.prototype) as CognitiveRouter;
        await assert.rejects(
            () => forged.routeIntent({} as never, {} as never),
            new RegExp(RETIRED_GATEWAY_ERROR),
        );
    });
});
