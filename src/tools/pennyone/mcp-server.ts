import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runScan, indexSector } from './index.ts';
import { SemanticIndexer } from './intel/semantic.ts';
import { getDb, searchIntents } from './intel/database.ts';
import { registry } from './pathRegistry.ts';
import { SamplingProvider } from './intel/llm.ts';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Operation PennyOne: MCP Server (v2.0)
 * Purpose: Expose the Well of Mimir and Repository Intelligence to LLM agents.
 * Mandate: The Omniscience Mandate (AGENTS.qmd Section 1)
 */

const server = new McpServer({
    name: 'pennyone',
    version: '2.0.0',
}, {
    capabilities: {
        sampling: {}
    }
});

// Register the server for sampling
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
            signal: AbortSignal.timeout(500) // 500ms timeout
        });
    } catch (err) {
        // Fail silently
    }
}

// --- TOOLS ---

server.tool(
    'consult_oracle',
    'Consult the active Host agent for high-fidelity analysis or intent generation. Used by components to "think" via the agent.',
    {
        query: z.string().describe('The natural language query or code analysis request'),
        system_prompt: z.string().optional().describe('Override the default system prompt for the Oracle.'),
    },
    async ({ query, system_prompt }) => {
        const missionId = `P1-ORACLE-${Date.now()}`;
        await logTrace(missionId, 'INTENT_GENERATION', 'STARTED', `Consulting oracle: ${query}`);
        try {
            const response = await server.server.createMessage({
                messages: [{ role: 'user', content: { type: 'text', text: query } }],
                systemPrompt: system_prompt || "You are the Corvus Star Intelligence Oracle. Provide precise, technical analysis based on the repository lore."
            });

            await logTrace(missionId, 'INTENT_GENERATION', 'SUCCESS', `Consulted oracle successfully.`);
            return {
                content: [{ type: 'text', text: response.content.text || 'The Oracle is silent.' }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'INTENT_GENERATION', 'ERROR', `Consult oracle failed.`);
            return {
                content: [{ type: 'text', text: `Failed to consult Oracle: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'index_sector',
    'Perform a high-speed incremental scan of a single file. Updates Mimir\'s Well and the Gungnir Matrix immediately.',
    {
        filepath: z.string().describe('The path to the file to re-index'),
    },
    async ({ filepath }) => {
        const missionId = `P1-INDEX-${Date.now()}`;
        await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Indexing sector: ${filepath}`);
        try {
            const result = await indexSector(filepath);
            if (result) {
                await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Sector indexed successfully.`);
                return {
                    content: [{ 
                        type: 'text', 
                        text: `[ALFRED]: "Sector ${filepath} re-indexed successfully. Gungnir Score: ${result.matrix.overall.toFixed(2)}. Hall of Records synchronized."` 
                    }],
                };
            }
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Failed to index sector.`);
            return {
                content: [{ type: 'text', text: `[ALFRED]: "I am afraid I could not re-index sector ${filepath}. Check the logs for corruption."` }],
                isError: true,
            };
        } catch (error: any) {
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Error during sector indexing.`);
            return {
                content: [{ type: 'text', text: `Error during sector indexing: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'scan_repository',
    'Perform a structural scan of the repository. Returns Gungnir scores and file metadata.',
    {
        path: z.string().optional().default('.').describe('The root path to scan'),
        incremental: z.boolean().optional().default(true).describe('Only scan modified files (MD5 check)'),
    },
    async ({ path: scanPath, incremental }) => {
        const missionId = `P1-SCAN-${Date.now()}`;
        await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Scanning repository at ${scanPath} (Incremental: ${incremental}).`);
        try {
            const results = await runScan(scanPath, !incremental);
            await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Repository scan complete.`);
            return {
                content: [{ 
                    type: 'text', 
                    text: `[ALFRED]: "Scan complete. Analyzed ${results.length} files. Hall of Records updated."` 
                }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Error during repository scan.`);
            return {
                content: [{ type: 'text', text: `Error during scan: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_file_intent',
    'Retrieve the AI-generated intent and interaction protocol for a specific file. Explains what the code does and HOW to interact with it.',
    {
        filepath: z.string().describe('The relative or absolute path to the file'),
    },
    async ({ filepath }) => {
        const missionId = `P1-INTENT-${Date.now()}`;
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'STARTED', `Fetching intent for ${filepath}`);
        try {
            const statsDir = path.join(registry.getRoot(), '.stats');
            const absoluteRoot = registry.getRoot().replace(/\\/g, '/');
            const absoluteFile = path.resolve(filepath).replace(/\\/g, '/');
            let relativePath = absoluteFile.replace(absoluteRoot, '').replace(/^\//, '');
            relativePath = relativePath.replace(/:/g, '');

            const flattenedName = relativePath.replace(/[\\/]/g, '-').replace(/\./g, '-');
            const qmdPath = path.join(statsDir, `${flattenedName}.qmd`);

            const content = await fs.readFile(qmdPath, 'utf-8');
            const intentMatch = content.match(/## Intent\n([\s\S]*?)\n##/);
            const intent = intentMatch ? intentMatch[1].trim() : 'Intent not yet generated for this sector.';

            const interactionMatch = content.match(/## Interaction Protocol\n([\s\S]*?)\n##/);
            const interaction = interactionMatch ? interactionMatch[1].trim() : 'Interaction protocol not yet defined.';

            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'SUCCESS', `Fetched intent for ${filepath}`);
            return {
                content: [{ 
                    type: 'text', 
                    text: `[ALFRED]: "Sector Intelligence for ${filepath}:"\n\n### 🎯 INTENT\n${intent}\n\n### 🕹️ INTERACTION PROTOCOL\n${interaction}` 
                }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch intent for ${filepath}`);
            return {
                content: [{ type: 'text', text: `Failed to retrieve intelligence for ${filepath}. Ensure a scan has been run.` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_interaction_protocol',
    'Retrieve the specific calling conventions and integration patterns for a module. Explains HOW to use the code.',
    {
        filepath: z.string().describe('The path to the file'),
    },
    async ({ filepath }) => {
        const missionId = `P1-PROTOCOL-${Date.now()}`;
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'STARTED', `Fetching interaction protocol for ${filepath}`);
        try {
            const statsDir = path.join(registry.getRoot(), '.stats');
            const absoluteRoot = registry.getRoot().replace(/\\/g, '/');
            const absoluteFile = path.resolve(filepath).replace(/\\/g, '/');
            let relativePath = absoluteFile.replace(absoluteRoot, '').replace(/^\//, '');
            relativePath = relativePath.replace(/:/g, '');

            const flattenedName = relativePath.replace(/[\\/]/g, '-').replace(/\./g, '-');
            const qmdPath = path.join(statsDir, `${flattenedName}.qmd`);

            const content = await fs.readFile(qmdPath, 'utf-8');
            const interactionMatch = content.match(/## Interaction Protocol\n([\s\S]*?)\n##/);
            const interaction = interactionMatch ? interactionMatch[1].trim() : 'Interaction protocol not yet defined.';

            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'SUCCESS', `Fetched protocol for ${filepath}`);
            return {
                content: [{ type: 'text', text: `[ALFRED]: "Interaction Protocol for ${filepath}:"\n\n${interaction}` }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch protocol for ${filepath}`);
            return {
                content: [{ type: 'text', text: `Failed to retrieve protocol for ${filepath}.` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'search_by_intent',
    'Search the repository for files matching a specific intent or capability. Returns ranked results from the Well of Mimir FTS5 engine.',
    {
        query: z.string().describe('The search query (e.g., \'authentication logic\', \'data persistence\')'),
    },
    async ({ query }) => {
        const missionId = `P1-SEARCH-${Date.now()}`;
        await logTrace(missionId, 'INTENT_GENERATION', 'STARTED', `Searching by intent: ${query}`);
        try {
            const results = searchIntents(query);

            const output = results.length > 0
                ? results.map(r => `- **${r.path}** (Rank: ${r.rank.toFixed(2)}): ${r.intent}`).join('\n\n')
                : 'No matching sectors found in the Well of Mimir.';

            await logTrace(missionId, 'INTENT_GENERATION', 'SUCCESS', `Search by intent complete`);
            return {
                content: [{ type: 'text', text: `[ALFRED]: "Well of Mimir search results for '${query}':"\n\n${output}` }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'INTENT_GENERATION', 'ERROR', `Search by intent failed`);
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
        const missionId = `P1-SYMBOLS-${Date.now()}`;
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'STARTED', `Fetching semantic symbols for ${filepath}`);
        try {
            const indexer = new SemanticIndexer(registry.getRoot());
            const result = await (indexer as any).extractDefinitions(filepath);
            
            const output = result.length > 0
                ? result.map((s: any) => `- \`${s.name}\` (${s.kind}) at line ${s.line + 1}`).join('\n')
                : 'No symbols detected in this sector.';

            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'SUCCESS', `Fetched semantic symbols for ${filepath}`);
            return {
                content: [{ type: 'text', text: `[ALFRED]: "Semantic symbols for ${filepath}:"\n\n${output}` }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch semantic symbols for ${filepath}`);
            return {
                content: [{ type: 'text', text: `Symbol extraction failed: ${error.message}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'get_technical_debt',
    'Retrieve the current Tech Debt Ledger, highlighting \'Toxic Sectors\' and attribute deficits.',
    {},
    async () => {
        const missionId = `P1-DEBT-${Date.now()}`;
        await logTrace(missionId, 'DIAGNOSTICS', 'STARTED', `Retrieving tech debt ledger`);
        try {
            const ledgerPath = path.join(registry.getRoot(), '.agent', 'tech_debt_ledger.json');
            const raw = await fs.readFile(ledgerPath, 'utf-8');
            const ledger = JSON.parse(raw);

            const output = ledger.top_targets.length > 0
                ? ledger.top_targets.map((t: any) => `- **${t.file}** (${t.priority}) | Target: ${t.target_metric}: ${t.justification}`).join('\n')
                : '[ALFRED]: "The repository logic is currently within nominal parameters, sir."';

            await logTrace(missionId, 'DIAGNOSTICS', 'SUCCESS', `Retrieved tech debt ledger`);
            return {
                content: [{ type: 'text', text: `[ALFRED]: "Current Technical Debt Ledger:"\n\n${output}` }],
            };
        } catch (error: any) {
            await logTrace(missionId, 'DIAGNOSTICS', 'ERROR', `Failed to retrieve tech debt ledger`);
            return {
                content: [{ type: 'text', text: 'No Tech Debt Ledger found. Run a scan to evaluate the matrix.' }],
                isError: true,
            };
        }
    }
);


// --- MAIN ---

/**
 *
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[ALFRED]: "PennyOne MCP Server online. Standard IO transport established."');
}

main().catch((error) => {
    console.error('Fatal error in PennyOne MCP Server:', error);
    process.exit(1);
});
