import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CortexLink } from  '../../../src/node/cortex_link.js';

/**
 * [Ω] IPC BOUNDARY VERIFICATION (Adamant Crucible)
 * Purpose: Verify the Node.js -> Python one-shot kernel bridge.
 */
test('IPC Boundary: one-shot kernel bridge ping', async () => {
    const link = new CortexLink();

    const response = await link.sendCommand('ping', []);

    assert.equal(response.status, 'success');
    assert.match(String((response.data as { message?: string } | undefined)?.message ?? ''), /kernel bridge ready/i);
});
