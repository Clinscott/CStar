#!/usr/bin/env node

/**
 * CStar MCP transport bridge.
 *
 * Default mode is `auto`: use the local TCP daemon when it is reachable, then
 * fall back to the direct source launcher when it is not. The exposed MCP
 * server remains exactly one `cstar-kernel` surface; this file only chooses the
 * transport path.
 */

import net from 'node:net';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIRECT_LAUNCHER = join(ROOT, 'bin', 'cstar-kernel-mcp.js');

const MODE = (process.env.CSTAR_KERNEL_MCP_TRANSPORT ?? 'auto').toLowerCase();
const HOST = process.env.CSTAR_KERNEL_MCP_TCP_HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.CSTAR_KERNEL_MCP_TCP_PORT ?? '8000', 10);
const CONNECT_TIMEOUT_MS = Number.parseInt(process.env.CSTAR_KERNEL_MCP_TCP_CONNECT_TIMEOUT_MS ?? '400', 10);
const RECONNECT_DELAY_MS = Number.parseInt(process.env.CSTAR_KERNEL_MCP_TCP_RECONNECT_DELAY_MS ?? '150', 10);
const MAX_RECONNECT_ATTEMPTS = Number.parseInt(process.env.CSTAR_KERNEL_MCP_TCP_RECONNECT_ATTEMPTS ?? '3', 10);

function log(message) {
    process.stderr.write(`[cstar-kernel-bridge] ${message}\n`);
}

function isValidMode(mode) {
    return mode === 'auto' || mode === 'tcp' || mode === 'direct';
}

function launchDirect(reason) {
    log(`using direct launcher (${reason})`);
    const child = spawn(process.execPath, [DIRECT_LAUNCHER], {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
            ...process.env,
            CSTAR_KERNEL_MCP: '1',
            CSTAR_KERNEL_DISABLE_WATCH: process.env.CSTAR_KERNEL_DISABLE_WATCH ?? '1',
            CSTAR_PROJECT_ROOT: process.env.CSTAR_PROJECT_ROOT ?? ROOT,
            CSTAR_WORKSPACE_ROOT: process.env.CSTAR_WORKSPACE_ROOT ?? ROOT,
        },
    });
    child.on('error', (error) => {
        log(`direct launcher error: ${error.message}`);
        process.exit(1);
    });
    child.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectTcp(timeoutMs = CONNECT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: HOST, port: PORT });
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error(`timeout connecting to ${HOST}:${PORT}`));
        }, timeoutMs);
        socket.once('connect', () => {
            clearTimeout(timer);
            socket.setEncoding('utf8');
            resolve(socket);
        });
        socket.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function parseId(line) {
    try {
        const msg = JSON.parse(line);
        const id = msg?.id;
        return typeof id === 'number' || typeof id === 'string' ? id : null;
    } catch {
        return null;
    }
}

function writeJsonRpcError(id, message) {
    if (id === null || id === undefined) return;
    process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message },
    }) + '\n');
}

async function startTcpProxy(initialSocket) {
    let socket = initialSocket;
    let responseBuffer = '';
    const pending = new Set();

    const clearPending = (message) => {
        for (const id of pending) {
            writeJsonRpcError(id, message);
        }
        pending.clear();
    };

    const attachSocket = (nextSocket) => {
        socket = nextSocket;
        responseBuffer = '';
        socket.on('data', (chunk) => {
            responseBuffer += chunk;
            let nl = responseBuffer.indexOf('\n');
            while (nl !== -1) {
                const line = responseBuffer.slice(0, nl);
                responseBuffer = responseBuffer.slice(nl + 1);
                const trimmed = line.trim();
                if (trimmed.length > 0) {
                    const id = parseId(trimmed);
                    if (id !== null) pending.delete(id);
                    process.stdout.write(trimmed + '\n');
                }
                nl = responseBuffer.indexOf('\n');
            }
        });
        socket.on('close', () => {
            socket = null;
            clearPending('CStar MCP TCP daemon connection closed before response');
        });
        socket.on('error', (error) => {
            log(`TCP daemon socket error: ${error.message}`);
        });
    };

    const ensureSocket = async () => {
        if (socket && !socket.destroyed) return socket;
        for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
            try {
                const nextSocket = await connectTcp();
                attachSocket(nextSocket);
                log(`reconnected to TCP daemon on attempt ${attempt}`);
                return nextSocket;
            } catch (error) {
                log(`reconnect attempt ${attempt} failed: ${error.message}`);
                await sleep(RECONNECT_DELAY_MS);
            }
        }
        throw new Error(`unable to reconnect to CStar MCP TCP daemon at ${HOST}:${PORT}`);
    };

    attachSocket(socket);
    log(`proxying stdio MCP through TCP daemon ${HOST}:${PORT}`);

    const rl = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
    });

    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return;
        const id = parseId(trimmed);
        if (id !== null) pending.add(id);
        try {
            const activeSocket = await ensureSocket();
            activeSocket.write(trimmed + '\n');
        } catch (error) {
            if (id !== null) pending.delete(id);
            writeJsonRpcError(id, error.message);
        }
    });

    rl.on('close', () => {
        if (socket && !socket.destroyed) socket.end();
        process.exit(0);
    });
}

async function main() {
    if (!isValidMode(MODE)) {
        log(`invalid CSTAR_KERNEL_MCP_TRANSPORT=${MODE}; expected auto, tcp, or direct`);
        process.exit(2);
    }
    if (MODE === 'direct') {
        launchDirect('CSTAR_KERNEL_MCP_TRANSPORT=direct');
        return;
    }

    try {
        const initialSocket = await connectTcp();
        await startTcpProxy(initialSocket);
    } catch (error) {
        if (MODE === 'tcp') {
            log(`TCP daemon unavailable: ${error.message}`);
            process.exit(1);
        }
        launchDirect(`TCP daemon unavailable: ${error.message}`);
    }
}

main().catch((error) => {
    log(`fatal bridge error: ${error.message}`);
    process.exit(1);
});
