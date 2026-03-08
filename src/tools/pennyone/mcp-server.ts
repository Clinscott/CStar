import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { execa } from 'execa';

// [Ω] THE AWAKENING: Forcefully load local environment to survive host sanitization
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SemanticIndexer } from './intel/semantic.js';
import { searchIntents } from './intel/database.js';
import { registry } from './pathRegistry.js';
import { SamplingProvider } from './intel/llm.js';
import * as fsPromises from 'node:fs/promises';

/**
 * Operation PennyOne: MCP Server (v2.5 - Pure Sampling Proxy)
 * Purpose: Expose the Well of Mimir and Repository Intelligence to LLM agents.
 * Mandate: NO API KEYS. Exclusively use Host Sampling.
 */

const server = new McpServer({
    name: 'pennyone',
    version: '2.5.0',
});

// [🔱] THE SYNERGY: Link the provider to this server instance for Sampling
SamplingProvider.registerServer(server);

// --- TELEMETRY ---
async function logTrace(missionId: string, metric: string, status: string, justification: string) {
    try {
        await fetch('http://localhost:4000/api/telemetry/trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mission_id: missionId,
                file_path: 'PENNYONE_MCP',
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
    'think',
    'Invoke the Host Agent (One Mind) to perform high-fidelity analysis or reasoning via Sampling.',
    {
        prompt: z.string().describe('The query or reasoning task'),
        systemPrompt: z.string().optional().describe('Optional system instructions'),
    },
    async ({ prompt, systemPrompt }) => {
        /**
         * [🔱] THE SYNAPTIC ASCENSION
         * We call 'createMessage' (Sampling) on the client (the Shaman's Mind).
         */
        try {
            const result = await server.createMessage({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: prompt }
                    }
                ],
                systemPrompt: systemPrompt || "You are the Corvus Star One Mind.",
                modelPreferences: {
                    hints: [{ name: process.env.GEMINI_MODEL || 'gemini-2.0-flash' }]
                }
            });

            const text = result.content.type === 'text' ? result.content.text : 'The One Mind returned non-textual intelligence.';

            return {
                content: [{ type: 'text', text }]
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Host Sampling Failed: ${error.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    'consult_oracle',
    'Consult the active Host agent for high-fidelity analysis or intent generation.',
    {
        query: z.string().describe('The natural language query or code analysis request'),
        system_prompt: z.string().optional().describe('Override the default system prompt for the Oracle.'),
    },
    async ({ query, system_prompt }) => {
        /**
         * [ALFRED]: Re-routing to the 'think' logic which uses host sampling.
         * The 'oracle' skill triggers this tool via cstar.
         */
        const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
        const args = ['oracle', '--query', query];
        if (system_prompt) {
            args.push('--system_prompt', system_prompt);
        }

        const { stdout, stderr } = await execa('node', [cstarPath, ...args]);
        return {
            content: [{ type: 'text', text: stdout || stderr }],
        };
    }
);

server.tool(
    'index_sector',
    'Perform a high-speed incremental scan of a single file. Updates Mimir\'s Well and the Gungnir Matrix immediately.',
    {
        filepath: z.string().describe('The path to the file to re-index'),
    },
    async ({ filepath }) => {
        const missionId = `P1-INDEX-ASYNC-${Date.now()}`;
        await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Incremental scan initiated for: ${filepath}`);
        
        (async () => {
            try {
                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                await execa('node', [cstarPath, 'scan', '--path', filepath]);
                await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Incremental scan complete for ${filepath}.`);
            } catch (error: any) {
                await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Background incremental scan failed: ${error.message}`);
            }
        })();

        return {
            content: [{ type: 'text', text: `[ALFRED]: "Incremental scan for \`${filepath}\` has been initiated in the background via the Agentic Stack."` }],
        };
    }
);

server.tool(
    'scan_repository',
    'Perform a full structural and intelligence scan of the repository. Populates the Gungnir Matrix and Mimir\'s Well.',
    {
        path: z.string().optional().default('.').describe('The root path to scan'),
        force: z.boolean().optional().default(true).describe('Force re-analysis of all files'),
    },
    async ({ path: scanPath, force }) => {
        const missionId = `P1-SCAN-ASYNC-${Date.now()}`;
        await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Full repository scan initiated for: ${scanPath}`);
        
        (async () => {
            try {
                const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
                const args = ['scan', '--path', scanPath || '.'];
                if (force) args.push('--force');
                
                await execa('node', [cstarPath, ...args]);
                await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Full background scan complete.`);
            } catch (error: any) {
                await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Full background scan failed: ${error.message}`);
            }
        })();

        return {
            content: [{ type: 'text', text: `[ALFRED]: "The full structural scan has been triggered via the Agentic Stack in the background."` }],
        };
    }
);

server.tool(
    'get_file_intent',
    'Retrieve the AI-generated intent and interaction protocol for a specific file.',
    {
        filepath: z.string().describe('The relative or absolute path to the file'),
    },
    async ({ filepath }) => {
        try {
            const statsDir = path.join(registry.getRoot(), '.stats');
            const absoluteRoot = registry.getRoot().replace(/\\/g, '/');
            const absoluteFile = path.resolve(filepath).replace(/\\/g, '/');
            let relativePath = absoluteFile.replace(absoluteRoot, '').replace(/^\//, '');
            relativePath = relativePath.replace(/:/g, '');

            const flattenedName = relativePath.replace(/[\\/]/g, '-').replace(/\./g, '-');
            const qmdPath = path.join(statsDir, `${flattenedName}.qmd`);

            const content = await fsPromises.readFile(qmdPath, 'utf-8');
            const intentMatch = content.match(/## Intent\n([\s\S]*?)\n##/);
            const intent = intentMatch ? intentMatch[1].trim() : 'Intent not yet generated.';

            return {
                content: [{ type: 'text', text: `Sector Intelligence for ${filepath}:\n\n### 🎯 INTENT\n${intent}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to retrieve intelligence for ${filepath}.` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'search_by_intent',
    'Search the repository for files matching a specific intent or capability.',
    {
        query: z.string().describe('The search query'),
    },
    async ({ query }) => {
        try {
            const results = searchIntents(query);
            const output = results.length > 0
                ? results.map(r => `- **${r.path}** (Rank: ${r.rank.toFixed(2)}): ${r.intent}`).join('\n\n')
                : 'No matching sectors found in the Well of Mimir.';

            return {
                content: [{ type: 'text', text: `Well of Mimir results for '${query}':\n\n${output}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Search failed: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_semantic_symbols',
    'Retrieve all defined symbols (classes, functions, interfaces) for a file using AST analysis.',
    {
        filepath: z.string().describe('The path to the file'),
    },
    async ({ filepath }) => {
        try {
            const indexer = new SemanticIndexer(registry.getRoot());
            const result = await (indexer as any).extractDefinitions(filepath);
            
            const output = result.length > 0
                ? result.map((s: any) => `- \`${s.name}\` (${s.kind}) at line ${s.line + 1}`).join('\n')
                : 'No symbols detected.';

            return {
                content: [{ type: 'text', text: `Semantic symbols for ${filepath}:\n\n${output}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Symbol extraction failed: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_technical_debt',
    'Retrieve the current Tech Debt Ledger.',
    {},
    async () => {
        try {
            const ledgerPath = path.join(registry.getRoot(), '.agents', 'tech_debt_ledger.json');
            const raw = await fsPromises.readFile(ledgerPath, 'utf-8');
            const ledger = JSON.parse(raw);

            const output = ledger.top_targets.length > 0
                ? ledger.top_targets.map((t: any) => `- **${t.file}** (${t.priority}) | Target: ${t.target_metric}: ${t.justification}`).join('\n')
                : 'The repository logic is currently within nominal parameters.';

            return {
                content: [{ type: 'text', text: `Current Technical Debt Ledger:\n\n${output}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: 'No Tech Debt Ledger found.' }],
                isError: true,
            };
        }
    }
);


// --- MAIN ---

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[ALFRED]: "PennyOne MCP Server online. Standard IO transport established."');
}

main().catch((error) => {
    console.error('Fatal error in PennyOne MCP Server:', error);
    process.exit(1);
});
