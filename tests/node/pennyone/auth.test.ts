import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { startBridge } from '../../../src/tools/pennyone/vis/server.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

describe('PennyOne Server Authentication', () => {
    const PORT = 4110;
    const statsDir = path.join(process.cwd(), '.stats');
    const signetPath = path.join(statsDir, 'signet.url');

    it('should block unauthorized requests and allow authorized ones', async () => {
        // 0. Pre-test: clear stale token
        if (fs.existsSync(signetPath)) fs.unlinkSync(signetPath);

        // 1. Start server
        startBridge('src/tools/pennyone', PORT);
        
        // Wait for signet.url to be written
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

        assert.ok(token, 'Should have generated a new security token for this session');

        // 2. Test Unauthorized (No Token)
        const resUnauthorized = await new Promise<number>((resolve) => {
            http.get(`http://127.0.0.1:${PORT}/api/matrix`, (res) => {
                resolve(res.statusCode || 0);
            });
        });
        assert.strictEqual(resUnauthorized, 401, 'Should block access without token');

        // 3. Test Authorized (Valid Token)
        const resAuthorized = await new Promise<number>((resolve) => {
            const req = http.get(`http://127.0.0.1:${PORT}/api/matrix?token=${token}`, (res) => {
                resolve(res.statusCode || 0);
            });
            req.on('error', (e) => {
                console.error("Request error:", e);
                resolve(500);
            });
        });
        
        assert.ok(resAuthorized === 200 || resAuthorized === 404, `Should allow access with valid token (Got ${resAuthorized})`);
    });
});
