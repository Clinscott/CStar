import { test, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { startBridge } from '../../../src/tools/pennyone/vis/server.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

describe('PennyOne Bridge Diagnostics', () => {
    const PORT = 4120;
    const statsDir = path.join(process.cwd(), '.stats');
    const signetPath = path.join(statsDir, 'signet.url');

    it('Launches the server and serves index.html', async () => {
        // 0. Pre-test: clear stale state
        if (!fs.existsSync(statsDir)) fs.mkdirSync(statsDir);
        if (fs.existsSync(signetPath)) fs.unlinkSync(signetPath);
        
        // 1. Start server
        startBridge(process.cwd(), PORT);

        // 2. Wait for server to spin up and write signet
        let token = '';
        for (let i = 0; i < 20; i++) {
            if (fs.existsSync(signetPath)) {
                const url = fs.readFileSync(signetPath, 'utf-8');
                const match = url.match(/token=([a-f0-9]+)/);
                if (match) {
                    token = match[1];
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        assert.ok(token, 'Should have generated a security token');

        // 3. Fetch index.html (no auth needed)
        const fetchIndex = () => new Promise<string>((resolve, reject) => {
            http.get(`http://127.0.0.1:${PORT}/`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });

        const indexHtml = await fetchIndex();
        // The title might be different in the built HTML, let's check for "Matrix" or a known element
        assert.ok(indexHtml.includes('Matrix') || indexHtml.includes('id="root"'), 'Should serve index.html');

        // 4. Fetch API Matrix (auth needed)
        const fetchMatrix = (useToken: boolean) => new Promise<number>((resolve, reject) => {
            const url = `http://127.0.0.1:${PORT}/api/matrix${useToken ? `?token=${token}` : ''}`;
            http.get(url, (res) => {
                resolve(res.statusCode || 0);
            }).on('error', reject);
        });

        const statusNoAuth = await fetchMatrix(false);
        assert.equal(statusNoAuth, 401, 'Should block unauthorized API access');

        const statusAuth = await fetchMatrix(true);
        // Can be 200 (if scan ran) or 404 (if no graph), but 401 is failure.
        assert.ok(statusAuth === 200 || statusAuth === 404, `Should allow authorized API access (Got ${statusAuth})`);
        
        console.log(`[DIAG] Server diagnostic successful on port ${PORT}`);
    });
});
