import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    cancelWorkerJobInputSchema,
    cancelWorkerJobOutputSchema,
    fetchWorkerArtifactInputSchema,
    fetchWorkerArtifactOutputSchema,
    getWorkerJobInputSchema,
    getWorkerJobOutputSchema,
    isWorkerJobsV2Enabled,
    startWorkerJobInputSchema,
    startWorkerJobOutputSchema,
} from './contracts/worker_jobs.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import {
    handleCancelWorkerJob,
    handleFetchWorkerArtifact,
    handleGetWorkerJob,
    handleStartWorkerJob,
} from './tools/worker_jobs.js';

type InstrumentTool = (
    name: string,
    handler: (args: any) => Promise<any>,
) => (args: any, extra?: unknown) => Promise<any>;

export function registerWorkerJobTools(
    server: Pick<McpServer, 'registerTool'>,
    instrumentTool: InstrumentTool,
    env: NodeJS.ProcessEnv = process.env,
): void {
    if (!isWorkerJobsV2Enabled(env)) return;

    server.registerTool(
        'cstar_start_worker_job',
        {
            title: 'Queue CStar Worker Job',
            description: mcpToolDescription(
                'MUTATION',
                'Queue an inert Forge or Researcher work order. This does not execute a worker, select a model or provider, or accept credentials, commands, profiles, or host paths.',
            ),
            inputSchema: startWorkerJobInputSchema,
            outputSchema: startWorkerJobOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        instrumentTool(
            'cstar_start_worker_job',
            (args) => handleStartWorkerJob(args, env),
        ),
    );

    server.registerTool(
        'cstar_get_worker_job',
        {
            title: 'Get CStar Worker Job',
            description: mcpToolDescription(
                'READ',
                'Read durable state, progress, and artifact metadata for one CStar worker job.',
            ),
            inputSchema: getWorkerJobInputSchema,
            outputSchema: getWorkerJobOutputSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        instrumentTool(
            'cstar_get_worker_job',
            (args) => handleGetWorkerJob(args, env),
        ),
    );

    server.registerTool(
        'cstar_cancel_worker_job',
        {
            title: 'Cancel CStar Worker Job',
            description: mcpToolDescription(
                'MUTATION',
                'Cancel a queued worker job or durably request cancellation of a leased or running job.',
            ),
            inputSchema: cancelWorkerJobInputSchema,
            outputSchema: cancelWorkerJobOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        instrumentTool(
            'cstar_cancel_worker_job',
            (args) => handleCancelWorkerJob(args, env),
        ),
    );

    server.registerTool(
        'cstar_fetch_worker_artifact',
        {
            title: 'Fetch CStar Worker Artifact',
            description: mcpToolDescription(
                'READ',
                'Fetch one ready, bounded inline artifact. Private storage handles are never returned.',
            ),
            inputSchema: fetchWorkerArtifactInputSchema,
            outputSchema: fetchWorkerArtifactOutputSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        instrumentTool(
            'cstar_fetch_worker_artifact',
            (args) => handleFetchWorkerArtifact(args, env),
        ),
    );
}
