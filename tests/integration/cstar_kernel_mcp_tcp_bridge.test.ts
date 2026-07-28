import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const BRIDGE = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp-bridge.js');

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
}

class LineClient {
    private buffer = '';
    private nextId = 1;
    private readonly pending = new Map<number, (response: JsonRpcResponse) => void>();
    readonly proc: ChildProcessWithoutNullStreams;

    constructor(port: number) {
        this.proc = spawn('node', [BRIDGE], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
                CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
                CSTAR_KERNEL_MCP_TCP_PORT: String(port),
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.proc.stdout.setEncoding('utf8');
        this.proc.stdout.on('data', (chunk: string) => this.absorb(chunk));
        this.proc.stderr.setEncoding('utf8');
        this.proc.stderr.on('data', () => { /* keep MCP stdout clean */ });
    }

    private absorb(chunk: string): void {
        this.buffer += chunk;
        let nl = this.buffer.indexOf('\n');
        while (nl !== -1) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (line.length > 0) {
                const msg = JSON.parse(line) as JsonRpcResponse;
                const resolve = this.pending.get(msg.id);
                if (resolve) {
                    this.pending.delete(msg.id);
                    resolve(msg);
                }
            }
            nl = this.buffer.indexOf('\n');
        }
    }

    request(method: string, params?: unknown): Promise<JsonRpcResponse> {
        const id = this.nextId++;
        const payload = { jsonrpc: '2.0', id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`bridge request ${method} timed out`));
            }, 5_000);
            this.pending.set(id, (response) => {
                clearTimeout(timer);
                resolve(response);
            });
            this.proc.stdin.write(JSON.stringify(payload) + '\n');
        });
    }

    async close(): Promise<void> {
        this.proc.stdin.end();
        await new Promise<void>((resolve) => {
            if (this.proc.exitCode !== null) {
                resolve();
                return;
            }
            const timer = setTimeout(() => {
                this.proc.kill('SIGTERM');
                resolve();
            }, 1000);
            this.proc.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}

function startFakeDaemon(): Promise<{ port: number; close: () => Promise<void>; seenMethods: string[] }> {
    const seenMethods: string[] = [];
    const sockets = new Set<net.Socket>();
    const unexpectedSocketErrors: Error[] = [];
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.setEncoding('utf8');
        socket.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ECONNRESET') unexpectedSocketErrors.push(error);
        });
        let buffer = '';
        socket.on('data', (chunk: string) => {
            buffer += chunk;
            let nl = buffer.indexOf('\n');
            while (nl !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (line.length > 0) {
                    const request = JSON.parse(line) as { id?: number; method?: string };
                    seenMethods.push(request.method ?? '<missing>');
                    if (typeof request.id === 'number') {
                        socket.write(JSON.stringify({
                            jsonrpc: '2.0',
                            id: request.id,
                            result: { ok: true, method: request.method },
                        }) + '\n');
                    }
                }
                nl = buffer.indexOf('\n');
            }
        });
        socket.on('close', () => sockets.delete(socket));
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            assert.ok(address && typeof address === 'object');
            resolve({
                port: address.port,
                seenMethods,
                close: async () => {
                    for (const socket of sockets) socket.destroy();
                    await new Promise<void>((done) => server.close(() => done()));
                    assert.deepEqual(unexpectedSocketErrors, []);
                },
            });
        });
    });
}

describe('cstar-kernel MCP TCP bridge launcher', () => {
    it('proxies newline JSON-RPC from stdio to the configured TCP daemon', async () => {
        const daemon = await startFakeDaemon();
        const client = new LineClient(daemon.port);

        try {
            const response = await client.request('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'bridge-test', version: '1.0.0' },
            });

            assert.deepEqual(response.result, { ok: true, method: 'initialize' });
            assert.deepEqual(daemon.seenMethods, ['initialize']);
        } finally {
            await client.close();
            await daemon.close();
        }
    });

    it('flushes pending responses when stdin closes after a piped request', async () => {
        const daemon = await startFakeDaemon();
        const proc = spawn('node', [BRIDGE], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
                CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
                CSTAR_KERNEL_MCP_TCP_PORT: String(daemon.port),
                CSTAR_KERNEL_MCP_STDIN_CLOSE_GRACE_MS: '25',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        try {
            let stdout = '';
            proc.stdout.setEncoding('utf8');
            proc.stdout.on('data', (chunk: string) => { stdout += chunk; });
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
            proc.stdin.end();

            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('bridge did not exit after piped stdin close')), 1000);
                proc.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });

            const line = stdout.trim().split('\n').find(Boolean);
            assert.ok(line, 'bridge should flush the pending response before exit');
            const response = JSON.parse(line) as JsonRpcResponse;
            assert.deepEqual(response.result, { ok: true, method: 'initialize' });
        } finally {
            if (proc.exitCode === null) proc.kill('SIGTERM');
            await daemon.close();
        }
    });
});
