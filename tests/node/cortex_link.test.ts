import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CortexLink } from '../../src/node/cortex_link.js';
import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

describe('retired CortexLink', () => {
    it('fails construction before invoking the process bridge callback', () => {
        const executor = mock.fn(async () => ({ status: 'success' }));

        assert.throws(
            () => new CortexLink(50051, '127.0.0.1', undefined, executor),
            new RegExp(RETIRED_GATEWAY_ERROR),
        );
        assert.equal(executor.mock.callCount(), 0);
    });

    it('keeps prototype calls terminal even when construction is bypassed', async () => {
        const forged = Object.create(CortexLink.prototype) as CortexLink;
        await assert.rejects(() => forged.sendCommand('ping'), new RegExp(RETIRED_GATEWAY_ERROR));
        await assert.rejects(
            () => forged.handleArchitectMove('synthetic/a', 'synthetic/b'),
            new RegExp(RETIRED_GATEWAY_ERROR),
        );
    });
});
