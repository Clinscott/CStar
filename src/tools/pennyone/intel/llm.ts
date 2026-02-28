import { FileData } from '../analyzer.js';

/**
 * LLM Provider Abstraction
 * Purpose: Generate one-sentence file intents.
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<string>;
}

export class MockProvider implements IntelProvider {
    async getIntent(code: string, data: FileData): Promise<string> {
        // [ALFRED] Improved heuristic intent generation
        const filename = data.path.split(/[\\\/]/).pop() || "";
        
        if (data.path.endsWith('.py')) {
            if (data.exports.some(e => e.includes('Warden'))) return "Autonomous neural guardian monitoring system drift and anomalies.";
            if (data.exports.some(e => e.includes('Engine'))) return "Core semantic routing engine for intent resolution.";
            return `Python module facilitating ${data.exports.slice(0, 2).join(', ') || 'internal logic'}.`;
        }

        if (data.path.endsWith('.tsx') || data.path.endsWith('.jsx')) {
            return `React component rendering ${filename.replace(/\..*$/, '')} with ${data.complexity} logic branches.`;
        }

        if (data.path.endsWith('.qmd') || data.path.endsWith('.md')) {
            return "Documentation scroll or workflow directive for the Gungnir Calculus.";
        }

        // Fallback
        if (code.includes('parseCode')) return "Orchestrates Babel AST parsing for the static analysis engine.";
        if (code.includes('calculateLogicScore')) return "Calculates structural logic density using CC and nesting metrics.";
        
        return "A functional component of the Corvus Star static analysis matrix.";
    }
}

// [Ω] Gemini CLI Integration: Intelligence Layer
export class GeminiProvider implements IntelProvider {
    async getIntent(code: string, data: FileData): Promise<string> {
        if (process.env.GEMINI_CLI_ACTIVE === 'true') {
            const directive = {
                type: "LLM_REQUEST",
                persona: "ALFRED",
                query: `Summarize the intent of '${data.path}' in exactly one professional sentence. 
                        Exports: ${data.exports.join(', ')}. 
                        Complexity: ${data.complexity}.
                        Code Preview: ${code.slice(0, 500)}`,
                system_prompt: "You are ALFRED, the Lead Engineer. Provide a concise intent summary for a 3D matrix visualization."
            };
            
            // Output for Gemini CLI to intercept
            console.log(`\n[GEMINI_DIRECTIVE]\n${JSON.stringify(directive)}\n[/GEMINI_DIRECTIVE]`);
            
            return "Intelligence requested via Gemini CLI...";
        }
        
        const mock = new MockProvider();
        return mock.getIntent(code, data);
    }
}

// Prioritize GeminiProvider if integrated
export const defaultProvider: IntelProvider = process.env.GEMINI_CLI_ACTIVE === 'true' 
    ? new GeminiProvider() 
    : new MockProvider();
