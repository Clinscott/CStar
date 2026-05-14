/**
 * Integration test for `bin/cstar-kernel-mcp.js`.
 *
 * Spawns the launcher as a child process, completes the MCP `initialize`
 * handshake, then exercises `tools/list` and `tools/call` (cstar_status)
 * over stdio JSON-RPC. This catches a class of regression invisible to the
 * unit tests: loader resolution, env propagation, schema validity at
 * registration time, and the actual stdio framing of the SDK.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const LAUNCHER = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js');

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: unknown;
}

interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: any;
    error?: { code: number; message: string };
}

class StdioMcpClient {
    private buffer = '';
    private readonly pending = new Map<number, (resp: JsonRpcResponse) => void>();
    public readonly proc: ChildProcessWithoutNullStreams;
    private nextId = 1;

    constructor() {
        this.proc = spawn('node', [LAUNCHER], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP: '1',
                NODE_OPTIONS: '--max-old-space-size=2048',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.proc.stdout.setEncoding('utf-8');
        this.proc.stdout.on('data', (chunk: string) => this.absorb(chunk));
        // stderr is captured but not asserted on — the launcher logs bootstrap
        // diagnostics on stderr which we don't want to fail tests on.
        this.proc.stderr.setEncoding('utf-8');
        this.proc.stderr.on('data', () => { /* sink */ });
    }

    private absorb(chunk: string): void {
        this.buffer += chunk;
        let nl = this.buffer.indexOf('\n');
        while (nl !== -1) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (line.length > 0) {
                try {
                    const msg = JSON.parse(line) as JsonRpcResponse;
                    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
                        const resolve = this.pending.get(msg.id)!;
                        this.pending.delete(msg.id);
                        resolve(msg);
                    }
                } catch {
                    // Non-JSON line — ignore (could be a stray banner).
                }
            }
            nl = this.buffer.indexOf('\n');
        }
    }

    request(method: string, params?: unknown, timeoutMs = 10_000): Promise<JsonRpcResponse> {
        const id = this.nextId++;
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`MCP request ${method} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pending.set(id, (resp) => {
                clearTimeout(timer);
                resolve(resp);
            });
            this.proc.stdin.write(JSON.stringify(req) + '\n');
        });
    }

    notify(method: string, params?: unknown): void {
        const note: JsonRpcNotification = { jsonrpc: '2.0', method, params };
        this.proc.stdin.write(JSON.stringify(note) + '\n');
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
            }, 2000);
            this.proc.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}

// The launcher uses `process.execve` on Unix (replacing the JS process with the
// underlying TSX-loaded MCP server). Some environments (older glibc, certain
// containers) reject execve; the test must not hang in that case.
async function launchClient(): Promise<StdioMcpClient | null> {
    const client = new StdioMcpClient();
    // Probe with `initialize` and a generous timeout. If the launcher failed
    // to boot, the request times out — we skip the tests.
    try {
        const initResp = await client.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'cstar-kernel-mcp-stdio-test', version: '1.0.0' },
        }, 8_000);
        if (initResp.error) {
            await client.close();
            return null;
        }
        client.notify('notifications/initialized');
        return client;
    } catch {
        await client.close();
        return null;
    }
}

describe('cstar-kernel-mcp stdio launcher', () => {
    let client: StdioMcpClient | null = null;

    after(async () => {
        if (client) {
            await client.close();
        }
    });

    it('boots, handshakes, and exposes a non-empty tools list including cstar_status', async () => {
        client = await launchClient();
        if (!client) {
            // Launcher unavailable in this environment — make the failure
            // visible without flailing the test runner.
            assert.fail('cstar-kernel-mcp launcher did not respond to initialize');
        }

        const listResp = await client.request('tools/list', {});
        assert.ok(listResp.result, `tools/list returned error: ${JSON.stringify(listResp.error)}`);
        assert.ok(Array.isArray(listResp.result.tools), 'tools/list result must contain a tools array');
        const tools = listResp.result.tools as Array<{ name: string }>;
        assert.ok(tools.length >= 15, `expected >= 15 registered tools, got ${tools.length}`);

        // Spot-check every tool added by Phase-1/2 and the second hardening pass.
        const names = new Set(tools.map((t) => t.name));
        for (const expected of [
            'cstar_handoff',
            'cstar_doctor',
            'cstar_status',
            'cstar_evolve',
            'cstar_spoke',
            'cstar_intent_route',
            'cstar_warden',
            'cstar_telemetry',
        ]) {
            assert.ok(names.has(expected), `tools/list missing ${expected}; got: ${[...names].sort().join(', ')}`);
        }
    });

    it('rounds-trips a tools/call for cstar_status returning a deterministic snapshot', async () => {
        if (!client) {
            assert.fail('client was not initialized by prior test');
        }
        const resp = await client.request('tools/call', {
            name: 'cstar_status',
            arguments: {},
        });
        assert.ok(resp.result, `tools/call returned error: ${JSON.stringify(resp.error)}`);
        const content = resp.result.content as Array<{ type: string; text: string }>;
        assert.ok(Array.isArray(content) && content.length > 0, 'response must contain content blocks');
        const body = JSON.parse(content[0].text);
        assert.ok(body.framework, 'cstar_status payload must include a framework block');
        assert.strictEqual(typeof body.hall_reachable, 'boolean');
        assert.strictEqual(typeof body.workspace, 'string');
    });

    it('rounds-trips a tools/call for cstar_telemetry returning summary blocks', async () => {
        if (!client) {
            assert.fail('client was not initialized by prior test');
        }
        const resp = await client.request('tools/call', {
            name: 'cstar_telemetry',
            arguments: { section: 'usage' },
        });
        assert.ok(resp.result, `tools/call returned error: ${JSON.stringify(resp.error)}`);
        const body = JSON.parse((resp.result.content[0] as { text: string }).text);
        assert.strictEqual(body.status, 'ok');
        assert.strictEqual(body.section, 'usage');
        assert.ok(body.usage);
    });
});
