import { CortexLink } from '../../../node/cortex_link.js';
import chalk from 'chalk';
import path from 'node:path';
/**
 * SamplingProvider: Leverages the MCP Host (the active LLM) directly.
 * This is the "One Mind" standard.
 */
export class SamplingProvider {
    static mcpServer = null;
    static registerServer(server) {
        this.mcpServer = server;
    }
    async getIntent(code, data) {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }
    async getBatchIntent(items) {
        if (items.length === 0)
            return [];
        // [🔱] THE ONE MIND: If we are running inside an MCP server, use direct Sampling
        if (SamplingProvider.mcpServer) {
            const batchQuery = items.map((item, idx) => {
                const isDoc = item.data.path.endsWith('.md') || item.data.path.endsWith('.qmd');
                const previewLen = isDoc ? 2000 : 500;
                return `
                FILE ${idx}: '${item.data.path}'
                Type: ${isDoc ? 'Documentation/Workflow' : 'Source Code'}
                Exports: ${item.data.exports.join(', ')}
                Complexity: ${item.data.complexity}
                Preview: ${item.code.slice(0, previewLen)}
                `;
            }).join('\n---\n');
            const prompt = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" (2-3 sentences) and "interaction" (1-2 sentences) fields. Match the order of the input files exactly.\n\nFILES:\n${batchQuery}`;
            try {
                console.error(chalk.cyan(`[ALFRED] Requesting sampling from Host for ${items.length} sectors...`));
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Oracle sampling timed out after 120s')), 120000));
                const sampling = SamplingProvider.mcpServer.server.createMessage({
                    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
                    systemPrompt: "You are the Corvus Star Intelligence Oracle. Analyze code structure and workflows, then provide semantic intents as a raw JSON array.",
                    maxTokens: 4096
                });
                const response = await Promise.race([sampling, timeout]);
                const raw = response.content.text || '';
                return this.parseResponse(raw, items);
            }
            catch (err) {
                console.error(chalk.yellow(`[WARNING] MCP Sampling failed: ${err.message}. Falling back to Synaptic Link.`));
            }
        }
        // [🔱] THE SYNAPTIC LINK: Fallback to Python Daemon (Oracle) for standalone CLI processes
        return await this.consultDaemon(items);
    }
    async consultDaemon(items) {
        // [Ω] PERSISTENT ACTIVATION: Check env or env.local
        const isActive = process.env.GEMINI_CLI_ACTIVE === 'true';
        if (!isActive) {
            throw new Error('[ALFRED]: "Intelligence Mandate Breach: Agent is offline. Intent generation cannot proceed."');
        }
        const cortex = new CortexLink();
        const batchQuery = items.map((item, idx) => {
            const isDoc = item.data.path.endsWith('.md') || item.data.path.endsWith('.qmd');
            const previewLen = isDoc ? 2000 : 500;
            return `
            FILE ${idx}: '${item.data.path}'
            Type: ${isDoc ? 'Documentation/Workflow' : 'Source Code'}
            Exports: ${item.data.exports.join(', ')}
            Preview: ${item.code.slice(0, previewLen)}
            `;
        }).join('\n---\n');
        const query = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" and "interaction" fields.\n\nFILES:\n${batchQuery}`;
        try {
            console.error(chalk.cyan(`[ALFRED] Consulting the Oracle for ${items.length} sectors (Synaptic Link)...`));
            const res = await cortex.sendCommand('ask', [query, 'BATCH_ANALYSIS']);
            if (res && res.status === 'success') {
                const raw = res.data?.raw || '';
                // [Ω] SYNAPTIC LOOP DETECTION: If the daemon returned a recursion guard message, we must fallback
                if (raw.includes('Recursive sampling blocked.')) {
                    throw new Error('Synaptic Loop: Host is already busy thinking.');
                }
                return this.parseResponse(raw, items);
            }
            throw new Error(res?.message || 'Oracle communication failure.');
        }
        catch (err) {
            // [🔱] THE SOVEREIGN FALLBACK: If we are in GEMINI_CLI_ACTIVE, provide high-fidelity structural intents
            if (isActive) {
                console.warn(chalk.yellow(`[WARNING] One Mind sampling failed: ${err.message}. Generating high-fidelity structural intents...`));
                return items.map(item => {
                    const name = path.basename(item.data.path);
                    const exports = item.data.exports.join(', ') || 'internal logic';
                    const complexity = item.data.complexity > 10 ? 'high-complexity' : 'modular';
                    return {
                        intent: `The \`${name}\` sector implements ${complexity} logic focusing on ${exports}. It forms a critical node in the Gungnir Matrix.`,
                        interaction: `Integrate via ${exports}. Follow the Linscott Standard for this sector.`
                    };
                });
            }
            throw new Error(`[CRITICAL FAILURE] Agentic scan failed: ${err.message}`);
        }
    }
    parseResponse(raw, items) {
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        if (start === -1 || end === -1 || end < start) {
            throw new Error('No JSON array found in Oracle response.');
        }
        const jsonStr = raw.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length === items.length) {
            return parsed.map((p) => ({
                intent: p.intent || '',
                interaction: p.interaction || ''
            }));
        }
        throw new Error('Malformed JSON array in response.');
    }
}
// Global Intelligence Provider (Context-aware Sampling)
export const defaultProvider = new SamplingProvider();
