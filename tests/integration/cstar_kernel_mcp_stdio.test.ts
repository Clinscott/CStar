/** Stdio integration coverage for launcher, catalog, schema, and tool calls. */
import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES }
    from '../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { ensureHallSchema } from '../../src/tools/pennyone/intel/schema.js';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const LAUNCHER = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js');
const NATIVE_TEMP_ROOT = process.platform === 'linux' ? '/tmp' : os.tmpdir();
const CONTROL_ROOT = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-stdio-control-'));
fs.chmodSync(CONTROL_ROOT, 0o700);
const CONTROL_STATS = path.join(CONTROL_ROOT, '.stats');
fs.mkdirSync(CONTROL_STATS, { mode: 0o700 });
const CONTROL_HALL = path.join(CONTROL_STATS, 'pennyone.db');
const CONTROL_DB = new Database(CONTROL_HALL);
ensureHallSchema(CONTROL_DB, CONTROL_ROOT);
CONTROL_DB.close();
fs.chmodSync(CONTROL_HALL, 0o600);

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
    '_meta', 'clientInfo', 'client_info', 'clientCapabilities', 'client_capabilities',
    'mcpSessionId', 'mcp_session_id', 'Mcp-Session-Id', 'protocolVersion',
    'protocol_version', 'sessionId', 'session_id',
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
    public stderr = '';
    public forcedTermination = false;
    private nextId = 1;

    constructor(extraEnv: Record<string, string> = {}, launcher: string = LAUNCHER) {
        this.proc = spawn('node', [launcher], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_CONTROL_ROOT: CONTROL_ROOT,
                NODE_OPTIONS: '--max-old-space-size=2048',
                ...extraEnv,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.proc.stdout.setEncoding('utf-8');
        this.proc.stdout.on('data', (chunk: string) => this.absorb(chunk));
        this.proc.stderr.setEncoding('utf-8');
        this.proc.stderr.on('data', (chunk: string) => { this.stderr += chunk; });
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
                this.forcedTermination = true;
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
    decision_id: 'decision-mcp-stdio-smoke',
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
    prohibited_actions: ['authorized_source_collection', 'project_files', 'expanded_spend'],
    requested_actions: ['request_receipt'],
    spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
    retry_policy: { budget: 0, spent: 0 },
    callback_contract: { expected_packet: 'MCP_STDIO_SMOKE_PACKET', callback_required: true },
};

const validAuguryBoundary = {
    schema: 'cstar.augury_mission_boundary.v1',
    repository: { schema: 'cstar.repository_root_identity.v1',
        repository_id: 'repo:cstar:stdio', root_path: PROJECT_ROOT },
    mission_decision_id: 'decision:cstar:stdio',
    proposed_parent_bead_id: 'bead:cstar:stdio-parent',
    design: { revision: 1, sha256: 'c'.repeat(64) },
    scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
    contained_target_paths: ['src/tools/cstar-kernel-mcp.ts'],
    bead_plan: [{
        bead_id: 'bead:cstar:stdio-child', dependencies: [], lane: 'forge',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
        acceptance_obligations: ['Strict runtime boundary accepted.'], checker_obligations: ['npm run typecheck'],
    }],
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

async function launchClient(extraEnv: Record<string, string> = {}, launcher: string = LAUNCHER): Promise<StdioMcpClient | null> {
    const client = new StdioMcpClient(extraEnv, launcher);
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
        lastLaunchStderr = client.stderr;
        await client.close();
        return null;
    }
}

let lastLaunchStderr = '';

describe('cstar-kernel-mcp stdio launcher', () => {
    let client: StdioMcpClient | null = null;

    after(async () => {
        if (client) {
            await client.close();
        }
        fs.rmSync(CONTROL_ROOT, { recursive: true, force: true });
    });

    it('boots, handshakes, and exposes the documented tool inventory exactly', async () => {
        client = await launchClient();
        if (!client) {
            assert.fail(`cstar-kernel-mcp launcher did not respond to initialize: ${lastLaunchStderr}`);
        }

        const listResp = await client.request('tools/list', {});
        assert.ok(listResp.result, `tools/list returned error: ${JSON.stringify(listResp.error)}`);
        assert.ok(Array.isArray(listResp.result.tools), 'tools/list result must contain a tools array');
        const tools = listResp.result.tools as Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
        }>;
        const actualNames = tools.map((t) => t.name).sort();
        const duplicateNames = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
        const expectedNames = [...CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES].sort();

        assert.deepStrictEqual(duplicateNames, [], `tools/list must not expose duplicate tool names: ${duplicateNames.join(', ')}`);
        assert.deepStrictEqual(
            actualNames,
            expectedNames,
            `tools/list drifted from the documented inventory; got: ${actualNames.join(', ')}`,
        );
        assert.ok(!actualNames.includes('cstar_autobot'), 'decommissioned cstar_autobot must stay absent');
        assert.strictEqual(actualNames.length, 15);
        const augury = tools.find((tool) => tool.name === 'cstar_augury');
        assert.match(augury?.description ?? '', /^MUTATION: .*omission of mission_boundary is read-only/i);
        const auguryProperties = augury?.inputSchema?.properties as
            Record<string, unknown> | undefined;
        assert.ok(auguryProperties?.mission_boundary);
        const missionSchemaJson = JSON.stringify(auguryProperties.mission_boundary);
        assert.ok(Buffer.byteLength(missionSchemaJson, 'utf8') < 4_096, missionSchemaJson);
        for (const required of ['schema', 'version', 'repository', 'bead_plan', 'replay']) {
            assert.match(missionSchemaJson, new RegExp(`"${required}"`));
        }
        assert.match(missionSchemaJson, /cstar\.augury_mission_boundary\.v1/);
        assert.match(missionSchemaJson, /cstar\.augury_mission_boundary\.v2/);
        assert.doesNotMatch(missionSchemaJson, /forge_child_request_template/);
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
        assert.strictEqual(body.workspace, CONTROL_ROOT);
        assert.strictEqual(body.runtime_lineage?.binding_mode, 'live_launcher');
        assert.strictEqual(body.runtime_lineage?.code_root, PROJECT_ROOT);
        assert.strictEqual(body.runtime_lineage?.control_root, CONTROL_ROOT);
        assert.strictEqual(body.runtime_lineage?.separated, true);
        for (const field of [
            'code_root_sha256',
            'control_root_sha256',
            'launcher_sha256',
            'kernel_entry_sha256',
            'package_lock_sha256',
            'binding_sha256',
        ]) {
            assert.match(body.runtime_lineage?.[field] ?? '', /^[a-f0-9]{64}$/, field);
        }
        assert.strictEqual(body.readiness?.kernel_root_binding, true);
        assert.strictEqual(
            body.readiness?.forge,
            body.readiness?.kernel_root_binding
                && body.readiness?.dependency_lineage
                && body.readiness?.forge_runtime_manifest,
        );

        const forgeStatusResp = await client.request('tools/call', {
            name: 'cstar_status',
            arguments: { forge_execution_receipt_id: `forge-execute-${'0'.repeat(32)}` },
        });
        const forgeStatus = parseToolBody(forgeStatusResp);
        assert.deepStrictEqual(forgeStatus.forge_execution, {
            found: false,
            execution_receipt_id: `forge-execute-${'0'.repeat(32)}`,
        });
    });

    it('keeps advisory omission read-only and strictly reparses compact Augury input', async () => {
        if (!client) {
            assert.fail('client was not initialized by prior test');
        }
        const beforeDb = new Database(CONTROL_HALL, { readonly: true });
        const before = Number(beforeDb.prepare(
            "SELECT COUNT(*) FROM hall_beads WHERE source_kind = 'augury_mission_receipt'").pluck().get());
        beforeDb.close();
        const resp = await client.request('tools/call', {
            name: 'cstar_augury',
            arguments: {
                prompt: 'Explain the bounded CStar status route',
                target_paths: ['src/tools/cstar-kernel-mcp.ts'],
            },
        });
        assert.ok(resp.result, `tools/call returned error: ${JSON.stringify(resp.error)}`);
        const body = JSON.parse((resp.result.content[0] as { text: string }).text);
        assert.ok(body.current_mission_route || body.intent_category);
        assert.strictEqual(body.mission_boundary_receipt, undefined);
        assert.strictEqual(body.mutation, undefined);
        const afterDb = new Database(CONTROL_HALL, { readonly: true });
        const afterCount = Number(afterDb.prepare(
            "SELECT COUNT(*) FROM hall_beads WHERE source_kind = 'augury_mission_receipt'").pluck().get());
        afterDb.close();
        assert.strictEqual(afterCount, before);

        const invalidResp = await client.request('tools/call', {
            name: 'cstar_augury',
            arguments: {
                prompt: 'Reject nested transport-invalid mission input',
                mission_boundary: {
                    ...validAuguryBoundary,
                    repository: { ...validAuguryBoundary.repository, unknown: true },
                },
            },
        });
        const invalidBody = parseToolBody(invalidResp);
        assert.strictEqual(invalidResp.result?.isError, true);
        assert.strictEqual(invalidBody.error_code, 'augury_mission_boundary_incomplete');

        const acceptedResp = await client.request('tools/call', {
            name: 'cstar_augury',
            arguments: { prompt: 'Accept strict mission shape', mission_boundary: validAuguryBoundary },
        });
        const acceptedBody = parseToolBody(acceptedResp);
        assert.strictEqual(acceptedBody.error_code, 'augury_mission_request_identity_invalid');
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
            { name: 'cstar_handoff', args: {} },
            { name: 'cstar_hall_search', args: { query: 'mcp smoke', limit: 1 } },
            { name: 'cstar_augury', args: { prompt: 'Audit CStar MCP smoke contracts', target_paths: ['src/tools/cstar-kernel-mcp.ts'] } },
            { name: 'cstar_doctor', args: {} },
            { name: 'cstar_verify_plan', args: {} },
            { name: 'cstar_bead', args: { action: 'list', limit: 1 } },
            { name: 'cstar_goal_resume', args: {}, expectError: true },
            { name: 'cstar_record_result', args: {}, expectError: true },
            { name: 'cstar_manifest', args: { scope: 'hub' } },
            { name: 'cstar_skill_info', args: { id: 'bookmark-weaver' } },
            { name: 'cstar_status', args: {} },
            { name: 'cstar_persona_set', args: { persona: 'O.D.I.N.' }, expectError: true },
            { name: 'cstar_researcher_request', args: validDispatchRequest },
            { name: 'cstar_forge_request', args: validDispatchRequest, expectError: true },
            { name: 'cstar_forge_execute', args: forgeExecuteRequest, expectError: true },
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

    it('keeps cstar_autobot absent when the legacy disable flag is present', async () => {
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

    it('keeps cstar_autobot absent when the legacy delegated flag is present', async () => {
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

    it('terminates the launcher tree when the client closes its stdio pipe', async () => {
        const testClient = await launchClient();
        if (!testClient) {
            assert.fail('cstar-kernel-mcp launcher did not respond to initialize');
        }
        await testClient.close();
        assert.strictEqual(
            testClient.forcedTermination,
            false,
            `launcher required forced termination after stdin closed: ${testClient.stderr}`,
        );
    });

});
