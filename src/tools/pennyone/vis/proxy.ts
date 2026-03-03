import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import { registry } from '../pathRegistry.ts';
import { activePersona } from '../personaRegistry.ts';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { savePing, saveTrace, getTracesForFile } from '../intel/database.ts';

/**
 * P1 Visualization Proxy (v2.0)
 * Purpose: Lightweight static file server and WebSocket bridge for the P1 Dumb Client.
 * Mandate: Act as the "Eyes" for Muninn and other Ravens.
 * @param targetPath
 * @param port
 */
export async function startProxy(targetPath: string, port: number = 4000) {
    const server = fastify({ logger: false });
    const statsDir = path.join(registry.getRoot(), '.stats');
    const token = crypto.randomBytes(16).toString('hex');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '../../../../dist/pennyone-vis');

    await server.register(fastifyCors);
    await server.register(fastifyStatic, {
        root: distDir,
        prefix: '/',
        decorateReply: false
    });

    await server.register(fastifyStatic, {
        root: statsDir,
        prefix: '/stats/',
        decorateReply: false
    });

    // 3. Security Hook: Protect sensitive data but allow internal telemetry
    server.addHook('onRequest', async (request, reply) => {
        const url = request.raw.url || '';

        // [Ω] Autonomic Nervous System Exemption:
        // Internal telemetry (pings/traces) from Python agents must pass freely.
        if (url.includes('/api/telemetry/')) {
            return;
        }

        // Token protection for UI and Config
        const queryToken = (request.query as any)?.token;
        const authHeader = request.headers.authorization;

        if (url.startsWith('/stats/') || url.startsWith('/api/')) {
            if (queryToken !== token && authHeader !== `Bearer ${token}`) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    });

    // 4. WebSocket Relay
    const wss = new WebSocketServer({ server: server.server as any });
    const clients = new Set<WebSocket>();
    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
    });

    // 5. Signal Watcher
    const signalFile = path.join(statsDir, 'p1-refresh.signal');
    fs.watch(statsDir, (event, filename) => {
        if (filename === 'p1-refresh.signal' && fs.existsSync(signalFile)) {
            const signal = fs.readFileSync(signalFile, 'utf-8');
            const message = JSON.stringify({ type: 'MATRIX_UPDATED', timestamp: signal });
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(message);
            });
        }
    });

    // 6. API Routes
    server.get('/api/matrix', async (request, reply) => {
        try {
            const graphPath = path.join(statsDir, 'matrix-graph.json');
            const graphData = fs.readFileSync(graphPath, 'utf-8');
            return JSON.parse(graphData);
        } catch (err) {
            return reply.status(404).send({ error: 'Matrix graph not found.' });
        }
    });

    server.get('/api/gravity', async (request, reply) => {
        try {
            const gravityPath = path.join(statsDir, 'gravity.json');
            const gravityData = fs.readFileSync(gravityPath, 'utf-8');
            return JSON.parse(gravityData);
        } catch (err) {
            return {};
        }
    });

    server.get('/api/config', async () => ({ token, port }));

    server.post('/api/telemetry/ping', async (request, reply) => {
        try {
            await savePing(request.body as any, targetPath);
            return { status: 'success' };
        } catch (err) {
            return reply.status(500).send({ status: 'error' });
        }
    });

    server.post('/api/telemetry/trace', async (request, reply) => {
        try {
            await saveTrace(request.body as any);
            return { status: 'success' };
        } catch (err) {
            return reply.status(500).send({ status: 'error' });
        }
    });

    server.get('/api/matrix/trajectories', async (request, reply) => {
        try {
            const filePath = (request.query as any).file;
            if (!filePath) return reply.status(400).send({ error: 'File path required.' });
            const traces = getTracesForFile(filePath);
            return traces;
        } catch (err) {
            return reply.status(500).send({ error: 'Failed to retrieve trajectories.' });
        }
    });

    try {
        await server.listen({ port, host: '127.0.0.1' });
        const url = `http://127.0.0.1:${port}/?token=${token}`;
        fs.writeFileSync(path.join(statsDir, 'signet.url'), url, 'utf-8');
        console.log(chalk.cyan(`\n${activePersona.prefix}: "Autonomic Nervous System Vision online."`));
        console.log(chalk.bold.green(url));
    } catch (err) {
        process.exit(1);
    }
}

