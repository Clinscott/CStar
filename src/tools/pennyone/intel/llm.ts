import { FileData } from  '../types.js';
import { CortexLink } from  '../../../node/cortex_link.js';
import chalk from 'chalk';
import { requestHostText, type HostTextResult } from  '../../../core/host_intelligence.js';
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
    public constructor(
        private readonly hostTextInvoker: (request: {
            prompt: string;
            projectRoot: string;
            source: string;
            metadata?: Record<string, unknown>;
        }) => Promise<HostTextResult> = requestHostText,
    ) {}

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
            const { text: raw } = await this.hostTextInvoker({
                prompt,
                projectRoot: registry.getRoot(),
                source: 'pennyone:intel:batch-intent',
                metadata: {
                    file_count: items.length,
                },
            });
            return this.parseResponse(raw, items);
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
