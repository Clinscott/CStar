import path from 'node:path';

import type { FileData } from '../types.js';

/**
 * PennyOne semantic intent is a deterministic local projection of analyzer
 * metadata. It never routes through Mimir, OneMind, a host session, a model,
 * or a per-file requester fallback.
 */
export interface IntelProvider {
    getIntent(data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: FileData[]): Promise<Array<{ intent: string; interaction: string }>>;
}

export const OFFLINE_INTENT_PLACEHOLDER = 'Intelligence generation offline. See sector lore for details.';

function uniqueBounded(values: string[], limit: number): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .slice(0, limit);
}

export class LocalIntentProvider implements IntelProvider {
    public async getIntent(data: FileData): Promise<{ intent: string; interaction: string }> {
        const fileName = path.basename(data.path);
        const isDocumentation = data.path.endsWith('.md') || data.path.endsWith('.qmd');
        const exports = uniqueBounded(data.exports, 8);
        const imports = uniqueBounded(data.imports.map((entry) => entry.source), 5);
        const role = isDocumentation ? 'documentation and operating guidance' : 'runtime or tooling logic';
        const exportSummary = exports.length > 0
            ? ` It exposes ${exports.join(', ')}.`
            : ' It exposes no analyzer-detected public symbols.';
        const dependencySummary = imports.length > 0
            ? ` Its analyzer-detected dependencies include ${imports.join(', ')}.`
            : ' It has no analyzer-detected import dependencies.';

        return {
            intent: `${fileName} contains ${role} at ${data.path}.${exportSummary}${dependencySummary}`,
            interaction: exports.length > 0
                ? `Use the analyzer-detected exports from ${data.path}; inspect the file and its recorded dependencies before changing behavior.`
                : `Treat ${data.path} as an internal implementation surface; inspect callers and recorded dependencies before changing behavior.`,
        };
    }

    public async getBatchIntent(
        items: FileData[],
    ): Promise<Array<{ intent: string; interaction: string }>> {
        return Promise.all(items.map((item) => this.getIntent(item)));
    }
}

export const defaultProvider: IntelProvider = new LocalIntentProvider();
