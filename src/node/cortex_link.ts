import { WebSocket } from 'ws';
import { execa } from 'execa';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DAEMON_ENTRYPOINT = path.join(PROJECT_ROOT, 'src/cstar/core/daemon.py');
const KEY_FILE = path.join(PROJECT_ROOT, '.agent', 'daemon.key');

export interface CortexResponse {
    type: string;
    data: any;
    status: string;
}

export class CortexLink {
    private port: number;
    private host: string;
    private wsUrl: string;

    private wsImpl: any;

    constructor(port = 50051, host = '127.0.0.1', wsImpl = WebSocket) {
        this.port = port;
        this.host = host;
        this.wsUrl = `ws://${this.host}:${this.port}`;
        this.wsImpl = wsImpl;
    }

    /**
     * Checks if the daemon port is listening. If not, spawns the python daemon
     * as a detached background process and waits for the port to open.
     */
    async ensureDaemon(): Promise<void> {
        const isUp = await this._checkPort();
        if (isUp) return;

        console.log(chalk.dim(`ALFRED: 'Awakening the Oracle...'`));
        // Port is down, start daemon
        execa('python', [DAEMON_ENTRYPOINT], {
            cwd: PROJECT_ROOT,
            detached: true,
            stdio: 'ignore'
        }).unref();

        // Poll until the port opens (max 30 seconds)
        const maxRetries = 60;
        const delayMs = 500;

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, delayMs));
            const nowUp = await this._checkPort();
            if (nowUp) return;
            if (i % 4 === 0) {
                console.log(chalk.dim(`ALFRED: 'Waiting for the Oracle to awaken (Cycle ${i / 4 + 1})...' `));
            }
        }

        throw new Error('Daemon failed to start or bind to port within 10 seconds.');
    }

    /**
     * Internal helper to quickly check if the port is open and accepting WebSocket connections.
     */
    private _checkPort(): Promise<boolean> {
        return new Promise((resolve) => {
            const ws = new this.wsImpl(this.wsUrl);
            ws.on('open', () => {
                ws.close();
                resolve(true);
            });
            ws.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Sends a command payload to the Python Daemon via WebSockets.
     */
    async sendCommand(command: string, args: string[] = [], cwd = process.cwd()): Promise<any> {
        const authKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
        const payload = {
            command,
            args,
            cwd
        };

        return new Promise((resolve, reject) => {
            const ws = new this.wsImpl(this.wsUrl);

            // Timeout after 30 seconds (longer for inference)
            const timeout = setTimeout(() => {
                ws.terminate();
                console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
                console.error(chalk.red('Critical Failure: Oracle unresponsive (Inference Timeout).\n'));
                reject(new Error('Oracle unresponsive.'));
            }, 30000);

            ws.on('open', () => {
                // Step 1: Authentication Handshake
                ws.send(JSON.stringify({ auth_key: authKey }));
                // Step 2: Send Command
                ws.send(JSON.stringify(payload));
            });

            ws.on('message', (data: Buffer) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.type === 'result') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(response.data);
                    }
                } catch (err) {
                    clearTimeout(timeout);
                    reject(new Error('Failed to parse daemon response'));
                }
            });

            ws.on('error', (err: Error) => {
                clearTimeout(timeout);
                reject(err);
            });

            ws.on('close', (code: number, reason: string) => {
                clearTimeout(timeout);
                if (code === 1008) {
                    reject(new Error(`Authentication Failed: ${reason}`));
                }
            });
        });
    }
}
