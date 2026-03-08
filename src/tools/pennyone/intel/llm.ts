import { FileData } from '../types.js';
import { CortexLink } from '../../../node/cortex_link.js';
import chalk from 'chalk';
import path from 'node:path';
import { mimir } from '../../../core/mimir_client.js';

/**
 * LLM Provider Abstraction: THE ONE MIND CONDUIT
 * Purpose: Generate high-fidelity, agentic file intents via the Synaptic Link.
 * Mandate: NO API KEYS. (AGENTS.qmd).
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

/**
 * SamplingProvider: Leverages the Synaptic Link (mimir) to channel the Host Agent.
 */
export class SamplingProvider implements IntelProvider {
    private static mcpServer: any = null;

    constructor() {}

    static registerServer(server: any) {
        this.mcpServer = server;
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (items.length === 0) return [];

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

        const prompt = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" (2-3 sentences) and "interaction" (1-2 sentences) fields. Match the order of the input files exactly.\n\nFILES:\n${batchQuery}`;

        try {
            console.error(chalk.cyan(`[ALFRED] Requesting Synaptic Strike for ${items.length} sectors...`));
            
            /**
             * [🔱] THE SYNAPTIC ASCENSION
             * We use the 'mimir' client to think. 
             * This works whether we are in an MCP server or a standalone CLI process.
             */
            const raw = await mimir.think(prompt, "You are the Corvus Star Intelligence Oracle. Analyze code structure and provide semantic intents as raw JSON.");

            if (!raw) throw new Error('One Mind is silent.');
            
            return this.parseResponse(raw, items);
        } catch (err: any) {
            console.error(chalk.yellow(`[WARNING] Synaptic Strike failed: ${err.message}. Generating structural intents...`));
            return this.generateStructuralIntents(items);
        }
    }

    private generateStructuralIntents(items: { code: string, data: FileData }[]): { intent: string; interaction: string }[] {
        return items.map(item => {
            const name = path.basename(item.data.path);
            const exports = item.data.exports.join(', ') || 'internal logic';
            return {
                intent: `The \`${name}\` sector implements logic focusing on ${exports}.`,
                interaction: `Integrate via ${exports}. Follow the Linscott Standard.`
            };
        });
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
            return parsed.map((p) => ({
                intent: p.intent || '',
                interaction: p.interaction || ''
            }));
        }
        throw new Error('Malformed JSON array in response.');
    }
}

// Global Intelligence Provider
export const defaultProvider: IntelProvider = new SamplingProvider();
