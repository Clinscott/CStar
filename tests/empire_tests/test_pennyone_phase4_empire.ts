import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SubspaceRelay } from '../../src/tools/pennyone/live/socket.js';
import { startWatcher } from '../../src/tools/pennyone/live/watcher.js';
import { startBridge } from '../../src/tools/pennyone/vis/server.js';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import fs from 'fs/promises';
import path from 'path';

describe('PennyOne Phase 4: Subspace Relay', () => {
    it('should broadcast messages to connected clients', async () => {
        const httpServer = createServer();
        const relay = new SubspaceRelay(httpServer);
        httpServer.listen(0);

        const port = (httpServer.address() as any).port;
        const client = new WebSocket(`ws://localhost:${port}`);

        const messageReceived = new Promise((resolve) => {
            client.on('message', (data) => {
                resolve(JSON.parse(data.toString()));
            });
        });

        await new Promise(resolve => client.on('open', resolve));

        relay.broadcast('NODE_UPDATED', { path: 'test.ts', loc: 100 });

        const received = await messageReceived;
        assert.deepStrictEqual(received, {
            type: 'NODE_UPDATED',
            payload: { path: 'test.ts', loc: 100 }
        });

        client.close();
        httpServer.close();
    });
});

describe('PennyOne Phase 4: Watcher Delta Integration', async () => {
    it('should detect file changes and trigger broadcast', async () => {
        const testDir = path.resolve(process.cwd(), 'temp_watch_repo');
        const testFile = path.join(testDir, 'logic.ts');
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(testFile, 'const x = 1;');

        const httpServer = createServer();
        const relay = new SubspaceRelay(httpServer);

        let broadcastPayload: any = null;
        relay.broadcast = (type, payload) => {
            if (type === 'NODE_UPDATED') broadcastPayload = payload;
        };

        const watcher = startWatcher(testDir, relay);

        // Chokidar needs a moment to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Trigger change
        await fs.writeFile(testFile, 'const x = 1;\nconst y = 2;');

        // Wait for event loop to catch up
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            assert.ok(broadcastPayload, 'Should have received a broadcast payload');
            assert.strictEqual(broadcastPayload.path, testFile);
            assert.strictEqual(broadcastPayload.loc, 2);
        } finally {
            await watcher.close();
            await fs.rm(testDir, { recursive: true, force: true });
        }
    });

    it('should signal GRAPH_REBUILT on file addition', async () => {
        const testDir = path.resolve(process.cwd(), 'temp_add_repo');
        await fs.mkdir(testDir, { recursive: true });

        const httpServer = createServer();
        const relay = new SubspaceRelay(httpServer);

        let rebuiltSignaled = false;
        relay.broadcast = (type) => {
            if (type === 'GRAPH_REBUILT') rebuiltSignaled = true;
        };

        const watcher = startWatcher(testDir, relay);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add file
        await fs.writeFile(path.join(testDir, 'new_file.ts'), 'export const start = 1;');

        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            assert.ok(rebuiltSignaled, 'Should have signaled graph rebuild');
        } finally {
            await watcher.close();
            await fs.rm(testDir, { recursive: true, force: true });
        }
    });
});
