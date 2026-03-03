import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runScan } from './index.ts';
import { SemanticIndexer } from './intel/semantic.ts';
import { getDb } from './intel/database.ts';
import { registry } from './pathRegistry.ts';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Operation PennyOne: MCP Server (v1.0)
 * Purpose: Expose repository intelligence, intents, and semantic symbols to LLM agents.
 * Mandate: The Omniscience Mandate (AGENTS.qmd Section 1)
 */

const server = new McpServer({
    name: 'pennyone',
    version: '1.0.0',
});

// --- TOOLS ---

server.tool(
    'scan_repository',
    'Perform a full structural scan of the repository. Returns Gungnir scores and file metadata.',
    {
        path: z.string().optional().default('.').describe('The root path to scan'),
    },
    async ({ path: scanPath }) => {
        try {
            const results = await runScan(scanPath);
            return {
                content: [{ 
                    type: 'text', 
                    text: `[ALFRED]: "Scan complete. Analyzed ${results.length} files. Hall of Records updated."` 
                }],
            };
        } catch (error: any) {
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

            return {
                content: [{ 
                    type: 'text', 
                    text: `[ALFRED]: "Sector Intelligence for ${filepath}:"\n\n### 🎯 INTENT\n${intent}\n\n### 🕹️ INTERACTION PROTOCOL\n${interaction}` 
                }],
            };
        } catch (error: any) {
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

            return {
                content: [{ type: 'text', text: `[ALFRED]: "Interaction Protocol for ${filepath}:"\n\n${interaction}` }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to retrieve protocol for ${filepath}.` }],
                isError: true,
            };
        }
    }
);

server.tool(
    'search_by_intent',
    'Search the repository for files matching a specific intent or capability. Useful for finding APIs or modules by purpose.',
    {
        query: z.string().describe('The search query (e.g., \'authentication logic\', \'data persistence\')'),
    },
    async ({ query }) => {
        try {
            const statsDir = path.join(registry.getRoot(), '.stats');
            const files = await fs.readdir(statsDir);
            const results: { path: string; intent: string }[] = [];

            for (const file of files) {
                if (file.endsWith('.qmd')) {
                    const content = await fs.readFile(path.join(statsDir, file), 'utf-8');
                    const pathMatch = content.match(/path: "(.*?)"/);
                    const intentMatch = content.match(/## Intent\n([\s\S]*?)\n##/);
                    
                    if (pathMatch && intentMatch) {
                        const intent = intentMatch[1].toLowerCase();
                        if (intent.includes(query.toLowerCase())) {
                            results.push({ path: pathMatch[1], intent: intentMatch[1].trim() });
                        }
                    }
                }
            }

            const output = results.length > 0
                ? results.map(r => `- **${r.path}**: ${r.intent}`).join('\n\n')
                : 'No matching sectors found in the Hall of Records.';

            return {
                content: [{ type: 'text', text: `[ALFRED]: "Search results for '${query}':"\n\n${output}` }],
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
                : 'No symbols detected in this sector.';

            return {
                content: [{ type: 'text', text: `[ALFRED]: "Semantic symbols for ${filepath}:"\n\n${output}` }],
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
    'Retrieve the current Tech Debt Ledger, highlighting \'Toxic Sectors\' with high gravity and low logic scores.',
    {},
    async () => {
        try {
            const ledgerPath = path.join(registry.getRoot(), '.agent', 'tech_debt_ledger.json');
            const raw = await fs.readFile(ledgerPath, 'utf-8');
            const ledger = JSON.parse(raw);

            const output = ledger.top_targets.length > 0
                ? ledger.top_targets.map((t: any) => `- **${t.file}** (${t.priority}): ${t.justification}`).join('\n')
                : '[ALFRED]: "The repository logic is currently within nominal parameters, sir."';

            return {
                content: [{ type: 'text', text: `[ALFRED]: "Current Technical Debt Ledger:"\n\n${output}` }],
            };
        } catch (error: any) {
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
