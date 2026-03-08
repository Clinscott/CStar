import { FileData } from '../analyzer.js';
/**
 * LLM Provider Abstraction
 * Purpose: Generate high-fidelity, agentic file intents.
 * Mandate: ONE MIND SYNERGY (AGENTS.qmd Section 15).
 */
export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{
        intent: string;
        interaction: string;
    }>;
    getBatchIntent(items: {
        code: string;
        data: FileData;
    }[]): Promise<{
        intent: string;
        interaction: string;
    }[]>;
}
/**
 * SamplingProvider: Leverages the MCP Host (the active LLM) directly.
 * This is the "One Mind" standard.
 */
export declare class SamplingProvider implements IntelProvider {
    private static mcpServer;
    static registerServer(server: any): void;
    getIntent(code: string, data: FileData): Promise<{
        intent: string;
        interaction: string;
    }>;
    getBatchIntent(items: {
        code: string;
        data: FileData;
    }[]): Promise<{
        intent: string;
        interaction: string;
    }[]>;
    private consultDaemon;
    private parseResponse;
}
export declare const defaultProvider: IntelProvider;
