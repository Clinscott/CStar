import { FileData } from '../analyzer.ts';
import { CortexLink } from '../../../node/cortex_link.ts';

/**
 * LLM Provider Abstraction
 * Purpose: Generate one-sentence file intents.
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

export class MockProvider implements IntelProvider {
    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        const filename = data.path.split(/[\\/]/).pop() || '';
        let intent = 'A functional component of the Corvus Star static analysis matrix.';
        let interaction = 'Import and utilize via the standard project structure.';

        if (data.path.endsWith('.py')) {
            if (data.exports.some(e => e.includes('Warden'))) {
                intent = 'Autonomous neural guardian monitoring system drift and anomalies.';
                interaction = 'Instantiate the Warden class and call evaluate(graph) with a compiled matrix graph.';
            } else if (data.exports.some(e => e.includes('Engine'))) {
                intent = 'Core semantic routing engine for intent resolution.';
                interaction = 'Instantiate SovereignEngine and invoke run(query) to process natural language directives.';
            } else {
                intent = `Python module facilitating ${data.exports.slice(0, 2).join(', ') || 'internal logic'}.`;
                interaction = `Import ${data.exports[0] || 'module'} and call its primary methods.`;
            }
        } else if (data.path.endsWith('.tsx') || data.path.endsWith('.jsx')) {
            intent = `React component rendering ${filename.replace(/\..*$/, '')}.`;
            interaction = `Include <${filename.replace(/\..*$/, '')} /> within a React-Three-Fiber Canvas context.`;
        }

        return { intent, interaction };
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        return Promise.all(items.map(i => this.getIntent(i.code, i.data)));
    }
}

export class GeminiProvider implements IntelProvider {
    private cortex: CortexLink;

    constructor() {
        this.cortex = new CortexLink();
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (process.env.GEMINI_CLI_ACTIVE === 'true' && items.length > 0) {
            const batchQuery = items.map((item, idx) => `
                FILE ${idx}: '${item.data.path}'
                Exports: ${item.data.exports.join(', ')}
                Complexity: ${item.data.complexity}
                Preview: ${item.code.slice(0, 300)}
            `).join('\n---\n');

            const query = `Analyze the following ${items.length} files and provide a JSON array of objects, each with "intent" (2-3 sentences) and "interaction" (1-2 sentences) fields. Match the order of the input files exactly.
            
            FILES:
            ${batchQuery}`;

            try {
                const res = await this.cortex.sendCommand('ask', [query, 'BATCH_ANALYSIS']);
                if (res && res.status === 'success') {
                    const raw = (res.data as any)?.raw || '';
                    try {
                        const parsed = JSON.parse(raw.substring(raw.indexOf('['), raw.lastIndexOf(']') + 1));
                        if (Array.isArray(parsed)) {
                            return parsed.map(p => ({
                                intent: p.intent || 'Archived intelligence.',
                                interaction: p.interaction || 'Standard operational protocols apply.'
                            }));
                        }
                    } catch (e) {
                        console.warn('[PENNYONE] Batch JSON parse failed, falling back to individual mocks.');
                    }
                }
            } catch (err) {
                console.warn(`[PENNYONE] Batch Oracle uplink failed. Falling back to mocks.`);
            }
        }

        const mock = new MockProvider();
        return Promise.all(items.map(i => mock.getIntent(i.code, i.data)));
    }
}

// Prioritize GeminiProvider if integrated
export const defaultProvider: IntelProvider = process.env.GEMINI_CLI_ACTIVE === 'true'
    ? new GeminiProvider()
    : new MockProvider();

