import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import { registry } from '../pathRegistry.js';
import { activePersona } from '../personaRegistry.js';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

/**
 * P1 Visualization Proxy (v2.0)
 * Purpose: Lightweight static file server and WebSocket bridge for the P1 Dumb Client.
 */
export async function startProxy(targetPath: string, port: number = 4000) {
    const server = fastify({ logger: false });
    const statsDir = path.join(registry.getRoot(), '.stats');
    const token = crypto.randomBytes(16).toString('hex');

    // ESM __dirname replacement
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '../../../../dist/pennyone-vis');

    // 1. Plugins
    await server.register(fastifyCors);
    await server.register(fastifyStatic, {
        root: distDir,
        prefix: '/',
        decorateReply: false
    });

    // 2. Serve the .stats directory as a static data lake
    await server.register(fastifyStatic, {
        root: statsDir,
        prefix: '/stats/',
        decorateReply: false
    });

    // 3. Simple Token Middleware (simplified for proxy)
    server.addHook('onRequest', async (request, reply) => {
        const queryToken = (request.query as any)?.token;
        const authHeader = request.headers.authorization;
        
        // Allow static assets without token, protect JSON/API
        if (request.url.startsWith('/stats/') || request.url.startsWith('/api/')) {
            if (queryToken !== token && authHeader !== `Bearer ${token}`) {
                reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    });

    // 4. WebSocket Relay for Real-time Updates
    const wss = new WebSocketServer({ server: server.server as any });
    const clients = new Set<WebSocket>();

    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
    });

    // 5. Signal Watcher: Watch for the Daemon's refresh signal
    const signalFile = path.join(statsDir, 'p1-refresh.signal');
    fs.watch(statsDir, (event, filename) => {
        if (filename === 'p1-refresh.signal' && fs.existsSync(signalFile)) {
            console.log(chalk.blue(`${activePersona.prefix}: "Daemon signal detected. Synchronizing UI Matrix..."`));
            const signal = fs.readFileSync(signalFile, 'utf-8');
            const message = JSON.stringify({ type: 'MATRIX_UPDATED', timestamp: signal });
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(message);
            });
        }
    });

    // 6. Routes
    server.get('/api/config', async () => ({ token, port }));

    try {
        await server.listen({ port, host: '127.0.0.1' });
        const url = `http://127.0.0.1:${port}/?token=${token}`;
        
        // Write the Signet
        fs.writeFileSync(path.join(statsDir, 'signet.url'), url, 'utf-8');

        console.log(chalk.cyan(`\n${activePersona.prefix}: "P1 Visualization Proxy established."`));
        console.log(chalk.bold.green(url));
        console.log(chalk.dim('[SIGNET]: Written to .stats/signet.url\n'));
    } catch (err) {
        console.error(chalk.red('Failed to start P1 Proxy:'), err);
        process.exit(1);
    }
}
