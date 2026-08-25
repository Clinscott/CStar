import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CorvusProcess } from '../../src/node/core/CorvusProcess.js';
import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

describe('retired CorvusProcess', () => {
    it('fails construction before invoking an injected dispatch callback', () => {
        const executor = mock.fn(async () => ({ status: 'success' }));

        assert.throws(
            () => new CorvusProcess('synthetic-entrypoint', executor),
            new RegExp(RETIRED_GATEWAY_ERROR),
        );
        assert.equal(executor.mock.callCount(), 0);
    });
});
