import test from 'node:test';
import assert from 'node:assert';

import { PENNYONE_SCAN_RETIRED, runScan } from '../../../src/tools/pennyone/index.js';

test('PennyOne scan retires before host interaction or Hall projection', async () => {
    let hostCalls = 0;
    await assert.rejects(
        runScan('/home/synthetic/private', true, {
            hostTextInvoker: () => { hostCalls += 1; },
            hostSessionActive: true,
        }),
        new RegExp(PENNYONE_SCAN_RETIRED),
    );
    assert.strictEqual(hostCalls, 0);
});
