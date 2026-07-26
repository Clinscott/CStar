import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
    isWorkerJobsV2Enabled,
    startWorkerJobInputSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';
import {
    CSTAR_KERNEL_ALL_TOOL_CLASSES,
    CSTAR_WORKER_JOB_V2_TOOL_CLASSES,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import { registerWorkerJobTools } from '../../../src/tools/cstar-kernel-mcp/register_worker_job_tools.js';

interface CapturedTool {
    name: string;
    config: Record<string, any>;
    callback: (...args: any[]) => Promise<any>;
}

function captureTools(env: NodeJS.ProcessEnv): CapturedTool[] {
    const tools: CapturedTool[] = [];
    const server = {
        registerTool(name: string, config: Record<string, any>, callback: (...args: any[]) => Promise<any>) {
            tools.push({ name, config, callback });
            return {};
        },
    };
    const instrument = (_name: string, handler: (args: any) => Promise<any>) => handler;
    registerWorkerJobTools(server as any, instrument, env);
    return tools;
}

function propertyNames(value: unknown, names = new Set<string>()): Set<string> {
    if (!value || typeof value !== 'object') return names;
    const record = value as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === 'object') {
        for (const key of Object.keys(properties)) names.add(key);
    }
    for (const child of Object.values(record)) {
        if (Array.isArray(child)) child.forEach((item) => propertyNames(item, names));
        else propertyNames(child, names);
    }
    return names;
}

describe('Worker Jobs v2 MCP registration', () => {
    it('requires the exact opt-in and registers only the four proposed tools', () => {
        assert.equal(isWorkerJobsV2Enabled({}), false);
        assert.equal(isWorkerJobsV2Enabled({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: 'true' }), false);
        assert.equal(captureTools({}).length, 0);
        assert.equal(captureTools({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: 'true' }).length, 0);

        const tools = captureTools({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: '1' });
        assert.deepEqual(tools.map((tool) => tool.name), [
            'cstar_start_worker_job',
            'cstar_get_worker_job',
            'cstar_cancel_worker_job',
            'cstar_fetch_worker_artifact',
        ]);
        assert.equal(Object.keys(CSTAR_WORKER_JOB_V2_TOOL_CLASSES).length, 4);
        assert.equal(CSTAR_WORKER_JOB_V2_TOOL_CLASSES.cstar_start_worker_job, 'MUTATION');
        assert.equal(CSTAR_WORKER_JOB_V2_TOOL_CLASSES.cstar_get_worker_job, 'READ');
        assert.equal(CSTAR_WORKER_JOB_V2_TOOL_CLASSES.cstar_cancel_worker_job, 'MUTATION');
        assert.equal(CSTAR_WORKER_JOB_V2_TOOL_CLASSES.cstar_fetch_worker_artifact, 'READ');
        assert.equal(Object.keys(CSTAR_KERNEL_ALL_TOOL_CLASSES).length, 30);
    });

    it('binds handler feature checks to the same environment used for registration', async () => {
        const previous = process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
        try {
            delete process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
            const [start] = captureTools({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: '1' });
            assert.ok(start);
            const result = await start.callback({
                worker_kind: 'forge',
                objective: '',
                workspace_ref: 'cstar-main',
                expected_artifacts: [
                    { name: 'report.md', artifact_kind: 'report', required: true },
                ],
                idempotency_key: 'registration-env-0001',
            });
            assert.equal(result.isError, true);
            const payload = JSON.parse(result.content[0].text);
            assert.equal(payload.error.code, 'OBJECTIVE_INVALID');
            assert.notEqual(payload.error.code, 'FEATURE_DISABLED');
        } finally {
            if (previous === undefined) delete process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2;
            else process.env.CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2 = previous;
        }
    });

    it('publishes input/output schemas, structured-effect annotations, and no execution controls', () => {
        const tools = captureTools({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: '1' });
        for (const tool of tools) {
            assert.ok(tool.config.inputSchema);
            assert.ok(tool.config.outputSchema);
            assert.equal(tool.config.annotations.idempotentHint, true);
            assert.equal(tool.config.annotations.openWorldHint, false);
        }
        assert.deepEqual(tools[0]?.config.annotations, {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        });
        assert.equal(tools[1]?.config.annotations.readOnlyHint, true);
        assert.equal(tools[2]?.config.annotations.destructiveHint, true);
        assert.equal(tools[3]?.config.annotations.readOnlyHint, true);

        const schemaJson = z.toJSONSchema(startWorkerJobInputSchema);
        const names = propertyNames(schemaJson);
        for (const forbidden of [
            'provider',
            'model',
            'profile',
            'oauth',
            'credential',
            'command',
            'host_path',
            'project_root',
            'lease_token',
            'storage_ref',
        ]) {
            assert.equal(names.has(forbidden), false);
        }
    });

    it('accepts natural objectives while rejecting path-like logical workspace references', () => {
        const base = {
            worker_kind: 'researcher',
            objective: 'Please investigate the likely cause, then summarize it for me.',
            workspace_ref: 'cstar-main',
            expected_artifacts: [
                { name: 'research.md', artifact_kind: 'report' },
            ],
            idempotency_key: 'research-request-0001',
        };
        assert.equal(startWorkerJobInputSchema.safeParse(base).success, true);
        assert.equal(startWorkerJobInputSchema.safeParse({
            ...base,
            workspace_ref: 'project/source',
        }).success, false);
        assert.equal(startWorkerJobInputSchema.safeParse({
            ...base,
            workspace_ref: 'cstar..secrets',
        }).success, false);
        assert.equal(startWorkerJobInputSchema.safeParse({
            ...base,
            provider: 'caller-controlled',
        }).success, false);
        assert.equal(startWorkerJobInputSchema.safeParse({
            ...base,
            expected_artifacts: [
                { name: 'research.md', artifact_kind: 'report' },
                { name: 'research.md', artifact_kind: 'report' },
            ],
        }).success, false);
    });
});
