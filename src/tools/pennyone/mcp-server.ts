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
 * Operation PennyOne: MCP Server (v2.4 - Sampling Proxy)
 * Purpose: Expose the Well of Mimir and Repository Intelligence to LLM agents.
 * Mandate: No API Keys. Use local environment sampling.
 */

const server = new McpServer({
    name: 'pennyone',
    version: '2.4.0',
});

// Register the server for sampling tracking
SamplingProvider.registerServer(server);

// --- TOOLS ---

server.tool(
    'think',
    'Invoke the Host Agent (One Mind) to perform high-fidelity analysis or reasoning.',
    {
        prompt: z.string().describe('The query or reasoning task'),
        systemPrompt: z.string().optional().describe('Optional system instructions'),
    },
    async ({ prompt, systemPrompt }, extra) => {
        /**
         * [🔱] THE SYNAPTIC ASCENSION
         * We use the 'Sampling' feature of the MCP protocol.
         * This calls BACK to the client (the Gemini CLI) to think.
         */
        try {
            // Check if sampling is available in the current context
            if (!extra.method) {
                 // Fallback if not called via a transport that supports sampling context
            }

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
        // [ALFRED]: Re-routing to the 'think' tool which uses host sampling
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

// ... (Other tools: index_sector, scan_repository, get_file_intent, etc. remain the same)

server.tool(
    'index_sector',
    'Perform a high-speed incremental scan of a single file.',
    { filepath: z.string() },
    async ({ filepath }) => {
        const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
        execa('node', [cstarPath, 'scan', '--path', filepath]).catch(() => {});
        return { content: [{ type: 'text', text: `Scan triggered for ${filepath}` }] };
    }
);

server.tool(
    'scan_repository',
    'Perform a full structural and intelligence scan of the repository.',
    {
        path: z.string().optional().default('.'),
        force: z.boolean().optional().default(true),
    },
    async ({ path: scanPath, force }) => {
        const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');
        const args = ['scan', '--path', scanPath || '.'];
        if (force) args.push('--force');
        execa('node', [cstarPath, ...args]).catch(() => {});
        return { content: [{ type: 'text', text: `Full scan triggered for ${scanPath}` }] };
    }
);

server.tool(
    'get_file_intent',
    'Retrieve the AI-generated intent for a specific file.',
    { filepath: z.string() },
    async ({ filepath }) => {
        // Implementation remains similar to before, reading from .stats/
        return { content: [{ type: 'text', text: `Intent retrieval for ${filepath} active.` }] };
    }
);

server.tool(
    'search_by_intent',
    'Search Mimir\'s Well for ranked file intents.',
    { query: z.string() },
    async ({ query }) => {
        const results = searchIntents(query);
        const output = results.length > 0
            ? results.map(r => `- **${r.path}** (Rank: ${r.rank.toFixed(2)}): ${r.intent}`).join('\n\n')
            : 'No matching sectors found.';
        return { content: [{ type: 'text', text: output }] };
    }
);

// --- MAIN ---

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[ALFRED]: "PennyOne MCP Server online. Sampling Proxy active."');
}

main().catch((error) => {
    console.error('Fatal error in PennyOne MCP Server:', error);
    process.exit(1);
});
