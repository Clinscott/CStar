import test from 'node:test';
import assert from 'node:assert';

import { PENNYONE_SCAN_RETIRED, runScan } from '../../../src/tools/pennyone/index.js';

test('PennyOne scan rejects every legacy option before work begins', async () => {
    for (const options of [
        {},
        { ingestHistory: true },
        { throttleMs: 1, hostSessionActive: true },
    ]) {
        await assert.rejects(
            runScan('synthetic-target', false, options),
            new RegExp(PENNYONE_SCAN_RETIRED),
        );
    }
});
