import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CortexLink } from '../../../src/node/cortex_link.js';
import { RETIRED_GATEWAY_ERROR } from '../../../src/node/retired_gateway.js';

test('IPC boundary is retired before any executor or socket work', () => {
    const executor = mock.fn(async () => ({ status: 'success' }));

    assert.throws(
        () => new CortexLink(50051, '127.0.0.1', undefined, executor),
        new RegExp(RETIRED_GATEWAY_ERROR),
    );
    assert.equal(executor.mock.callCount(), 0);
});
