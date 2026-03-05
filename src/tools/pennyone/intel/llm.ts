import { FileData } from '../analyzer.ts';
import { CortexLink } from '../../../node/cortex_link.ts';
import chalk from 'chalk';

/**
 * LLM Provider Abstraction
 * Purpose: Generate high-fidelity, agentic file intents.
 * Mandate: No Mocking. No Fallback.
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

/**
 * SamplingProvider: Leverages the MCP Host (the active LLM) directly.
 * This is the "One Mind" standard.
 */
export class SamplingProvider implements IntelProvider {
    private static mcpServer: any = null;

    static registerServer(server: any) {
        this.mcpServer = server;
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (items.length === 0) return [];

        // [🔱] THE ONE MIND: If we are running inside an MCP server, use Sampling
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

            const prompt = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" (2-3 sentences) and "interaction" (1-2 sentences) fields. Match the order of the input files exactly.
            
            For Source Code: Explain what the code does and its API/interaction model.
            For Documentation/Workflows (.md/.qmd): Summarize the workflow's purpose, what triggers it, and the overarching goal.
            
            FILES:
            ${batchQuery}`;

            try {
                console.error(chalk.cyan(`[ALFRED] Requesting sampling from Host for ${items.length} sectors...`));
                const response = await SamplingProvider.mcpServer.server.createMessage({
                    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
                    systemPrompt: "You are the Corvus Star Intelligence Oracle. Analyze code structure and workflows, then provide semantic intents as a raw JSON array."
                });

                const raw = response.content.text || '';
                return this.parseResponse(raw, items);
            } catch (err: any) {
                console.error(chalk.yellow(`[WARNING] Sampling failed: ${err.message}. Falling back to Synaptic Link.`));
            }
        }

        // [🔱] THE SYNAPTIC LINK: Fallback to Python Daemon (Oracle)
        return await this.consultDaemon(items);
    }

    private async consultDaemon(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (process.env.GEMINI_CLI_ACTIVE !== 'true') {
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

        const query = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" and "interaction" fields. For documentation/workflows, summarize their purpose.\n\nFILES:\n${batchQuery}`;

        try {
            console.error(chalk.cyan(`[ALFRED] Consulting the Oracle for ${items.length} sectors...`));
            const res = await cortex.sendCommand('ask', [query, 'BATCH_ANALYSIS']);
            
            if (res && res.status === 'success') {
                const raw = (res.data as any)?.raw || '';
                return this.parseResponse(raw, items);
            }
            throw new Error((res as any)?.message || 'Oracle communication failure.');
        } catch (err: any) {
            throw new Error(`[CRITICAL FAILURE] Agentic scan failed: ${err.message}`);
        }
    }

    private parseResponse(raw: string, items: any[]): { intent: string; interaction: string }[] {
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        
        if (start === -1 || end === -1 || end < start) {
            throw new Error('No JSON array found in Oracle response.');
        }

        const jsonStr = raw.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        
        if (Array.isArray(parsed) && parsed.length === items.length) {
            return parsed.map((p, idx) => {
                const intent = p.intent || '';
                const interaction = p.interaction || '';
                const genericPhrases = ['facilitates internal logic', 'functional component', 'standard project structure', 'internal logic'];
                const isGeneric = genericPhrases.some(phrase => intent.toLowerCase().includes(phrase));
                
                if (intent.length < 30 || isGeneric) {
                    return { intent: `[SHALLOW LORE]: ${intent}`, interaction };
                }
                return { intent, interaction };
            });
        }
        throw new Error('Malformed JSON array in response.');
    }
}

// Global Intelligence Provider (Context-aware Sampling)
export const defaultProvider: IntelProvider = new SamplingProvider();
