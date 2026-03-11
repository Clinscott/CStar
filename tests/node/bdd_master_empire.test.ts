import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BddMaster } from '../../src/node/core/bdd_master.ts';
import { CortexLink } from '../../src/node/cortex_link.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FEATURE_PATH = path.join(__dirname, '../features/ipc_handshake_empire.feature');

test('Gungnir BDD Master: IPC Handshake Empire Verification', async () => {
    const master = new BddMaster();
    let link: CortexLink;
    let kernelReady = false;

    master.defineStep(/the Python Daemon is offline/, async () => {
        kernelReady = false;
    });

    master.defineStep(/I awaken the Oracle via the CortexLink/, async () => {
        link = new CortexLink();
        await link.ensureDaemon();
        kernelReady = true;
    });

    master.defineStep(/the system should bind to an ephemeral port/, async () => {
        assert.equal(kernelReady, true);
    });

    master.defineStep(/a PING command should return a success status/, async () => {
        const response = await link.sendCommand('ping', []);
        assert.equal(response.status, 'success');
        await link.shutdownDaemon();
    });

    await master.runFeature(FEATURE_PATH);
});
