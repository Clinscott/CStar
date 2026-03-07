import { FileData } from '../types.js';
import { CortexLink } from '../../../node/cortex_link.js';
import chalk from 'chalk';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

/**
 * LLM Provider Abstraction
 * Purpose: Generate high-fidelity, agentic file intents.
 * Mandate: ONE MIND SYNERGY (AGENTS.qmd Section 15). 
 * Upgrade: Model choice decoupled from code, environment-aware.
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

/**
 * SamplingProvider: Leverages the Direct SDK Strike (The One Mind) or fallback Synaptic Link.
 */
export class SamplingProvider implements IntelProvider {
    private static mcpServer: any = null;
    private ai: GoogleGenAI;
    // [Ω] DECOUPLING: Model choice is derived from the environment
    private defaultModel: string = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    constructor() {
        this.ai = new GoogleGenAI({});
    }

    static registerServer(server: any) {
        this.mcpServer = server;
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (items.length === 0) return [];

        // [🔱] THE ONE MIND: Direct SDK Strike (Unified Syntax)
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
            console.error(chalk.cyan(`[ALFRED] Requesting Direct SDK Strike for ${items.length} sectors...`));
            
            const result = await this.ai.models.generateContent({
                model: this.defaultModel,
                contents: prompt,
                config: {
                    systemInstruction: "You are the Corvus Star Intelligence Oracle. Analyze code structure and workflows, then provide semantic intents as a raw JSON array of objects."
                }
            });

            const raw = result.text || '';
            return this.parseResponse(raw, items);
        } catch (err: any) {
            console.error(chalk.yellow(`[WARNING] Direct SDK Strike failed: ${err.message}. Falling back to Synaptic Link.`));
        }

        // [🔱] THE SYNAPTIC LINK: Fallback to Python Daemon (Oracle) for standalone CLI processes
        return await this.consultDaemon(items);
    }

    private async consultDaemon(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
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
                const raw = (res.data as any)?.raw || '';
                
                // [Ω] SYNAPTIC LOOP DETECTION: If the daemon returned a recursion guard message, we must fallback
                if (raw.includes('Recursive sampling blocked.')) {
                    throw new Error('Synaptic Loop: Host is already busy thinking.');
                }

                return this.parseResponse(raw, items);
            }
            throw new Error((res as any)?.message || 'Oracle communication failure.');
        } catch (err: any) {
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

// Global Intelligence Provider (Context-aware Sampling)
export const defaultProvider: IntelProvider = new SamplingProvider();
