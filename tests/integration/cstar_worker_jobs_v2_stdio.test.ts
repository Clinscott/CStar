import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(filename), '..', '..');
const launcher = path.join(projectRoot, 'bin', 'cstar-kernel-mcp.js');
const v2Tools = [
    'cstar_start_worker_job',
    'cstar_get_worker_job',
    'cstar_cancel_worker_job',
    'cstar_fetch_worker_artifact',
];

interface TestClient {
    client: Client;
    root: string;
    close: () => Promise<void>;
}

function cleanEnvironment(): Record<string, string> {
    const env = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] =>
            typeof entry[1] === 'string',
        ),
    );
    delete env.CSTAR_KERNEL_ENABLE_AUTOBOT;
    delete env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
    env.CSTAR_KERNEL_MCP = '1';
    env.CSTAR_KERNEL_DISABLE_WATCH = '1';
    return env;
}

async function launchWorkerClient(enableV2?: string): Promise<TestClient> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-worker-mcp-'));
    const env = cleanEnvironment();
    env.CSTAR_PROJECT_ROOT = root;
    if (enableV2 !== undefined) env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2 = enableV2;
    const transport = new StdioClientTransport({
        command: 'node',
        args: [launcher],
        cwd: projectRoot,
        env,
        stderr: 'pipe',
    });
    transport.stderr?.on('data', () => { /* keep bootstrap diagnostics off test output */ });
    const client = new Client({ name: 'cstar-worker-v2-integration', version: '1.0.0' });
    try {
        await client.connect(transport);
    } catch (error) {
        await transport.close();
        fs.rmSync(root, { recursive: true, force: true });
        throw error;
    }
    return {
        client,
        root,
        close: async () => {
            await client.close();
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}

function parseText(result: any): Record<string, any> {
    const text = result.content?.find((item: any) => item.type === 'text')?.text;
    assert.equal(typeof text, 'string');
    return JSON.parse(text);
}

describe('Worker Jobs v2 stdio MCP', () => {
    it('keeps the default runtime at 25 tools when the flag is unset', { timeout: 20_000 }, async () => {
        const testClient = await launchWorkerClient();
        try {
            const listed = await testClient.client.listTools();
            assert.equal(listed.tools.length, 25);
            assert.deepEqual(
                listed.tools.filter((tool) => v2Tools.includes(tool.name)),
                [],
            );
        } finally {
            await testClient.close();
        }
    });

    it('registers 29 tools only for exact opt-in and round-trips structured calls', { timeout: 30_000 }, async () => {
        const nonExact = await launchWorkerClient('true');
        try {
            assert.equal((await nonExact.client.listTools()).tools.length, 25);
        } finally {
            await nonExact.close();
        }

        const testClient = await launchWorkerClient('1');
        try {
            const listed = await testClient.client.listTools();
            assert.equal(listed.tools.length, 29);
            const workers = listed.tools.filter((tool) => v2Tools.includes(tool.name));
            assert.deepEqual(workers.map((tool) => tool.name), v2Tools);
            for (const tool of workers) {
                assert.equal(tool.inputSchema.type, 'object');
                assert.equal(tool.outputSchema?.type, 'object');
                assert.equal(tool.annotations?.idempotentHint, true);
            }

            const args = {
                worker_kind: 'researcher',
                objective: 'Investigate the worker-job bridge and prepare a concise report.',
                workspace_ref: 'cstar-main',
                expected_artifacts: [
                    { name: 'research.md', artifact_kind: 'report', required: true },
                ],
                idempotency_key: 'stdio-worker-request-0001',
            };
            const started = await testClient.client.callTool({
                name: 'cstar_start_worker_job',
                arguments: args,
            }) as any;
            assert.notEqual(started.isError, true);
            assert.equal(started.structuredContent.status, 'queued');
            assert.equal(started.structuredContent.execution_available, false);
            assert.equal(started.structuredContent.job.state, 'QUEUED');
            assert.deepEqual(parseText(started), started.structuredContent);
            const serialized = JSON.stringify(started);
            assert.equal(serialized.includes('"lease_token"'), false);
            assert.equal(serialized.includes('"storage_ref"'), false);

            const replay = await testClient.client.callTool({
                name: 'cstar_start_worker_job',
                arguments: args,
            }) as any;
            assert.equal(replay.structuredContent.status, 'existing');
            assert.equal(
                replay.structuredContent.job.job_id,
                started.structuredContent.job.job_id,
            );

            const cancelled = await testClient.client.callTool({
                name: 'cstar_cancel_worker_job',
                arguments: {
                    job_id: started.structuredContent.job.job_id,
                    expected_version: started.structuredContent.job.version,
                },
            }) as any;
            assert.notEqual(cancelled.isError, true);
            assert.equal(cancelled.structuredContent.status, 'cancelled');
            assert.equal(cancelled.structuredContent.job.state, 'CANCELLED');
            assert.deepEqual(parseText(cancelled), cancelled.structuredContent);

            const read = await testClient.client.callTool({
                name: 'cstar_get_worker_job',
                arguments: { job_id: started.structuredContent.job.job_id },
            }) as any;
            assert.equal(read.structuredContent.status, 'ok');
            assert.equal(read.structuredContent.job.state, 'CANCELLED');
            assert.deepEqual(parseText(read), read.structuredContent);
        } finally {
            await testClient.close();
        }
    });
});
