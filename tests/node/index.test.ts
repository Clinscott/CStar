import test from 'node:test';
import assert from 'node:assert';

import {
    indexSector,
    PENNYONE_SCAN_RETIRED,
} from '../../src/tools/pennyone/index.js';

test('indexSector retires before file or host-model access', async () => {
    let invoked = false;
    await assert.rejects(
        indexSector('/home/synthetic/.ssh/private.ts', () => {
            invoked = true;
            throw new Error('must_not_run');
        }),
        new RegExp(PENNYONE_SCAN_RETIRED),
    );
    assert.strictEqual(invoked, false);
});
