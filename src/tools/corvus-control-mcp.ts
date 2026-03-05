import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Corvus Control: MCP Bridge (v1.0)
 * Purpose: Orchestrate the Gungnir Control Plane via MCP tools.
 */

const server = new McpServer({
    name: 'corvus-control',
    version: '1.0.0',
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
            signal: AbortSignal.timeout(500) // 500ms timeout
        });
    } catch (err) {
        // Fail silently to not block execution if telemetry is down
    }
}

// --- TOOLS ---

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
            const dispatcherPath = path.join(PROJECT_ROOT, 'src/core/cstar_dispatcher.py');
            const pythonPath = path.join(PROJECT_ROOT, '.venv/Scripts/python.exe');
            const { stdout, stderr } = await execa(pythonPath, [dispatcherPath, workflow, ...args]);
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

interface SterlingAuditTier {
    status: string;
    path: string | null;
}

interface SterlingAuditResult {
    file: string;
    status: 'SILVER' | 'POLISHED' | 'TARNISHED';
    compliance_score: number;
    tiers: {
        tier1_lore: SterlingAuditTier;
        tier2_isolation: SterlingAuditTier;
        tier3_audit: SterlingAuditTier;
    };
}

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
            
            await logTrace(missionId, 'DIAGNOSTICS', 'SUCCESS', 'Vitals retrieved successfully.');
            return {
                content: [{ type: 'text', text: stdout }],
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
            const auditorPath = path.join(PROJECT_ROOT, 'src/core/sterling_auditor.py');
            const pythonPath = path.join(PROJECT_ROOT, '.venv/Scripts/python.exe');
            const { stdout } = await execa(pythonPath, [auditorPath, ...filepaths]);
            
            const results: SterlingAuditResult[] = JSON.parse(stdout);
            let output = '[ALFRED]: "Sterling Compliance Report:"\n\n';
            
            results.forEach((r) => {
                const statusEmoji = r.status === 'SILVER' ? '🛡️' : (r.status === 'POLISHED' ? '✨' : '⚠️');
                output += `${statusEmoji} **${r.file}** [${r.status} - ${r.compliance_score.toFixed(0)}%]\n`;
                output += `   - Tier 1 (Lore): ${r.tiers.tier1_lore.status} ${r.tiers.tier1_lore.path ? `(${r.tiers.tier1_lore.path})` : ''}\n`;
                output += `   - Tier 2 (Isolation): ${r.tiers.tier2_isolation.status} ${r.tiers.tier2_isolation.path ? `(${r.tiers.tier2_isolation.path})` : ''}\n`;
                output += `   - Tier 3 (Audit): ${r.tiers.tier3_audit.status} ${r.tiers.tier3_audit.path ? `(${r.tiers.tier3_audit.path})` : ''}\n\n`;
            });

            if (results.every((r) => r.status === 'SILVER')) {
                output += '[ALFRED]: "The silver is pure, Master. Sovereignty confirmed."';
            } else {
                output += '[ALFRED]: "The blade requires further polishing, sir. Gaps identified in the triad."';
            }

            await logTrace(missionId, 'AUDIT', 'SUCCESS', `Sterling Compliance audit complete.`);
            return {
                content: [{ type: 'text', text: output }],
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

2. corvus-control (The Bridge)
   - execute_cstar_command: Run core CLI commands (start, odin, ravens).
   - run_workflow: Execute high-level Sovereign workflows (lets-go, fish, investigate).
   - get_system_vitals: Monitor system health, mission traces, and suggestions.
   - verify_sterling_compliance: Audit files for Unit Test and Gherkin contract gaps.
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
