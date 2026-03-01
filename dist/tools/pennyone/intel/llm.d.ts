import { FileData } from '../analyzer.js';
/**
 * LLM Provider Abstraction
 * Purpose: Generate one-sentence file intents.
 */
export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<string>;
}
export declare class MockProvider implements IntelProvider {
    getIntent(code: string, data: FileData): Promise<string>;
}
export declare class GeminiProvider implements IntelProvider {
    getIntent(code: string, data: FileData): Promise<string>;
}
export declare const defaultProvider: IntelProvider;
