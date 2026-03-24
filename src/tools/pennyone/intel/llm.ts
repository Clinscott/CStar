import { FileData } from  '../types.js';
import { CortexLink } from  '../../../node/cortex_link.js';
import chalk from 'chalk';
import path from 'node:path';
import { mimir } from  '../../../core/mimir_client.js';
import { registry } from  '../pathRegistry.js';

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
            
            // [🔱] THE ONE MIND SHIFT: Use Synapse DB for all scans
            const response = await mimir.request({
                prompt,
                caller: { source: 'pennyone:intel:batch-intent' },
                transport_mode: 'synapse_db',
                metadata: {
                    file_count: items.length,
                },
            });

            if (response.status !== 'success' || !response.raw_text) {
                throw new Error(response.error || 'The One Mind provided no intent data.');
            }

            return this.parseResponse(response.raw_text, items);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(chalk.red(`[ERROR] Synaptic Strike failed: ${message}`));
            throw new Error(`PennyOne host intelligence failed: ${message}`);
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
                const item = items[idx];
                const fileName = path.basename(item.data.path);
                const defaultIntent = `The ${fileName} sector implements logic focusing on ${item.data.exports.join(', ') || 'internal systems'}.`;
                return {
                    intent: p.intent || defaultIntent,
                    interaction: p.interaction || 'Standard interaction protocol.'
                };
            });
        }
        throw new Error('Malformed JSON array in response.');
    }
}

// Global Intelligence Provider
export const defaultProvider: IntelProvider = new SamplingProvider();
