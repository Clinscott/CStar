/**
 * Integration test for `bin/cstar-kernel-mcp.js`.
 *
 * Spawns the launcher as a child process, completes the current SDK stdio
 * `initialize` handshake, then exercises `tools/list` and `tools/call`
 * (cstar_status) over JSON-RPC. This catches a class of regression invisible
 * to the unit tests: loader resolution, env propagation, schema validity at
 * registration time, and the actual stdio framing of the SDK.
 *
 * The handshake is transport compatibility, not CStar application state. Tool
 * handlers must keep cross-call state in explicit domain handles so the same
 * schemas can survive MCP's 2026-07-28 stateless protocol direction.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const LAUNCHER = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js');
const BRIDGE_LAUNCHER = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp-bridge.js');
const TCP_DAEMON = path.join(PROJECT_ROOT, 'scripts', 'cstar-mcp-tcp-daemon.js');

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

const PROTOCOL_STATE_ARG_NAMES = new Set([
    '_meta',
    'clientInfo',
    'client_info',
    'clientCapabilities',
    'client_capabilities',
    'mcpSessionId',
    'mcp_session_id',
    'Mcp-Session-Id',
    'protocolVersion',
    'protocol_version',
    'sessionId',
    'session_id',
]);

function collectSchemaPropertyNames(schema: unknown, seen = new Set<unknown>()): string[] {
    if (!schema || typeof schema !== 'object' || seen.has(schema)) {
        return [];
    }
    seen.add(schema);
    const record = schema as Record<string, unknown>;
    const ownProperties = record.properties && typeof record.properties === 'object'
        ? Object.keys(record.properties as Record<string, unknown>)
        : [];
    const nestedKeys = ['$defs', 'definitions', 'items', 'additionalProperties', 'oneOf', 'anyOf', 'allOf']
        .flatMap((key) => {
            const value = record[key];
            if (Array.isArray(value)) {
                return value.flatMap((entry) => collectSchemaPropertyNames(entry, seen));
            }
            return collectSchemaPropertyNames(value, seen);
        });
    return [...ownProperties, ...nestedKeys];
}

class StdioMcpClient {
    private buffer = '';
    private readonly pending = new Map<number, (resp: JsonRpcResponse) => void>();
    public readonly proc: ChildProcessWithoutNullStreams;
    private nextId = 1;

    constructor(extraEnv: Record<string, string> = {}, launcher: string = LAUNCHER) {
        this.proc = spawn('node', [launcher], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP: '1',
                NODE_OPTIONS: '--max-old-space-size=2048',
                ...extraEnv,
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

const validDispatchRequest = {
    bead_id: 'bead-mcp-stdio-smoke',
    owner_pmt_thread_id: 'thread-owner',
    source_callback_thread_id: 'thread-callback',
    objective: 'Verify the MCP request surface without live spend',
    prompt: 'Produce a no-spend receipt only',
    target_paths: ['src/tools/cstar-kernel-mcp.ts'],
    system_under_test: 'cstar-kernel MCP',
    scope: 'brain:CStar',
    authority_lane: 'yellow',
    required_metrics: [{ name: 'artifact_integrity', threshold: 'schema valid' }],
    artifact_expectations: ['receipt'],
    prohibited_actions: ['live model spend', 'source collection', 'repo mutation'],
    requested_actions: ['dry-run request receipt'],
    spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
    retry_policy: { budget: 0, spent: 0 },
    callback_contract: { expected_packet: 'MCP_STDIO_SMOKE_PACKET', callback_required: true },
};

function parseToolBody(resp: JsonRpcResponse): any {
    if (resp.error) {
        return { jsonrpc_error: resp.error.message };
    }
    const content = resp.result?.content as Array<{ text: string }> | undefined;
    assert.ok(content?.[0]?.text, `tool response must include text content: ${JSON.stringify(resp)}`);
    try {
        return JSON.parse(content[0].text);
    } catch {
        return { raw_text: content[0].text };
    }
}

// The launcher uses `process.execve` on Unix (replacing the JS process with the
// underlying TSX-loaded MCP server). Some environments (older glibc, certain
// containers) reject execve; the test must not hang in that case.
async function launchClient(extraEnv: Record<string, string> = {}, launcher: string = LAUNCHER): Promise<StdioMcpClient | null> {
    const client = new StdioMcpClient(extraEnv, launcher);
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

    it('boots, handshakes, and exposes the documented tool inventory exactly', async () => {
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
        const actualNames = tools.map((t) => t.name).sort();
        const duplicateNames = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
        const expectedNames = [
            'cstar_augury',
            'cstar_autobot',
            'cstar_bead',
            'cstar_doctor',
            'cstar_engram_record',
            'cstar_evolve',
            'cstar_forge_execute',
            'cstar_forge_request',
            'cstar_hall_maintenance',
            'cstar_hall_search',
            'cstar_handoff',
            'cstar_intent_route',
            'cstar_manifest',
            'cstar_mongo_mailbox',
            'cstar_pennyone_context',
            'cstar_record_result',
            'cstar_researcher_request',
            'cstar_skill_info',
            'cstar_spoke',
            'cstar_spoke_bead_import',
            'cstar_spoke_journal',
            'cstar_status',
            'cstar_telemetry',
            'cstar_verify_plan',
            'cstar_war_game_score',
            'cstar_warden',
        ].sort();

        assert.deepStrictEqual(duplicateNames, [], `tools/list must not expose duplicate tool names: ${duplicateNames.join(', ')}`);
        assert.deepStrictEqual(
            actualNames,
            expectedNames,
            `tools/list drifted from the documented inventory; got: ${actualNames.join(', ')}`,
        );
        assert.ok(actualNames.includes('cstar_autobot'), 'cstar_autobot must be registered for host agents by default');
    });

    it('keeps tool schemas independent of protocol session state for stateless MCP readiness', async () => {
        if (!client) {
            assert.fail('client was not initialized by prior test');
        }

        const listResp = await client.request('tools/list', {});
        assert.ok(listResp.result, `tools/list returned error: ${JSON.stringify(listResp.error)}`);
        const tools = listResp.result.tools as Array<{
            name: string;
            inputSchema?: { type?: string; required?: unknown; properties?: Record<string, unknown> };
        }>;

        for (const tool of tools) {
            assert.ok(tool.inputSchema, `${tool.name} must expose an inputSchema`);
            assert.strictEqual(tool.inputSchema.type, 'object', `${tool.name} inputSchema must have an object root`);

            const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [];
            const propertyNames = collectSchemaPropertyNames(tool.inputSchema);
            const forbiddenRequired = required.filter((name): name is string =>
                typeof name === 'string' && PROTOCOL_STATE_ARG_NAMES.has(name),
            );
            const forbiddenProperties = propertyNames.filter((name) => PROTOCOL_STATE_ARG_NAMES.has(name));

            assert.deepStrictEqual(forbiddenRequired, [], `${tool.name} must not require protocol/session state args`);
            assert.deepStrictEqual(forbiddenProperties, [], `${tool.name} must not model protocol/session state as tool args`);
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

    it('smoke-calls every non-legacy public tool with safe success or fail-closed inputs', async () => {
        if (!client) {
            assert.fail('client was not initialized by prior test');
        }

        const forgeExecuteRequest = {
            ...validDispatchRequest,
            decision_id: 'decision-mcp-stdio-smoke',
            forge_request_receipt_id: 'dispatch-forge-decision-mcp-stdio-smoke-receipt',
            forge_request_decision_id: 'decision-mcp-stdio-smoke',
            forge_request_bead_id: 'bead-mcp-stdio-smoke',
            execution_mode: 'no_op',
        };
        const cases: Array<{ name: string; args: Record<string, unknown>; expectError?: boolean }> = [
            { name: 'cstar_hall_maintenance', args: { action: 'harvest', limit: 1 } },
            { name: 'cstar_handoff', args: {} },
            { name: 'cstar_hall_search', args: { query: 'mcp smoke', limit: 1 } },
            { name: 'cstar_augury', args: { prompt: 'Audit CStar MCP smoke contracts', target_paths: ['src/tools/cstar-kernel-mcp.ts'] } },
            { name: 'cstar_doctor', args: {} },
            { name: 'cstar_verify_plan', args: {} },
            { name: 'cstar_bead', args: { action: 'list', limit: 1 } },
            { name: 'cstar_spoke_bead_import', args: { spoke: 'missing-spoke', intent: 'smoke', acceptance_criteria: 'fail closed', lore_path: 'missing.feature' }, expectError: true },
            { name: 'cstar_record_result', args: {}, expectError: true },
            { name: 'cstar_engram_record', args: {}, expectError: true },
            { name: 'cstar_war_game_score', args: { action: 'list_contests' } },
            { name: 'cstar_manifest', args: { scope: 'hub' } },
            { name: 'cstar_skill_info', args: { id: 'bookmark-weaver' } },
            { name: 'cstar_spoke_journal', args: { spoke: 'missing-spoke' } },
            { name: 'cstar_pennyone_context', args: { action: 'status' } },
            { name: 'cstar_mongo_mailbox', args: { action: 'status' } },
            { name: 'cstar_status', args: {} },
            { name: 'cstar_evolve', args: { action: 'list_proposals', limit: 1 } },
            { name: 'cstar_spoke', args: { action: 'list' } },
            { name: 'cstar_intent_route', args: { prompt: 'build audit harness', action: 'match' } },
            { name: 'cstar_warden', args: { action: 'list' } },
            { name: 'cstar_telemetry', args: { section: 'usage' } },
            { name: 'cstar_researcher_request', args: validDispatchRequest },
            { name: 'cstar_forge_request', args: validDispatchRequest },
            { name: 'cstar_forge_execute', args: forgeExecuteRequest },
        ];

        for (const testCase of cases) {
            const resp = await client.request('tools/call', {
                name: testCase.name,
                arguments: testCase.args,
            }, 12_000);
            const body = parseToolBody(resp);
            if (testCase.expectError) {
                assert.ok(resp.error || resp.result?.isError || body.error || body.jsonrpc_error, `${testCase.name} must fail closed`);
            } else {
                assert.ok(resp.result, `${testCase.name} returned JSON-RPC error: ${JSON.stringify(resp.error)}`);
                assert.notStrictEqual(resp.result.isError, true, `${testCase.name} should not be an MCP error: ${JSON.stringify(body)}`);
            }
        }
    });

    it('can explicitly disable cstar_autobot with CSTAR_KERNEL_ENABLE_AUTOBOT=0', async () => {
        const testClient = await launchClient({ CSTAR_KERNEL_ENABLE_AUTOBOT: '0' });
        if (!testClient) {
            assert.fail('cstar-kernel-mcp launcher did not respond to initialize');
        }
        try {
            const listResp = await testClient.request('tools/list', {});
            assert.ok(listResp.result);
            const tools = listResp.result.tools as Array<{ name: string }>;
            const names = tools.map((t) => t.name);
            assert.ok(!names.includes('cstar_autobot'), 'cstar_autobot must not be registered when explicitly disabled');
        } finally {
            await testClient.close();
        }
    });

    it('does not register cstar_autobot when HERMES_AUTOBOT_DELEGATED=1 is set', async () => {
        const testClient = await launchClient({
            HERMES_AUTOBOT_DELEGATED: '1',
        });
        if (!testClient) {
            assert.fail('cstar-kernel-mcp launcher did not respond to initialize');
        }
        try {
            const listResp = await testClient.request('tools/list', {});
            assert.ok(listResp.result);
            const tools = listResp.result.tools as Array<{ name: string }>;
            const names = tools.map((t) => t.name);
            assert.ok(!names.includes('cstar_autobot'), 'cstar_autobot must not be registered when HERMES_AUTOBOT_DELEGATED=1');
        } finally {
            await testClient.close();
        }
    });

    it('bridges through a TCP daemon and exposes tools/list', async () => {
        const port = String(18_731 + (process.pid % 1000));
        const daemon = spawn('node', [TCP_DAEMON], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
                CSTAR_KERNEL_MCP_TCP_PORT: port,
                CSTAR_KERNEL_DISABLE_WATCH: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        daemon.stdout.setEncoding('utf-8');
        daemon.stderr.setEncoding('utf-8');
        const startup = Promise.race([
            once(daemon.stdout, 'data'),
            once(daemon, 'exit').then(([code]) => {
                throw new Error(`TCP daemon exited before startup with code ${code}`);
            }),
        ]);
        await startup;

        const testClient = await launchClient({
            CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
            CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
            CSTAR_KERNEL_MCP_TCP_PORT: port,
            CSTAR_KERNEL_DISABLE_WATCH: '1',
        }, BRIDGE_LAUNCHER);
        if (!testClient) {
            daemon.kill('SIGTERM');
            assert.fail('cstar-kernel-mcp bridge did not respond to initialize through TCP daemon');
        }
        try {
            const listResp = await testClient.request('tools/list', {});
            assert.ok(listResp.result, `bridge tools/list returned error: ${JSON.stringify(listResp.error)}`);
            const tools = listResp.result.tools as Array<{ name: string }>;
            assert.ok(tools.some((tool) => tool.name === 'cstar_bead'), 'bridge must expose cstar_bead through TCP daemon');
        } finally {
            await testClient.close();
            daemon.kill('SIGTERM');
        }
    });
});
