import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    RETIRED_PENNYONE_PROXY_ERROR,
    startProxy,
} from '../../../src/tools/pennyone/vis/proxy.js';


test('retired PennyOne proxy rejects even a synthetic token before effects', async () => {
    await assert.rejects(
        () => startProxy('/synthetic', 0, {
            staticRoot: '/synthetic/static',
            statsRoot: '/synthetic/stats',
            token: 'synthetic-token',
            watchStats: false,
        }),
        { message: RETIRED_PENNYONE_PROXY_ERROR },
    );
});
