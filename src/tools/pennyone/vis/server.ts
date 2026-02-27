import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { createServer } from 'http';
import { SubspaceRelay } from '../live/socket.js';
import { startWatcher } from '../live/watcher.js';
import { handleTelemetryPing } from '../live/telemetry.js';
import bodyParser from 'body-parser';
import crypto from 'crypto';

import { fileURLToPath } from 'url';

/**
 * PennyOne Bridge Server
 * Purpose: Serve Phase 3 visualization and local repository stats.
 */
export function startBridge(targetPath: string, port: number = 4000) {
    const app = express();
    const server = createServer(app);
    const statsDir = path.join(targetPath, '.stats');

    // Generate ephemeral token for this session
    const token = crypto.randomBytes(16).toString('hex');

    // ESM __dirname replacement
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '../../../../dist/pennyone-vis');

    // Security Middleware: Bearer Auth
    const bearerAuth = (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (authHeader === `Bearer ${token}` || req.query.token === token) {
            return next();
        }
        console.warn(chalk.red(`[ODIN]: "Unauthorized access attempt blocked from ${req.ip}. Perimeter intact."`));
        res.status(401).json({ error: "Unauthorized. Valid Bearer token required." });
    };

    // 0. Initialize Live Loop
    const relay = new SubspaceRelay(server);
    startWatcher(targetPath, relay);

    app.use(bodyParser.json());

    // 1. Serve Matrix Graph API (Protected)
    app.get('/api/matrix', bearerAuth, async (req: Request, res: Response) => {
        try {
            const graphData = await fs.readFile(path.join(statsDir, 'matrix-graph.json'), 'utf-8');
            res.json(JSON.parse(graphData));
        } catch (err) {
            res.status(404).json({ error: "Matrix graph not found. Run 'pennyone scan' first." });
        }
    });

    app.post('/api/telemetry/ping', bearerAuth, (req: Request, res: Response) => {
        handleTelemetryPing(req, res, relay, targetPath);
    });

    // 2. Serve Static Frontend (Unprotected)
    app.use(express.static(distDir));

    // Fallback for SPA routing
    app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
    });

    // Bind strictly to 127.0.0.1
    server.listen(port, '127.0.0.1', () => {
        console.log(chalk.cyan(`\n[ALFRED]: "Bridge established, sir. The Matrix is accessible at:"`));
        console.log(chalk.bold.green(`http://127.0.0.1:${port}/?token=${token}`));
        console.log(chalk.cyan(`[ALFRED]: "Monitoring telemetry from: ${targetPath}"\n`));
    });
}

