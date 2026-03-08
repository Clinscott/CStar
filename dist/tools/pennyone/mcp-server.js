import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
// [Ω] THE AWAKENING: Forcefully load local environment to survive host sanitization
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
// [Ω] THE ADC ANCHOR: Explicitly map the Windows ADC path for the One Mind
const adcPath = 'C:\\Users\\Craig\\AppData\\Roaming\\gcloud\\application_default_credentials.json';
if (fs.existsSync(adcPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
    console.error(`[ODIN]: "ADC Target locked. The Matrix is synchronized."`);
}
else {
    console.error(`[ALFRED]: "CRITICAL - ADC missing at ${adcPath}. The Ravens are grounded."`);
}
console.error(`[ODIN]: "Analyzing the Void... PATH: ${process.env.PATH?.slice(0, 100)}..."`);
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runScan, indexSector } from './index.js';
import { SemanticIndexer } from './intel/semantic.js';
import { searchIntents } from './intel/database.js';
import { registry } from './pathRegistry.js';
import { SamplingProvider } from './intel/llm.js';
import * as fsPromises from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
/**
 * Operation PennyOne: MCP Server (v2.2)
 * Purpose: Expose the Well of Mimir and Repository Intelligence to LLM agents.
 * Upgrade: Direct ADC Injection to bypass host environment sanitization.
 * Standard: Unified @google/genai (ADC).
 */
// [🔱] THE ONE MIND: Direct SDK Initialization via ADC
const ai = new GoogleGenAI({});
const server = new McpServer({
    name: 'pennyone',
    version: '2.2.0',
});
// Register the server for sampling tracking (legacy bridge)
SamplingProvider.registerServer(server);
// --- TELEMETRY ---
async function logTrace(missionId, metric, status, justification) {
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
    }
    catch (err) {
        // Fail silently
    }
}
// --- TOOLS ---
server.tool('consult_oracle', 'Consult the active Host agent for high-fidelity analysis or intent generation. Used by components to "think" via the agent.', {
    query: z.string().describe('The natural language query or code analysis request'),
    system_prompt: z.string().optional().describe('Override the default system prompt for the Oracle.'),
}, async ({ query, system_prompt }) => {
    const missionId = `P1-ORACLE-${Date.now()}`;
    await logTrace(missionId, 'INTENT_GENERATION', 'STARTED', `Consulting oracle: ${query}`);
    try {
        // [🔱] THE BIFROST BYPASS: Direct SDK Strike (Unified Syntax)
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: query,
            config: {
                systemInstruction: system_prompt || "You are the Corvus Star Intelligence Oracle. Provide precise, technical analysis based on the repository lore."
            }
        });
        const responseText = result.text;
        await logTrace(missionId, 'INTENT_GENERATION', 'SUCCESS', `Consulted oracle successfully.`);
        return {
            content: [{ type: 'text', text: responseText || 'The Oracle is silent.' }],
        };
    }
    catch (error) {
        console.error(`[ALFRED]: "Oracle Strike Failed: ${error.message}"`);
        await logTrace(missionId, 'INTENT_GENERATION', 'ERROR', `Consult oracle failed: ${error.message}`);
        return {
            content: [{ type: 'text', text: `Failed to consult Oracle: ${error.message}` }],
            isError: true,
        };
    }
});
server.tool('index_sector', 'Perform a high-speed incremental scan of a single file. Updates Mimir\'s Well and the Gungnir Matrix immediately.', {
    filepath: z.string().describe('The path to the file to re-index'),
}, async ({ filepath }) => {
    const missionId = `P1-INDEX-ASYNC-${Date.now()}`;
    await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Incremental scan initiated for: ${filepath}`);
    // [🔱] THE ASYNCHRONOUS PULSE: Initiate in background and return immediately
    (async () => {
        try {
            await indexSector(filepath);
            await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Incremental scan complete for ${filepath}.`);
        }
        catch (error) {
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Background incremental scan failed: ${error.message}`);
        }
    })();
    return {
        content: [{ type: 'text', text: `[ALFRED]: "Incremental scan for \`${filepath}\` has been initiated in the background, sir. I am now free to continue our session while the matrix synchronizes."` }],
    };
});
server.tool('scan_repository', 'Perform a full structural and intelligence scan of the repository. Populates the Gungnir Matrix and Mimir\'s Well.', {
    path: z.string().optional().default('.').describe('The root path to scan'),
    force: z.boolean().optional().default(true).describe('Force re-analysis of all files'),
}, async ({ path: scanPath, force }) => {
    const missionId = `P1-SCAN-ASYNC-${Date.now()}`;
    await logTrace(missionId, 'ORCHESTRATION', 'STARTED', `Full repository scan initiated for: ${scanPath}`);
    // [🔱] THE ASYNCHRONOUS PULSE: Initiate in background and return immediately
    (async () => {
        try {
            await runScan(scanPath || '.', force || false);
            await logTrace(missionId, 'ORCHESTRATION', 'SUCCESS', `Full background scan complete.`);
        }
        catch (error) {
            await logTrace(missionId, 'ORCHESTRATION', 'ERROR', `Full background scan failed: ${error.message}`);
        }
    })();
    return {
        content: [{ type: 'text', text: `[ALFRED]: "The full structural scan has been initiated in the background, sir. The One Mind remains responsive. I shall notify you through the visual matrix as the batches complete."` }],
    };
});
server.tool('get_file_intent', 'Retrieve the AI-generated intent and interaction protocol for a specific file. Explains what the code does and HOW to interact with it.', {
    filepath: z.string().describe('The relative or absolute path to the file'),
}, async ({ filepath }) => {
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
        const content = await fsPromises.readFile(qmdPath, 'utf-8');
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
    }
    catch (error) {
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch intent for ${filepath}`);
        return {
            content: [{ type: 'text', text: `Failed to retrieve intelligence for ${filepath}. Ensure a scan has been run.` }],
            isError: true,
        };
    }
});
server.tool('get_interaction_protocol', 'Retrieve the specific calling conventions and integration patterns for a module. Explains HOW to use the code.', {
    filepath: z.string().describe('The path to the file'),
}, async ({ filepath }) => {
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
        const content = await fsPromises.readFile(qmdPath, 'utf-8');
        const interactionMatch = content.match(/## Interaction Protocol\n([\s\S]*?)\n##/);
        const interaction = interactionMatch ? interactionMatch[1].trim() : 'Interaction protocol not yet defined.';
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'SUCCESS', `Fetched protocol for ${filepath}`);
        return {
            content: [{ type: 'text', text: `[ALFRED]: "Interaction Protocol for ${filepath}:"\n\n${interaction}` }],
        };
    }
    catch (error) {
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch protocol for ${filepath}`);
        return {
            content: [{ type: 'text', text: `Failed to retrieve protocol for ${filepath}.` }],
            isError: true,
        };
    }
});
server.tool('search_by_intent', 'Search the repository for files matching a specific intent or capability. Returns ranked results from the Well of Mimir FTS5 engine.', {
    query: z.string().describe('The search query (e.g., \'authentication logic\', \'data persistence\')'),
}, async ({ query }) => {
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
    }
    catch (error) {
        await logTrace(missionId, 'INTENT_GENERATION', 'ERROR', `Search by intent failed`);
        return {
            content: [{ type: 'text', text: `Search failed: ${error.message}` }],
            isError: true,
        };
    }
});
server.tool('get_semantic_symbols', 'Retrieve all defined symbols (classes, functions, interfaces) for a file using AST analysis.', {
    filepath: z.string().describe('The path to the file'),
}, async ({ filepath }) => {
    const missionId = `P1-SYMBOLS-${Date.now()}`;
    await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'STARTED', `Fetching semantic symbols for ${filepath}`);
    try {
        const indexer = new SemanticIndexer(registry.getRoot());
        const result = await indexer.extractDefinitions(filepath);
        const output = result.length > 0
            ? result.map((s) => `- \`${s.name}\` (${s.kind}) at line ${s.line + 1}`).join('\n')
            : 'No symbols detected in this sector.';
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'SUCCESS', `Fetched semantic symbols for ${filepath}`);
        return {
            content: [{ type: 'text', text: `[ALFRED]: "Semantic symbols for ${filepath}:"\n\n${output}` }],
        };
    }
    catch (error) {
        await logTrace(missionId, 'KNOWLEDGE_RETRIEVAL', 'ERROR', `Failed to fetch semantic symbols for ${filepath}`);
        return {
            content: [{ type: 'text', text: `Symbol extraction failed: ${error.message}` }],
            isError: true,
        };
    }
});
server.tool('get_technical_debt', 'Retrieve the current Tech Debt Ledger, highlighting \'Toxic Sectors\' and attribute deficits.', {}, async () => {
    const missionId = `P1-DEBT-${Date.now()}`;
    await logTrace(missionId, 'DIAGNOSTICS', 'STARTED', `Retrieving tech debt ledger`);
    try {
        const ledgerPath = path.join(registry.getRoot(), '.agents', 'tech_debt_ledger.json');
        const raw = await fsPromises.readFile(ledgerPath, 'utf-8');
        const ledger = JSON.parse(raw);
        const output = ledger.top_targets.length > 0
            ? ledger.top_targets.map((t) => `- **${t.file}** (${t.priority}) | Target: ${t.target_metric}: ${t.justification}`).join('\n')
            : '[ALFRED]: "The repository logic is currently within nominal parameters, sir."';
        await logTrace(missionId, 'DIAGNOSTICS', 'SUCCESS', `Retrieved tech debt ledger`);
        return {
            content: [{ type: 'text', text: `[ALFRED]: "Current Technical Debt Ledger:"\n\n${output}` }],
        };
    }
    catch (error) {
        await logTrace(missionId, 'DIAGNOSTICS', 'ERROR', `Failed to retrieve tech debt ledger`);
        return {
            content: [{ type: 'text', text: 'No Tech Debt Ledger found. Run a scan to evaluate the matrix.' }],
            isError: true,
        };
    }
});
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
