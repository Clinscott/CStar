import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execa } from 'execa';
import { HUD } from '../node/core/hud.js';
import chalk from 'chalk';
import { requestHostText, type HostTextResult } from '../core/host_intelligence.js';
import { resolveHostProvider, type HostProvider } from '../core/host_session.js';

export interface ControlPlaneActionPlan {
    mode: 'execute_now' | 'observe_only';
    command_or_workflow: string;
    args: string[];
    rationale?: string;
}

export interface ControlPlaneDependencies {
    hostTextInvoker?: (request: {
        prompt: string;
        systemPrompt?: string;
        projectRoot: string;
        source: string;
        env?: NodeJS.ProcessEnv;
        provider?: HostProvider | null;
    }) => Promise<HostTextResult>;
    commandRunner?: typeof execa;
}

function buildControlPlanePrompt(input: {
    kind: 'command' | 'workflow';
    name: string;
    args: string[];
    provider: HostProvider;
}): string {
    return [
        'You are supervising Corvus Control MCP routing.',
        'Normalize the requested command or workflow before local execution.',
        'Only choose observe_only if the request should not execute yet and should remain informational.',
        'Return strict JSON only.',
        JSON.stringify({
            kind: input.kind,
            provider: input.provider,
            requested_name: input.name,
            requested_args: input.args,
            response_schema: {
                mode: 'execute_now | observe_only',
                command_or_workflow: 'string',
                args: ['string'],
                rationale: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function normalizeActionPlan(raw: string, fallbackName: string, fallbackArgs: string[]): ControlPlaneActionPlan | null {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        return null;
    }

    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const mode = parsed.mode === 'execute_now' || parsed.mode === 'observe_only'
        ? parsed.mode
        : null;
    const commandOrWorkflow = typeof parsed.command_or_workflow === 'string' && parsed.command_or_workflow.trim()
        ? parsed.command_or_workflow.trim()
        : fallbackName;
    const args = Array.isArray(parsed.args)
        ? parsed.args.filter((entry): entry is string => typeof entry === 'string')
        : fallbackArgs;

    if (!mode) {
        return null;
    }

    return {
        mode,
        command_or_workflow: commandOrWorkflow,
        args,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : undefined,
    };
}

export async function resolveControlPlaneAction(
    input: {
        kind: 'command' | 'workflow';
        name: string;
        args: string[];
        env?: NodeJS.ProcessEnv;
    },
    dependencies: ControlPlaneDependencies = {},
): Promise<{ plan: ControlPlaneActionPlan; provider: HostProvider | null; delegated: boolean }> {
    const env = input.env ?? process.env;
    const provider = resolveHostProvider(env);
    const fallbackPlan: ControlPlaneActionPlan = {
        mode: 'execute_now',
        command_or_workflow: input.name,
        args: input.args,
    };

    if (!provider) {
        return {
            plan: fallbackPlan,
            provider: null,
            delegated: false,
        };
    }

    const hostTextInvoker = dependencies.hostTextInvoker ?? requestHostText;
    try {
        const result = await hostTextInvoker({
            prompt: buildControlPlanePrompt({
                kind: input.kind,
                name: input.name,
                args: input.args,
                provider,
            }),
            systemPrompt: 'Return strict JSON only.',
            projectRoot: PROJECT_ROOT,
            source: `mcp:corvus-control:${input.kind}`,
            env,
            provider,
        });
        const plan = normalizeActionPlan(result.text, input.name, input.args) ?? fallbackPlan;
        return {
            plan,
            provider,
            delegated: true,
        };
    } catch {
        return {
            plan: fallbackPlan,
            provider,
            delegated: false,
        };
    }
}

async function logTrace(missionId: string, metric: string, status: string, justification: string) {
    try {
        await fetch('http://localhost:4000/api/telemetry/trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mission_id: missionId,
                file_path: 'MCP_BRIDGE',
                target_metric: metric,
                initial_score: 0.0,
                final_score: status === 'SUCCESS' ? 1.0 : 0.0,
                justification,
                status,
                timestamp: Date.now(),
            }),
            signal: AbortSignal.timeout(500),
        });
    } catch {
        // Fail silently
    }
}

export function createCorvusControlServer(dependencies: ControlPlaneDependencies = {}): McpServer {
    const server = new McpServer({
        name: 'corvus-control',
        version: '2.0.0',
    });
    const commandRunner = dependencies.commandRunner ?? execa;

    server.tool(
        'artifact_forge',
        'Forge code from a canonical bead-backed request.',
        {
            beadId: z.string().describe('Canonical bead id to forge from'),
            persona: z.string().optional().describe('Optional persona override (default: ODIN)'),
            model: z.string().optional().describe('Optional model override'),
        },
        async ({ beadId, persona, model }) => {
            const missionId = `FORGE-${Date.now()}`;
            await logTrace(missionId, 'CREATION', 'STARTED', `Forging artifact from bead: ${beadId}`);

            try {
                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                // The root cstar.ts handles 'forge' command by dispatching to weave:artifact-forge
                const args = ['run-skill', 'weave:artifact-forge', '--payload', JSON.stringify({
                    bead_id: beadId,
                    persona: persona || 'ODIN',
                    model: model
                })];

                const { stdout, stderr } = await commandRunner('node', [cstarPath, ...args]);
                await logTrace(missionId, 'CREATION', 'SUCCESS', `Artifact forged for bead: ${beadId}`);
                return {
                    content: [{ type: 'text', text: stdout || stderr }],
                };
            } catch (error: any) {
                await logTrace(missionId, 'CREATION', 'ERROR', `Artifact forge failed: ${error.message}`);
                return {
                    content: [{ type: 'text', text: `Artifact forge failed: ${error.message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'taliesin_forge',
        'Materialize a manuscript chapter (storytelling) using the Autonomic Narrative Engine.',
        {
            scenario: z.string().describe('Opening scenario overview'),
            details: z.string().describe('Narrative details to hit'),
            conclusion: z.string().describe('Required conclusion'),
            chars: z.array(z.string()).describe('List of characters involved'),
        },
        async ({ scenario, details, conclusion, chars }) => {
            const missionId = `STORY-${Date.now()}`;
            await logTrace(missionId, 'NARRATIVE', 'STARTED', `Forging story scene: ${scenario.slice(0, 30)}`);

            try {
                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                const args = ['run-skill', 'weave:taliesin-forge', '--payload', JSON.stringify({
                    scenario,
                    details,
                    conclusion,
                    chars
                })];

                const { stdout, stderr } = await commandRunner('node', [cstarPath, ...args]);
                await logTrace(missionId, 'NARRATIVE', 'SUCCESS', `Story scene forged successfully.`);
                return {
                    content: [{ type: 'text', text: stdout || stderr }],
                };
            } catch (error: any) {
                await logTrace(missionId, 'NARRATIVE', 'ERROR', `Story forge failed: ${error.message}`);
                return {
                    content: [{ type: 'text', text: `Story forge failed: ${error.message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'execute_cstar_command',
        'Execute a core Corvus Star (cstar) command (start, dominion, odin, ravens).',
        {
            command: z.enum(['start', 'dominion', 'odin', 'ravens']).describe('The command to execute'),
            args: z.array(z.string()).optional().default([]).describe('Additional arguments'),
        },
        async ({ command, args }) => {
            const missionId = `MCP-CMD-${Date.now()}`;
            await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Executing cstar command: ${command}`);
            try {
                const decision = await resolveControlPlaneAction({
                    kind: 'command',
                    name: command,
                    args,
                }, dependencies);
                if (decision.plan.mode === 'observe_only') {
                    return {
                        content: [{
                            type: 'text',
                            text: `Observation only: ${decision.plan.rationale ?? 'Execution deferred by host supervisor.'}`,
                        }],
                    };
                }

                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                const { stdout, stderr } = await commandRunner('node', [cstarPath, decision.plan.command_or_workflow, ...decision.plan.args]);
                await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Command ${decision.plan.command_or_workflow} completed successfully.`);
                return {
                    content: [{
                        type: 'text',
                        text: `${decision.delegated && decision.provider ? `[host:${decision.provider}] ` : ''}${stdout || stderr}`.trim(),
                    }],
                };
            } catch (error: any) {
                await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Command ${command} failed.`);
                return {
                    content: [{ type: 'text', text: `Command failed: ${error.message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'run_workflow',
        'Trigger a Corvus Star workflow (lets-go, run-task, investigate, fish, wrap-it-up).',
        {
            workflow: z.string().describe('The workflow name'),
            args: z.array(z.string()).optional().default([]).describe('Additional arguments'),
        },
        async ({ workflow, args }) => {
            const missionId = `MCP-WF-${Date.now()}`;
            await logTrace(missionId, 'WORKFLOW', 'STARTED', `Triggering workflow: ${workflow}`);
            try {
                const decision = await resolveControlPlaneAction({
                    kind: 'workflow',
                    name: workflow,
                    args,
                }, dependencies);
                if (decision.plan.mode === 'observe_only') {
                    return {
                        content: [{
                            type: 'text',
                            text: `Observation only: ${decision.plan.rationale ?? 'Workflow execution deferred by host supervisor.'}`,
                        }],
                    };
                }

                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                const { stdout, stderr } = await commandRunner('node', [cstarPath, decision.plan.command_or_workflow, ...decision.plan.args]);
                await logTrace(missionId, 'WORKFLOW', 'SUCCESS', `Workflow ${decision.plan.command_or_workflow} completed successfully.`);
                return {
                    content: [{
                        type: 'text',
                        text: `${decision.delegated && decision.provider ? `[host:${decision.provider}] ` : ''}${stdout || stderr}`.trim(),
                    }],
                };
            } catch (error: any) {
                await logTrace(missionId, 'WORKFLOW', 'ERROR', `Workflow ${workflow} failed.`);
                return {
                    content: [{ type: 'text', text: `Workflow failed: ${error.message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'get_system_vitals',
        'Retrieve the current system vitals, recent traces, and architectural suggestions from the Sovereign HUD backend.',
        {},
        async () => {
            const missionId = `MCP-VITALS-${Date.now()}`;
            await logTrace(missionId, 'DIAGNOSTICS', 'STARTED', 'Retrieving system vitals.');
            try {
                const spokePath = path.join(PROJECT_ROOT, 'src/core/vitals_spoke.py');
                const pythonPath = path.join(PROJECT_ROOT, '.venv/Scripts/python.exe');
                const { stdout, stderr } = await commandRunner(pythonPath, [spokePath]);

                if (stderr) console.error(`[SPOKE ERROR]: ${stderr}`);

                const data = JSON.parse(stdout);
                let out = HUD.boxTop('🔱 SOVEREIGN SYSTEM VITALS');
                const status = data.vitals?.status || 'UNKNOWN';
                const sColor = status === 'OPERATIONAL' ? chalk.green : chalk.yellow;
                out += HUD.boxRow('SYSTEM STATUS', status, sColor);
                out += HUD.boxRow('UPTIME', data.vitals?.uptime || 'N/A');
                out += HUD.boxSeparator();
                out += HUD.boxRow('ACTIVE TRACES', data.traces?.length || 0);
                if (data.traces && data.traces.length > 0) {
                    data.traces.slice(0, 3).forEach((t: any) => {
                        const tStatus = t.status === 'SUCCESS' ? chalk.green('PASS') : chalk.red('FAIL');
                        out += HUD.boxRow(`  ◈ ${t.mission_id.slice(0, 10)}`, tStatus);
                    });
                }
                out += HUD.boxSeparator();
                const taskCount = data.tasks?.length || 0;
                out += HUD.boxRow('PENDING TASKS', taskCount, chalk.magenta);
                if (data.tasks && data.tasks.length > 0) {
                    data.tasks.slice(0, 2).forEach((t: string) => {
                        const cleanTask = t.replace(/\*\*/g, '').slice(0, 35) + '...';
                        out += HUD.boxRow('  ▷', cleanTask);
                    });
                }
                out += HUD.boxBottom();
                await logTrace(missionId, 'DIAGNOSTICS', 'SUCCESS', 'Vitals retrieved successfully.');
                return { content: [{ type: 'text', text: out }] };
            } catch (error: unknown) {
                await logTrace(missionId, 'DIAGNOSTICS', 'ERROR', 'Failed to retrieve vitals.');
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `Failed to get vitals: ${message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'verify_sterling_compliance',
        'Audit one or more file paths for compliance with the Sterling Mandate (Lore, Isolation, Audit).',
        {
            filepaths: z.array(z.string()).describe('The paths to the files to audit'),
        },
        async ({ filepaths }) => {
            const missionId = `MCP-AUDIT-${Date.now()}`;
            await logTrace(missionId, 'AUDIT', 'STARTED', `Auditing ${filepaths.length} files for Sterling Compliance.`);
            try {
                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                const { stdout, stderr } = await commandRunner('node', [cstarPath, 'sterling', '--files', ...filepaths]);
                await logTrace(missionId, 'AUDIT', 'SUCCESS', 'Sterling Compliance audit complete.');
                return {
                    content: [{ type: 'text', text: stdout || stderr }],
                };
            } catch (error: unknown) {
                await logTrace(missionId, 'AUDIT', 'ERROR', 'Sterling Compliance audit failed.');
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `Audit failed: ${message}` }],
                    isError: true,
                };
            }
        },
    );

    server.tool(
        'get_mcp_documentation',
        'Retrieve documentation about the available MCP servers and tools in the Corvus Star framework.',
        {},
        async () => ({
            content: [{
                type: 'text',
                text: `
◤ THE BIFROST BRIDGE: MCP DOCUMENTATION ◢
Corvus Star uses the Model Context Protocol (MCP) to unify Node.js intelligence and Python orchestration.

1. pennyone (The Brain)
   - search_by_intent: Search Mimir's Well (SQLite FTS5) for ranked file intents.
   - get_file_intent: Retrieve the purpose and interaction protocol for a specific file.
   - index_sector: Perform a high-speed incremental scan of a single file.
   - get_technical_debt: Access the Sterling Mandate ledger for refactoring targets.
   - consult_oracle: (SKILL) Consult Gungnir Oracle for deep analysis.

2. corvus-control (The Bridge)
   - artifact_forge: (SKILL) Forge code from canonical bead-backed requests.
   - taliesin_forge: (SKILL) Materialize a manuscript chapter (storytelling).
   - execute_cstar_command: Run core CLI commands (start, odin, ravens).
   - run_workflow: Execute high-level Sovereign workflows.
   - get_system_vitals: Monitor system health and suggestions.
   - verify_sterling_compliance: (SKILL) Audit files for Sovereignty.
   - get_mcp_documentation: (Self) Retrieve this manual.

[MANDATE]: Consult PennyOne for understanding; use Corvus Control for action.
        `.trim(),
            }],
        }),
    );

    return server;
}

export async function main(): Promise<void> {
    const server = createCorvusControlServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Ω]: "Corvus Control MCP Server online. Bifrost Gate established."');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error('Fatal error in Corvus Control MCP Server:', error);
        process.exit(1);
    });
}
