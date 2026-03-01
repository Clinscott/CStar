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
        const filename = data.path.split(/[\\/]/).pop() || '';

        if (data.path.endsWith('.py')) {
            if (data.exports.some(e => e.includes('Warden'))) return 'Autonomous neural guardian monitoring system drift and anomalies. It exists to enforce strict operational parameters and prevent structural decay. Its role in the system is to act as an automated oversight mechanism during flight cycles.';
            if (data.exports.some(e => e.includes('Engine'))) return 'Core semantic routing engine for intent resolution. It exists to map unstructured user inputs to distinct execution pathways. Its role in the system is to serve as the primary cognitive junction between natural language and operational logic.';
            return `Python module facilitating ${data.exports.slice(0, 2).join(', ') || 'internal logic'}. It exists to support broader Python integration routines. Its role in the system is to provide foundational utilities for script execution.`;
        }

        if (data.path.endsWith('.tsx') || data.path.endsWith('.jsx')) {
            return `React component rendering ${filename.replace(/\..*$/, '')} with ${data.complexity} logic branches. It exists to provide a responsive interface element for real-time telemetry. Its role in the system is to project background Daemon activity into the visual Sovereign HUD plane.`;
        }

        if (data.path.endsWith('.qmd') || data.path.endsWith('.md')) {
            return 'Documentation scroll or workflow directive for the Gungnir Calculus. It exists to codify system lore, architectural constraints, and standard operating procedures. Its role in the system is to provide persistent context to autonomous agents like ALFRED and ODIN.';
        }

        // Fallback
        if (code.includes('parseCode')) return 'Orchestrates Babel AST parsing for the static analysis engine. It exists to decompose raw source files into measurable syntactic graphs. Its role in the system is to feed analytical telemetry to the PennyOne intelligence layer.';
        if (code.includes('calculateLogicScore')) return 'Calculates structural logic density using CC and nesting metrics. It exists to quantify the cognitive load required to maintain specific modules. Its role in the system is to drive the architectural discipline enforced by the Linscott Standard.';

        return 'A functional component of the Corvus Star static analysis matrix. It exists to support the broader ecosystem of system telemetry. Its role in the system is to provide foundational operational logic.';
    }
}

// [Ω] Gemini CLI Integration: Intelligence Layer
export class GeminiProvider implements IntelProvider {
    async getIntent(code: string, data: FileData): Promise<string> {
        if (process.env.GEMINI_CLI_ACTIVE === 'true') {
            const directive = {
                type: 'LLM_REQUEST',
                persona: 'ALFRED',
                query: `Summarize the intent of '${data.path}' in a comprehensive 2-3 sentence architectural summary. 
                        Explain what the code does, why it exists, and its overall role in the local system architecture.
                        Exports: ${data.exports.join(', ')}. 
                        Complexity: ${data.complexity}.
                        Code Preview: ${code.slice(0, 500)}`,
                system_prompt: 'You are ALFRED, the Lead Engineer. Provide a comprehensive 2-3 sentence architectural intent summary that explains the \'what\', \'why\', and \'role\' for a 3D matrix visualization context.'
            };

            // Output for Gemini CLI to intercept
            console.log(`\n[GEMINI_DIRECTIVE]\n${JSON.stringify(directive)}\n[/GEMINI_DIRECTIVE]`);

            return 'Intelligence requested via Gemini CLI...';
        }

        const mock = new MockProvider();
        return mock.getIntent(code, data);
    }
}

// Prioritize GeminiProvider if integrated
export const defaultProvider: IntelProvider = process.env.GEMINI_CLI_ACTIVE === 'true'
    ? new GeminiProvider()
    : new MockProvider();
