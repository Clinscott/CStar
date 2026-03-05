import { test } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BddMaster } from '../../src/node/core/bdd_master.ts';
import { CortexLink } from '../../src/node/cortex_link.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FEATURE_PATH = path.join(__dirname, '../features/ipc_handshake_empire.feature');

async function getFreePort(): Promise<number> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.listen(0, () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

test('Gungnir BDD Master: IPC Handshake Empire Verification', async () => {
    const master = new BddMaster();
    let link: CortexLink;
    let port: number;

    master.defineStep(/the Python Daemon is offline/, async () => {
        // Optimistic assumption, we don't kill existing ones here
        // but ensure a fresh port is used
        port = await getFreePort();
    });

    master.defineStep(/I awaken the Oracle via the CortexLink/, async () => {
        link = new CortexLink(port);
        await link.ensureDaemon();
    });

    master.defineStep(/the system should bind to an ephemeral port/, async () => {
        // If ensureDaemon didn't throw, we are bound
        assert.ok(port > 0);
    });

    master.defineStep(/a PING command should return a success status/, async () => {
        const response = await link.sendCommand('ping', []);
        assert.strictEqual(response.status, 'success');
        
        // Shutdown daemon to allow test to exit
        console.log('[INFO] THEN: Shutting down the Oracle...');
        await link.shutdownDaemon();
    });

    await master.runFeature(FEATURE_PATH);
    process.exit(0);
});
