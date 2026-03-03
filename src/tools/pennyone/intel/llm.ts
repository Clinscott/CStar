import { FileData } from '../analyzer.ts';
import { CortexLink } from '../../../node/cortex_link.ts';

/**
 * LLM Provider Abstraction
 * Purpose: Generate one-sentence file intents.
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
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
}

export class GeminiProvider implements IntelProvider {
    private cortex: CortexLink;

    constructor() {
        this.cortex = new CortexLink();
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        if (process.env.GEMINI_CLI_ACTIVE === 'true') {
            const query = `Analyze '${data.path}' and provide:
                        1. INTENT: 2-3 sentences on what it does, why it exists, and its architectural role.
                        2. INTERACTION: 1-2 sentences on how an agent or another module should interact with it (entry points, required context, calling conventions).
                        
                        Exports: ${data.exports.join(', ')}. 
                        Complexity: ${data.complexity}.
                        Code Preview: ${code.slice(0, 800)}`;

            try {
                // [Ω] Use the Oracle Handshake for intelligence
                const res = await this.cortex.sendCommand('ask', [query, data.path]);
                
                // If it's a structural scan, the Oracle might want to handle this differently.
                // For now, we attempt to parse the response as JSON.
                if (res && res.status === 'success') {
                    const raw = (res.data as any)?.raw || '';
                    try {
                        const parsed = JSON.parse(raw);
                        return { 
                            intent: parsed.intent || 'Archived intelligence.', 
                            interaction: parsed.interaction || 'Standard operational protocols apply.' 
                        };
                    } catch {
                        return { intent: raw, interaction: 'Analyze source for calling conventions.' };
                    }
                }
            } catch (err) {
                console.warn(`[PENNYONE] Oracle uplink failed for ${data.path}. Falling back to mocks.`);
            }
        }

        return new MockProvider().getIntent(code, data);
    }
}

// Prioritize GeminiProvider if integrated
export const defaultProvider: IntelProvider = process.env.GEMINI_CLI_ACTIVE === 'true'
    ? new GeminiProvider()
    : new MockProvider();

