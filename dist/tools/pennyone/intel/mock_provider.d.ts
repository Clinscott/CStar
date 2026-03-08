import { FileData } from '../types.js';
import { IntelProvider } from './llm.js';
/**
 * Mock Intelligence Provider
 * Purpose: Fast-path intent generation for testing and rapid visualization.
 * Mandate: Provide plausible "Synthetic Lore" without API overhead.
 */
export declare class MockProvider implements IntelProvider {
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
