import { test } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { CortexLink } from '../../../src/node/cortex_link.ts';
import fs from 'node:fs';
import path from 'node:path';

/**
 * [Ω] IPC BOUNDARY VERIFICATION (Adamant Crucible)
 * Purpose: Verify the Node.js -> Python WebSocket Handshake via Mocked Daemon.
 * Standard: Sterling Mandate Tier 3 (Audit) - Mocked execution required.
 */

async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

test('IPC Boundary: Mocked Python Daemon Handshake', async () => {
    const port = await getFreePort();
    console.log(`[INFO] GIVEN: A CortexLink with Dynamic Port ${port}...`);
    
    // 1. Mock the Python Daemon using a local WebSocketServer
    const mockDaemon = new WebSocketServer({ port });
    const mockAuthKey = 'mock-secure-key-123';
    
    // Ensure the dummy key is available for CortexLink to read
    const agentDir = path.resolve(process.cwd(), '.agent');
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'daemon.key'), mockAuthKey);
    fs.writeFileSync(path.join(agentDir, 'daemon.pid'), '99999');

    mockDaemon.on('connection', (ws: WebSocket) => {
        let authenticated = false;
        ws.on('message', (message: string) => {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'auth') {
                if (data.auth_key === mockAuthKey) {
                    authenticated = true;
                    ws.send(JSON.stringify({ type: 'auth_success' }));
                } else {
                    ws.send(JSON.stringify({ type: 'auth_fail' }));
                    ws.close(1008, 'Invalid Key');
                }
                return;
            }

            if (authenticated && data.command === 'ping') {
                ws.send(JSON.stringify({
                    type: 'result',
                    data: { status: 'success', data: { message: 'pong from mock' } }
                }));
            }
        });
    });

    const link = new CortexLink(port);

    try {
        console.log('[INFO] WHEN: Sending PING command across the mocked boundary...');
        // We skip link.ensureDaemon() because we have manually spawned the mock server
        const response = await link.sendCommand('ping', []);

        console.log('[SUCCESS] THEN: The Mocked Oracle responded with success.');
        assert.strictEqual(response.status, 'success');
        
        const data = response.data as any;
        assert.strictEqual(data.message, 'pong from mock');

    } catch (error: any) {
        console.error(`[FAIL] IPC Boundary Failure: ${error.message}`);
        throw error;
    } finally {
        mockDaemon.close();
    }
});

