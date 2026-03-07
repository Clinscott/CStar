import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// [Ω] THE AWAKENING: Forcefully load local environment to survive host sanitization
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execa } from 'execa';
import { HUD } from '../node/core/hud.js';
import chalk from 'chalk';

/**
 * Corvus Control: MCP Bridge (v2.0)
 * Purpose: Orchestrate the Gungnir Control Plane via MCP tools.
 * Upgrade: Agentic Stack Restructuring - Delegating procedural logic to Agent Skills.
 */

const server = new McpServer({
    name: 'corvus-control',
    version: '2.0.0',
});

// --- TELEMETRY ---
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
                justification: justification,
                status: status,
                timestamp: Date.now()
            }),
            signal: AbortSignal.timeout(500)
        });
    } catch (err) {
        // Fail silently
    }
}

// --- TOOLS ---

server.tool(
    'taliesin_forge',
    'Weave code directly from repository lore (Campaigns or .feature contracts) using the One Mind.',
    {
        lorePath: z.string().describe('Relative path to the .qmd or .feature lore file'),
        objective: z.string().optional().describe('Optional specific objective override'),
    },
    async ({ lorePath, objective }) => {
        const missionId = `FORGE-${Date.now()}`;
        await logTrace(missionId, 'CREATION', 'STARTED', `Forging from: ${lorePath}`);
        
        try {
            /**
             * [ALFRED]: Logic migrated to 'forge' Agent Skill.
             * MCP server now acts as a strictly external gateway.
             */
            const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
            const args = ['forge', '--lore', lorePath];
            if (objective) {
                args.push('--objective', objective);
            }

            const { stdout, stderr } = await execa('node', [cstarPath, ...args]);
            
            await logTrace(missionId, 'CREATION', 'SUCCESS', `Artifact forged: ${lorePath}`);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: stdout || stderr
                }],
            };

        } catch (error: any) {
            await logTrace(missionId, 'CREATION', 'ERROR', `Forge failed: ${error.message}`);
            return {
                content: [{ type: 'text', text: `Forge failed: ${error.message}` }],
                isError: true,
            };
        }
    }
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
            const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
            const { stdout, stderr } = await execa('node', [cstarPath, command, ...args]);
            await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Command ${command} completed successfully.`);
            return {
                content: [{ type: 'text', text: stdout || stderr }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Command ${command} failed.`);
            return {
                content: [{ type: 'text', text: `Command failed: ${error.message}` }],
                isError: true,
            };
        }
    }
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
            const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
            const { stdout, stderr } = await execa('node', [cstarPath, workflow, ...args]);
            await logTrace(missionId, 'WORKFLOW', 'SUCCESS', `Workflow ${workflow} completed successfully.`);
            return {
                content: [{ type: 'text', text: stdout || stderr }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'WORKFLOW', 'ERROR', `Workflow ${workflow} failed.`);
            return {
                content: [{ type: 'text', text: `Workflow failed: ${error.message}` }],
                isError: true,
            };
        }
    }
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
            const { stdout, stderr } = await execa(pythonPath, [spokePath]);
            
            if (stderr) console.error(`[SPOKE ERROR]: ${stderr}`);
            
            const data = JSON.parse(stdout);
            let out = HUD.boxTop('🔱 SOVEREIGN SYSTEM VITALS');
            
            // 1. Status Section
            const status = data.vitals?.status || 'UNKNOWN';
            const sColor = status === 'OPERATIONAL' ? chalk.green : chalk.yellow;
            out += HUD.boxRow('SYSTEM STATUS', status, sColor);
            out += HUD.boxRow('UPTIME', data.vitals?.uptime || 'N/A');
            out += HUD.boxSeparator();

            // 2. Traces Section
            out += HUD.boxRow('ACTIVE TRACES', data.traces?.length || 0);
            if (data.traces && data.traces.length > 0) {
                data.traces.slice(0, 3).forEach((t: any) => {
                    const tStatus = t.status === 'SUCCESS' ? chalk.green('PASS') : chalk.red('FAIL');
                    out += HUD.boxRow(`  ◈ ${t.mission_id.slice(0, 10)}`, tStatus);
                });
            }
            out += HUD.boxSeparator();

            // 3. Tasks / Suggestions
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
            return {
                content: [{ type: 'text', text: out }],
            };
        } catch (error: unknown) {
            await logTrace(missionId, 'DIAGNOSTICS', 'ERROR', 'Failed to retrieve vitals.');
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Failed to get vitals: ${message}` }],
                isError: true,
            };
        }
    }
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
            /**
             * [ALFRED]: Logic migrated to 'sterling' Agent Skill.
             * MCP server now acts as a strictly external gateway.
             */
            const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
            const { stdout, stderr } = await execa('node', [cstarPath, 'sterling', '--files', ...filepaths]);
            
            await logTrace(missionId, 'AUDIT', 'SUCCESS', `Sterling Compliance audit complete.`);
            return {
                content: [{ type: 'text', text: stdout || stderr }],
            };
        } catch (error: unknown) {
            await logTrace(missionId, 'AUDIT', 'ERROR', `Sterling Compliance audit failed.`);
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Audit failed: ${message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_mcp_documentation',
    'Retrieve documentation about the available MCP servers and tools in the Corvus Star framework.',
    {},
    async () => {
        const missionId = `MCP-DOC-${Date.now()}`;
        await logTrace(missionId, 'INTENT_GENERATION', 'SUCCESS', 'Retrieve MCP documentation');
        const doc = `
◤ THE BIFROST BRIDGE: MCP DOCUMENTATION ◢
Corvus Star uses the Model Context Protocol (MCP) to unify Node.js intelligence and Python orchestration.

1. pennyone (The Brain)
   - search_by_intent: Search Mimir's Well (SQLite FTS5) for ranked file intents.
   - get_file_intent: Retrieve the purpose and interaction protocol for a specific file.
   - index_sector: Perform a high-speed incremental scan of a single file.
   - get_technical_debt: Access the Sterling Mandate ledger for refactoring targets.
   - consult_oracle: (SKILL) Consult Gungnir Oracle for deep analysis.

2. corvus-control (The Bridge)
   - taliesin_forge: (SKILL) Weave code artifacts from lore.
   - execute_cstar_command: Run core CLI commands (start, odin, ravens).
   - run_workflow: Execute high-level Sovereign workflows.
   - get_system_vitals: Monitor system health and suggestions.
   - verify_sterling_compliance: (SKILL) Audit files for Sovereignty.
   - get_mcp_documentation: (Self) Retrieve this manual.

[MANDATE]: Consult PennyOne for understanding; use Corvus Control for action.
        `;
        return {
            content: [{ type: 'text', text: doc }],
        };
    }
);

// --- MAIN ---

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Ω]: "Corvus Control MCP Server online. Bifrost Gate established."');
}

main().catch((error) => {
    console.error('Fatal error in Corvus Control MCP Server:', error);
    process.exit(1);
});
