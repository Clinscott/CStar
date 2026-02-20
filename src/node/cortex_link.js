import net from 'node:net';
import { execa } from 'execa';
import chalk from 'chalk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DAEMON_ENTRYPOINT = path.join(PROJECT_ROOT, 'src/cstar/core/daemon.py');

export class CortexLink {
    constructor(port = 50051, host = '127.0.0.1') {
        this.port = port;
        this.host = host;
    }

    /**
     * Checks if the daemon port is listening. If not, spawns the python daemon
     * as a detached background process and waits for the port to open.
     */
    async ensureDaemon() {
        const isUp = await this._checkPort();
        if (isUp) return;

        // Port is down, start daemon
        execa('python', [DAEMON_ENTRYPOINT], {
            cwd: PROJECT_ROOT,
            detached: true,
            stdio: 'ignore'
        }).unref(); // Detach the process completely from the Node event loop

        // Poll until the port opens (max 5 seconds)
        const maxRetries = 10;
        const delayMs = 500;

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, delayMs));
            const nowUp = await this._checkPort();
            if (nowUp) return;
        }

        throw new Error('Daemon failed to start or bind to port within 5 seconds.');
    }

    /**
     * Internal helper to quickly check if the port is open and accepting TCP connections.
     */
    _checkPort() {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(500);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', () => {
                resolve(false);
            });

            socket.connect(this.port, this.host);
        });
    }

    /**
     * Sends a command payload to the Python Daemon via TCP.
     * Handles fragmented TCP packets using buffer accumulation.
     */
    async sendCommand(command, args = [], cwd = process.cwd()) {
        const payload = {
            command,
            args,
            cwd
        };

        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            let responseData = '';

            // Strict 3000ms timeout
            client.setTimeout(3000);

            client.connect(this.port, this.host, () => {
                client.write(JSON.stringify(payload));
            });

            client.on('data', (chunk) => {
                responseData += chunk.toString();
            });

            client.on('end', () => {
                // Ignore empty responses, might just be a disconnect
                if (!responseData.trim()) {
                    return resolve(null);
                }
                try {
                    const parsed = JSON.parse(responseData);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('Invalid JSON from Cortex'));
                }
            });

            client.on('error', (err) => {
                reject(err);
            });

            client.on('timeout', () => {
                client.destroy();
                // Linscott Standard: High-contrast error block
                console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
                console.error(chalk.red('Critical Failure: Daemon unresponsive. Port locked.\n'));
                reject(new Error('Daemon unresponsive. Port locked.'));
            });
        });
    }
}
