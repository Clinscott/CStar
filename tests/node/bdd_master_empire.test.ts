import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BddMaster } from '../../src/node/core/bdd_master.js';
import { CortexLink } from '../../src/node/cortex_link.js';
import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FEATURE_PATH = path.join(__dirname, '../features/ipc_handshake_empire.feature');

test('BDD: historical gateway and IPC bridge remain retired', async () => {
    const master = new BddMaster();
    const executor = mock.fn(async () => ({ status: 'success' }));
    let observed = '';

    master.defineStep(/the historical gateway has no execution authority/, async () => undefined);
    master.defineStep(/CortexLink construction is attempted/, async () => {
        try {
            new CortexLink(50051, '127.0.0.1', undefined, executor);
        } catch (error) {
            observed = error instanceof Error ? error.message : String(error);
        }
    });
    master.defineStep(/the stable gateway retirement error is returned/, async () => {
        assert.equal(observed, RETIRED_GATEWAY_ERROR);
    });
    master.defineStep(/no IPC executor is invoked/, async () => {
        assert.equal(executor.mock.callCount(), 0);
    });

    await master.runFeature(FEATURE_PATH);
});
