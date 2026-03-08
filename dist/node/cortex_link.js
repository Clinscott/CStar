import { WebSocket } from 'ws';
import { execa } from 'execa';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activePersona } from '../tools/pennyone/personaRegistry.js';
import { Project } from 'ts-morph';
import { getPythonPath } from './core/python_utils.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DAEMON_ENTRYPOINT = path.join(PROJECT_ROOT, 'src/cstar/core/daemon.py');
const KEY_FILE = path.join(PROJECT_ROOT, '.agents', 'daemon.key');
export class CortexLink {
    port;
    host;
    wsUrl;
    wsImpl;
    daemonChild = null;
    activeSocket = null;
    constructor(port = 50051, host = '127.0.0.1', wsImpl = WebSocket) {
        this.port = port;
        this.host = host;
        this.wsUrl = `ws://${this.host}:${this.port}`;
        this.wsImpl = wsImpl;
    }
    /**
     * Handles the Two-Phase Commit for moving physical files and updating AST.
     * @param sourcePath Original file path relative to root
     * @param targetPath Target file path relative to root
     */
    async handleArchitectMove(sourcePath, targetPath) {
        console.log(chalk.cyan(`[CORTEX] Initiating AST Two-Phase Commit: ${sourcePath} -> ${targetPath}`));
        // Phase 1: AST Instantiation (In-Memory)
        const project = new Project({
            tsConfigFilePath: path.join(PROJECT_ROOT, 'tsconfig.json'),
            skipAddingFilesFromTsConfig: false,
        });
        const absSource = path.join(PROJECT_ROOT, sourcePath);
        const absTarget = path.join(PROJECT_ROOT, targetPath);
        const sourceFile = project.getSourceFile(absSource);
        if (sourceFile) {
            // This updates the imports across the project in-memory
            sourceFile.move(absTarget);
            console.log(chalk.dim(`[CORTEX] AST mutations staged for ${sourcePath}.`));
        }
        else {
            console.warn(chalk.yellow(`[CORTEX] File not found in AST: ${sourcePath}. Proceeding with physical move only.`));
        }
        // Phase 2: Physical Move Request (Python Daemon)
        try {
            const response = await this.sendCommand('PHYSICAL_MOVE_REQUEST', [sourcePath, targetPath]);
            if (response.status === 'success' && response.data?.status === 'MOVE_SUCCESS') {
                console.log(chalk.green(`[CORTEX] Daemon confirmed physical move. Flushing AST...`));
                try {
                    // Flush AST mutations to disk
                    await project.save();
                    console.log(chalk.green(`[CORTEX] AST flush complete. Sync locked.`));
                    return true;
                }
                catch (saveError) {
                    console.error(chalk.red(`[CORTEX] AST flush failed! Triggering FATAL_ROLLBACK.`));
                    await this.sendCommand('FATAL_ROLLBACK', [sourcePath, targetPath]);
                    return false;
                }
            }
            else {
                console.warn(chalk.yellow(`[CORTEX] Daemon rejected move. Discarding AST mutations.`));
                // project.save() is never called, so changes are discarded.
                return false;
            }
        }
        catch (err) {
            console.error(chalk.red(`[CORTEX] Physical move request failed: ${err.message}`));
            return false;
        }
    }
    /**
     * Intercepts a file write intent and performs pre-disk adjudication via the Ghost Warden.
     * @param filePath Target file path
     * @param content Proposed content string
     * @returns Promise resolving to the verified content if cleared
     * @throws Error if Ghost Warden issues a PRECOGNITIVE_WARNING
     */
    async interceptWrite(filePath, content) {
        console.log(chalk.cyan(`[CORTEX] Ghost Pulse Emission: Adjudicating mutation for ${filePath}...`));
        try {
            const response = await this.sendCommand('GHOST_PULSE', [filePath, content]);
            if (response.status === 'success') {
                const result = response.data;
                if (result.status === 'PULSE_CLEARED') {
                    console.log(chalk.green(`[CORTEX] Ghost Pulse Cleared (Score: ${result.score}). Allowing write.`));
                    return content;
                }
                else {
                    const reasonStr = result.reasons.join(' | ');
                    console.error(chalk.bgRed.white.bold(' [PRECOGNITIVE WARNING] '));
                    console.error(chalk.red(`Ghost Warden Rejected Mutation: ${reasonStr} (Score: ${result.score})`));
                    throw new Error(`[PRECOGNITIVE_WARNING] ${reasonStr}`);
                }
            }
            else {
                console.warn(chalk.yellow(`[CORTEX] Ghost Warden communication failure. Falling back to optimistic write.`));
                return content;
            }
        }
        catch (err) {
            if (err.message.includes('[PRECOGNITIVE_WARNING]'))
                throw err;
            console.warn(chalk.yellow(`[CORTEX] Ghost Pulse failed: ${err.message}. Proceeding cautiously.`));
            return content;
        }
    }
    /**
     * Checks if the daemon port is listening. If not, spawns the python daemon
     * as a background process and waits for the port to open.
     * In test mode, the process is attached so it dies with the test runner.
     */
    async ensureDaemon() {
        const isUp = await this._checkPort();
        if (isUp)
            return;
        console.log(chalk.dim(`${activePersona.prefix} 'Awakening the Oracle...'`));
        const isTestEnv = process.env.NODE_ENV === 'test';
        // Port is down, start daemon
        const child = execa(getPythonPath(), [DAEMON_ENTRYPOINT], {
            cwd: PROJECT_ROOT,
            detached: !isTestEnv, // Do NOT detach during tests to prevent ghost processes
            stdio: 'ignore',
            env: {
                ...process.env,
                CSTAR_DAEMON_PORT: this.port.toString()
            }
        });
        this.daemonChild = child;
        if (!isTestEnv) {
            child.unref();
        }
        // Poll until the port opens (max 30 seconds)
        const maxRetries = 60;
        const delayMs = 500;
        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, delayMs));
            const nowUp = await this._checkPort();
            if (nowUp)
                return;
            if (i % 4 === 0) {
                console.log(chalk.dim(`${activePersona.prefix} 'Waiting for the Oracle to awaken (Cycle ${i / 4 + 1})...' `));
            }
        }
        throw new Error('Daemon failed to start or bind to port within 30 seconds.');
    }
    /**
     * Internal helper to quickly check if the port is open and accepting WebSocket connections.
     */
    _checkPort() {
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
     * @param command
     * @param args
     * @param cwd
     */
    async sendCommand(command, args = [], cwd = process.cwd()) {
        const authKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
        const payload = {
            command,
            args,
            cwd
        };
        return new Promise((resolve, reject) => {
            const ws = new this.wsImpl(this.wsUrl);
            // Timeout after 300 seconds (longer for inference)
            const timeout = setTimeout(() => {
                ws.terminate();
                console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
                console.error(chalk.red('Critical Failure: Oracle unresponsive (Inference Timeout).\n'));
                reject(new Error('Oracle unresponsive.'));
            }, 300000);
            ws.on('open', () => {
                // Store active socket for explicit client-side teardown
                this.activeSocket = ws;
                // Step 1: Authentication Handshake
                ws.send(JSON.stringify({ type: 'auth', auth_key: authKey }));
                // Step 2: Send Command
                ws.send(JSON.stringify(payload));
            });
            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response && response.type === 'result') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(response.data);
                    }
                }
                catch (err) {
                    clearTimeout(timeout);
                    reject(new Error('Failed to parse daemon response'));
                }
            });
            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                if (code === 1008) {
                    reject(new Error(`Authentication Failed: ${reason}`));
                }
            });
        });
    }
    /**
     * Sends a shutdown signal to the daemon and forces process death if attached.
     */
    async shutdownDaemon() {
        try {
            await this.sendCommand('shutdown');
        }
        catch (err) {
            // Silently fail if already down
        }
        // Sever the client-side socket to break any hanging promises from the server
        if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
            this.activeSocket.terminate();
        }
        // If we spawned it and it's attached (test mode), force kill it to free the event loop
        if (this.daemonChild && this.daemonChild.pid) {
            try {
                if (process.platform === 'win32') {
                    // Hard OS-level kill on Windows to prevent IPC deadlocks
                    execa('taskkill', ['/F', '/T', '/PID', this.daemonChild.pid.toString()]).unref();
                }
                else {
                    this.daemonChild.kill('SIGKILL');
                }
            }
            catch (e) {
                // Ignore
            }
        }
    }
}
