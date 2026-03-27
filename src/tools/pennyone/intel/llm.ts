import type { FileData } from '../types.js';
import chalk from 'chalk';
import path from 'node:path';
import { mimir } from '../../../core/mimir_client.js';
import type { IntelligenceRequest, IntelligenceResponse } from '../../../types/intelligence-contract.js';
import { parseStructuredPayload } from '../../../types/intelligence-contract.js';
import { resolveOneMindDecision } from '../../../core/one_mind_bridge.js';

/**
 * LLM Provider Abstraction: THE ONE MIND CONDUIT
 * Purpose: Generate high-fidelity, agentic file intents via the Synaptic Link.
 * Mandate: NO API KEYS. (AGENTS.qmd).
 */

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

export const OFFLINE_INTENT_PLACEHOLDER = 'Intelligence generation offline. See sector lore for details.';

type IntelligenceRequester = (request: IntelligenceRequest) => Promise<IntelligenceResponse>;

const BATCH_INTENT_SYSTEM_PROMPT = [
    'You are the PennyOne semantic-intent subagent.',
    'Return strict JSON only.',
    'Output a JSON array with one object per input file, in the same order.',
    'Each object must contain:',
    '- "intent": 2-3 sentences explaining what the file is for in the estate.',
    '- "interaction": 1-2 sentences explaining how agents or adjacent systems should engage it.',
    'Do not include markdown, prefaces, or commentary outside the JSON array.',
].join('\n');

const FILE_INTENT_SYSTEM_PROMPT = [
    'You are the PennyOne semantic-intent subagent for a single file.',
    'Return strict JSON only.',
    'Output exactly one JSON object with keys "intent" and "interaction".',
    'Use the file path, exports, and code preview to infer the file role succinctly and concretely.',
    'Do not include markdown, prefaces, or commentary outside the JSON object.',
].join('\n');

/**
 * SamplingProvider: Leverages the Synaptic Link (mimir) to channel the Host Agent.
 */
export class SamplingProvider implements IntelProvider {
    private readonly requestIntelligence: IntelligenceRequester;
    private readonly env: NodeJS.ProcessEnv;

    public constructor(
        requestIntelligence: IntelligenceRequester = (request) => mimir.request(request),
        env: NodeJS.ProcessEnv = process.env,
    ) {
        this.requestIntelligence = requestIntelligence;
        this.env = env;
    }

    async getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    async getBatchIntent(items: { code: string, data: FileData }[]): Promise<{ intent: string; interaction: string }[]> {
        if (items.length === 0) {
            return [];
        }

        try {
            return await this.requestBatchIntent(items);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const route = this.resolveBatchRoute();
            if (route.boundary === 'primary') {
                console.error(chalk.yellow(`[WARNING] PennyOne batch intelligence failed: ${message}. Falling back to per-file intelligence requests.`));
                try {
                    return await this.requestPerFileIntents(items);
                } catch (perFileError) {
                    const perFileMessage = perFileError instanceof Error ? perFileError.message : String(perFileError);
                    console.error(chalk.yellow(`[WARNING] PennyOne per-file intelligence failed: ${perFileMessage}. Falling back to local deterministic summaries.`));
                    return items.map((item) => this.buildLocalFallbackIntent(item));
                }
            }

            console.error(chalk.yellow(`[WARNING] PennyOne intelligence degraded at delegated boundary: ${message}. Using local deterministic summaries.`));
            return items.map((item) => this.buildLocalFallbackIntent(item));
        }
    }

    private resolveBatchRoute() {
        return resolveOneMindDecision({
            prompt: 'PennyOne semantic intent batch request',
            transport_mode: 'auto',
            caller: { source: 'pennyone:intel:batch-intent' },
            metadata: { intent_mode: 'batch' },
        }, this.env, {
            hostSessionActive: undefined,
        });
    }

    private async requestBatchIntent(
        items: { code: string, data: FileData }[],
    ): Promise<{ intent: string; interaction: string }[]> {
        const prompt = this.buildBatchPrompt(items);
        const decision = this.resolveBatchRoute();

        console.error(chalk.cyan(`[ALFRED] Requesting semantic intent for ${items.length} sector(s) via ${decision.transportMode}...`));

        const response = await this.requestIntelligence({
            prompt,
            system_prompt: BATCH_INTENT_SYSTEM_PROMPT,
            caller: { source: 'pennyone:intel:batch-intent' },
            transport_mode: decision.transportMode,
            metadata: {
                file_count: items.length,
                intent_mode: 'batch',
                one_mind_boundary: decision.boundary,
            },
        });

        if (response.status !== 'success' || !response.raw_text) {
            throw new Error(response.error || 'The One Mind provided no intent data.');
        }

        return this.parseBatchResponse(response.raw_text, items);
    }

    private async requestPerFileIntents(
        items: { code: string, data: FileData }[],
    ): Promise<{ intent: string; interaction: string }[]> {
        const results: { intent: string; interaction: string }[] = [];

        for (const item of items) {
            const prompt = this.buildSingleFilePrompt(item);
            const response = await this.requestIntelligence({
                prompt,
                system_prompt: FILE_INTENT_SYSTEM_PROMPT,
                caller: {
                    source: 'pennyone:intel:file-intent',
                    sector_path: item.data.path,
                },
                transport_mode: 'auto',
                metadata: {
                    file_count: 1,
                    intent_mode: 'single-file-fallback',
                    sector_path: item.data.path,
                    one_mind_boundary: 'primary',
                },
            });

            if (response.status !== 'success' || !response.raw_text) {
                throw new Error(response.error || `The One Mind provided no intent data for ${item.data.path}.`);
            }

            results.push(this.parseSingleResponse(response.raw_text, item));
        }

        return results;
    }

    private buildBatchPrompt(items: { code: string; data: FileData }[]): string {
        const batchQuery = items.map((item, idx) => {
            const isDoc = item.data.path.endsWith('.md') || item.data.path.endsWith('.qmd');
            const previewLen = isDoc ? 2000 : 500;
            return [
                `FILE ${idx}: '${item.data.path}'`,
                `Type: ${isDoc ? 'Documentation/Workflow' : 'Source Code'}`,
                `Exports: ${item.data.exports.join(', ') || '(none)'}`,
                `Imports: ${item.data.imports.map((entry) => entry.source).join(', ') || '(none)'}`,
                `Preview:`,
                item.code.slice(0, previewLen),
            ].join('\n');
        }).join('\n---\n');

        return `Analyze the following ${items.length} files and produce semantic intent JSON.\n\nFILES:\n${batchQuery}`;
    }

    private buildSingleFilePrompt(item: { code: string; data: FileData }): string {
        const isDoc = item.data.path.endsWith('.md') || item.data.path.endsWith('.qmd');
        const previewLen = isDoc ? 3000 : 1200;
        return [
            `FILE: '${item.data.path}'`,
            `Type: ${isDoc ? 'Documentation/Workflow' : 'Source Code'}`,
            `Exports: ${item.data.exports.join(', ') || '(none)'}`,
            `Imports: ${item.data.imports.map((entry) => entry.source).join(', ') || '(none)'}`,
            'Preview:',
            item.code.slice(0, previewLen),
        ].join('\n');
    }

    private buildDefaultIntent(item: { data: FileData }): string {
        const fileName = path.basename(item.data.path);
        return `The ${fileName} sector implements logic focusing on ${item.data.exports.join(', ') || 'internal systems'}.`;
    }

    private buildLocalFallbackIntent(
        item: { code: string; data: FileData },
    ): { intent: string; interaction: string } {
        const fileName = path.basename(item.data.path);
        const importSources = item.data.imports.map((entry) => entry.source).filter(Boolean);
        const importPhrase = importSources.length > 0
            ? ` It collaborates with ${importSources.slice(0, 3).join(', ')}.`
            : '';
        const modality = item.data.path.endsWith('.md') || item.data.path.endsWith('.qmd')
            ? 'documentation and operating guidance'
            : 'runtime or tooling logic';
        const exportPhrase = item.data.exports.length > 0
            ? `Key exports: ${item.data.exports.join(', ')}.`
            : 'It primarily coordinates internal behavior without a large exported API.';

        return {
            intent: `The ${fileName} sector captures ${modality} for ${item.data.path}.${importPhrase} ${exportPhrase}`.trim(),
            interaction: `Use ${item.data.path} as a local authority surface when host intelligence is unavailable, and rescan later for richer semantic intent.`,
        };
    }

    private materializeIntent(
        parsed: { intent?: string; interaction?: string } | null | undefined,
        item: { data: FileData },
    ): { intent: string; interaction: string } {
        return {
            intent: parsed?.intent || this.buildDefaultIntent(item),
            interaction: parsed?.interaction || 'Standard interaction protocol.',
        };
    }

    private parseSingleResponse(
        raw: string,
        item: { data: FileData },
    ): { intent: string; interaction: string } {
        const parsed = parseStructuredPayload(raw);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
            return this.materializeIntent(parsed[0] as { intent?: string; interaction?: string }, item);
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return this.materializeIntent(parsed as { intent?: string; interaction?: string }, item);
        }

        throw new Error(`Malformed JSON object in response for ${item.data.path}.`);
    }

    private parseBatchResponse(
        raw: string,
        items: { code: string; data: FileData }[],
    ): { intent: string; interaction: string }[] {
        const parsed = parseStructuredPayload(raw);
        if (!Array.isArray(parsed) || parsed.length !== items.length) {
            throw new Error('Malformed JSON array in response.');
        }

        return parsed.map((entry, idx) =>
            this.materializeIntent(
                entry && typeof entry === 'object' ? entry as { intent?: string; interaction?: string } : undefined,
                items[idx],
            ),
        );
    }
}

// Global Intelligence Provider
export const defaultProvider: IntelProvider = new SamplingProvider();
