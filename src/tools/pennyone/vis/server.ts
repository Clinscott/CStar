import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import chalk from 'chalk';
import { createServer } from 'http';
import { SubspaceRelay } from '../live/socket.js';
import { startWatcher } from '../live/watcher.js';
import { handleTelemetryPing } from '../live/telemetry.js';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import os from 'os';
import { getSessionsWithSummaries, getSessionPings } from '../intel/database.js';
import { fileURLToPath } from 'url';
import { activePersona } from '../personaRegistry.js';

/**
 * PennyOne Bridge Server
 * Purpose: Serve Phase 3 visualization and local repository stats.
 */
export function startBridge(targetPath: string, port: number = 4000) {
    const app = express();
    const server = createServer(app);
    const statsDir = path.join(process.cwd(), '.stats');

    // [Ω] Security: Generate ephemeral token
    const token = crypto.randomBytes(16).toString('hex');

    // ESM __dirname replacement
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '../../../../dist/pennyone-vis');

    console.log(chalk.dim(`[DEBUG] Bridge Dist Directory: ${distDir}`));
    if (!fsSync.existsSync(distDir)) {
        console.error(chalk.red(`[CRITICAL] Distribution directory missing: ${distDir}`));
    } else {
        const files = fsSync.readdirSync(distDir);
        console.log(chalk.dim(`[DEBUG] Dist files: ${files.join(', ')}`));
    }

    // Security Middleware: Bearer Auth
    const bearerAuth = (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        const queryToken = req.query.token;
        if (authHeader === `Bearer ${token}` || queryToken === token) {
            console.log(chalk.dim(`[DEBUG] Authorized request: ${req.method} ${req.url}`));
            return next();
        }
        console.warn(chalk.red(`${activePersona.prefix}: "Unauthorized access attempt blocked. Perimeter intact."`));
        console.warn(chalk.dim(`[DEBUG] Method: ${req.method} | URL: ${req.url} | Token: ${queryToken ? 'Present' : 'Missing'}`));
        res.status(401).json({ error: "Unauthorized. Valid token required." });
    };

    app.use((req, res, next) => {
        console.log(chalk.dim(`[DEBUG] Request: ${req.method} ${req.url}`));
        next();
    });

    // 0. Initialize Live Loop
    const relay = new SubspaceRelay(server);
    startWatcher(targetPath, relay);

    app.use(bodyParser.json());

    // 1. Core APIs
    app.get('/api/matrix', bearerAuth, async (req: Request, res: Response) => {
        try {
            const graphPath = path.join(statsDir, 'matrix-graph.json');
            console.log(chalk.dim(`[DEBUG] Reading matrix graph: ${graphPath}`));
            const graphData = await fs.readFile(graphPath, 'utf-8');
            res.json(JSON.parse(graphData));
        } catch (err) {
            console.error(chalk.red(`[DEBUG] Matrix Error: ${err}`));
            res.status(404).json({ error: "Matrix graph not found." });
        }
    });

    app.get('/api/gravity', bearerAuth, async (req: Request, res: Response) => {
        try {
            const gravityData = await fs.readFile(path.join(statsDir, 'gravity.json'), 'utf-8');
            res.json(JSON.parse(gravityData));
        } catch (err) {
            res.json({});
        }
    });

    app.post('/api/telemetry/ping', bearerAuth, (req: Request, res: Response) => {
        handleTelemetryPing(req, res, relay, targetPath);
    });

    app.post('/api/log', bearerAuth, async (req: Request, res: Response) => {
        try {
            const { type, message, stack } = req.body;
            const logEntry = `[${new Date().toISOString()}] [${type}] ${message}\n${stack ? stack + '\n' : ''}`;
            await fs.appendFile(path.join(statsDir, 'client_logs.txt'), logEntry);
            res.json({ status: "logged" });
        } catch (err) {
            res.status(500).json({ error: "Logging failed" });
        }
    });

    // --- [Ω] OPERATION CHRONICLE PLAYBACK ---

    app.get('/api/chronicle/sessions', bearerAuth, async (req: Request, res: Response) => {
        try {
            const sessions = getSessionsWithSummaries(targetPath);
            res.json(sessions);
        } catch (err) {
            res.status(500).json({ error: "Failed to retrieve archives." });
        }
    });

    app.post('/api/chronicle/playback/:id', bearerAuth, async (req: Request, res: Response) => {
        try {
            const sessionId = parseInt(req.params.id);
            const pings = getSessionPings(sessionId, targetPath);
            if (pings.length === 0) return res.status(404).json({ error: "Empty session." });
            relay.startPlayback(pings, req.body.speed || 2.0);
            res.json({ status: "Playback initiated" });
        } catch (err) {
            res.status(500).json({ error: "Playback failure." });
        }
    });

    app.get('/api/chronicle/download/:id', bearerAuth, async (req: Request, res: Response) => {
        try {
            const sessionId = parseInt(req.params.id);
            const pings = getSessionPings(sessionId, targetPath);
            const sessions = getSessionsWithSummaries(targetPath);
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return res.status(404).json({ error: "Not found." });

            const downloadDir = path.join(os.homedir(), 'Downloads');
            const destPath = path.join(downloadDir, `CSTAR_CHRONICLE_${sessionId}.json`);
            await fs.writeFile(destPath, JSON.stringify({ metadata: session, pings }, null, 2));
            res.json({ status: "Downloaded", path: destPath });
        } catch (err) {
            res.status(500).json({ error: "Download failed." });
        }
    });

    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
    });

    server.listen(port, '127.0.0.1', () => {
        const url = `http://127.0.0.1:${port}/?token=${token}`;

        // [Ω] The Signet: Write active URL to file for background retrieval
        try {
            if (!fsSync.existsSync(statsDir)) fsSync.mkdirSync(statsDir, { recursive: true });
            fsSync.writeFileSync(path.join(statsDir, 'signet.url'), url, 'utf-8');
        } catch (e) {
            console.error("Failed to write signet file.");
        }

        console.log(chalk.cyan(`\n${activePersona.prefix}: "Bridge established, sir. The Matrix is accessible via the Signet."`));
        console.log(chalk.bold.green(url));
        console.log(chalk.dim(`[SIGNET]: Written to .stats/signet.url\n`));
    });
}
