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
    
    // Lazy-load CortexLink when needed
    let cortexLink: any = null;

    wss.on('connection', (ws) => {
        clients.add(ws);
        
        ws.on('message', async (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'ARCHITECT_NODE_MOVED') {
                    if (!cortexLink) {
                        const { CortexLink } = await import('../../../node/cortex_link.ts');
                        cortexLink = new CortexLink();
                    }
                    const sourcePath = msg.payload.sourcePath;
                    const targetPath = msg.payload.targetPath;
                    console.log(chalk.cyan(`[SENSORY MATRIX] Received UI architect intent: Move ${sourcePath} to ${targetPath}`));
                    await cortexLink.handleArchitectMove(sourcePath, targetPath);
                    broadcast({ type: 'MATRIX_UPDATED', timestamp: Date.now() });
                }
            } catch (err) {
                console.error(chalk.red(`[SENSORY MATRIX] WebSocket message error: ${err}`));
            }
        });

        ws.on('close', () => clients.delete(ws));
    });

    const broadcast = (message: any) => {
        const data = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(data);
        });
    };

    // 5. API Routes
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

    interface TelemetryPing {
        agent_id: string;
        action: string;
        target_path: string;
        timestamp: number;
    }

    interface TelemetryTrace {
        mission_id: string;
        file_path: string;
        target_metric: string;
        initial_score: number;
        final_score: number;
        justification: string;
        status: string;
        timestamp: number;
    }

    server.post('/api/telemetry/ping', async (request, reply) => {
        try {
            const ping = request.body as TelemetryPing;
            await savePing(ping, targetPath);
            
            // [🔱] THE SYNAPTIC LINK: Instant Relay
            broadcast({ type: 'AGENT_TRACE', payload: ping });
            broadcast({ type: 'MATRIX_UPDATED', timestamp: Date.now() });

            // Trigger re-index if this was a mutation/repair
            if (['REPAIR', 'FIX', 'MUTATE'].includes(ping.action?.toUpperCase())) {
                const { indexSector } = await import('../index.ts');
                const absPath = path.resolve(registry.getRoot(), ping.target_path);
                await indexSector(absPath);
            }

            return { status: 'success' };
        } catch (err) {
            return reply.status(500).send({ status: 'error' });
        }
    });

    server.post('/api/telemetry/trace', async (request, reply) => {
        try {
            const trace = request.body as TelemetryTrace;
            await saveTrace(trace);
            
            // [🔱] THE SYNAPTIC LINK: Instant Relay
            broadcast({ type: 'MISSION_TRACE', payload: trace });
            broadcast({ type: 'MATRIX_UPDATED', timestamp: Date.now() });

            return { status: 'success' };
        } catch (err) {
            return reply.status(500).send({ status: 'error' });
        }
    });

    server.get('/api/matrix/trajectories', async (request, reply) => {
        try {
            const filePath = (request.query as { file: string }).file;
            if (!filePath) return reply.status(400).send({ error: 'File path required.' });
            const traces = getTracesForFile(filePath);
            return traces;
        } catch (err) {
            return reply.status(500).send({ error: 'Failed to retrieve trajectories.' });
        }
    });

    server.get('/api/matrix/sessions', async (request, reply) => {
        try {
            const { getRecentSessions } = await import('../intel/database.ts');
            const sessions = getRecentSessions(20); // Last 20 sessions
            return sessions;
        } catch (err) {
            return reply.status(500).send({ error: 'Failed to retrieve sessions.' });
        }
    });

    server.get('/api/matrix/session-pings', async (request, reply) => {
        try {
            const sessionId = (request.query as { id: string }).id;
            if (!sessionId) return reply.status(400).send({ error: 'Session ID required.' });
            const { getPingsForSession } = await import('../intel/database.ts');
            const pings = getPingsForSession(parseInt(sessionId));
            return pings;
        } catch (err) {
            return reply.status(500).send({ error: 'Failed to retrieve session pings.' });
        }
    });

    server.post('/api/matrix/dispatch', async (request, reply) => {
        try {
            const { agent, target } = request.body as { agent: string, target: string };
            if (!target) return reply.status(400).send({ error: 'Target sector required.' });

            console.error(chalk.cyan(`\n[SENSORY MATRIX] Dispatching ${agent || 'Agent'} to sector ${target}...`));
            
            const { execa } = await import('execa');
            const projectRoot = registry.getRoot();
            const cstarPath = path.join(projectRoot, 'bin/cstar.js');
            
            const result = await execa('node', [
                cstarPath, 
                'skill', 
                'run-task', 
                `Sanitize and document ${target}`,
                target
            ]);

            return { status: 'success', output: result.stdout };
        } catch (err: any) {
            console.error(`[ERROR] Dispatch failed: ${err.message}`);
            return reply.status(500).send({ error: 'Dispatch failed.', message: err.message });
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

