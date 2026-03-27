import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SamplingProvider } from  '../../src/tools/pennyone/intel/llm.js';
import { createGungnirMatrix } from  '../../src/types/gungnir.js';
import type { IntelligenceRequest } from '../../src/types/intelligence-contract.js';

const TEST_FILE_DATA = {
    path: 'src/answer.ts',
    loc: 1,
    complexity: 1,
    matrix: createGungnirMatrix({ logic: 7, style: 7, intel: 7 }),
    imports: [],
    exports: ['answer'],
    hash: 'test-hash',
};

describe('PennyOne sampling provider (CS-P1-02)', () => {
    it('uses a direct host-session request for semantic intent when an interactive host session has no broker', async () => {
        const requests: IntelligenceRequest[] = [];
        const provider = new SamplingProvider(async (request) => {
            requests.push(request);
            assert.equal(request.caller?.source, 'pennyone:intel:batch-intent');
            assert.equal(request.transport_mode, 'host_session');
            return {
                status: 'success',
                raw_text: '[{"intent":"Intent one","interaction":"Interaction one"}]',
                trace: {
                    correlation_id: 'pennyone-provider-test',
                    transport_mode: 'host_session',
                },
            };
        }, { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' });

        const results = await provider.getBatchIntent([
            {
                code: 'export const answer = 42;',
                data: TEST_FILE_DATA,
            },
        ]);

        assert.deepStrictEqual(results, [
            {
                intent: 'Intent one',
                interaction: 'Interaction one',
            },
        ]);
        assert.equal(requests.length, 1);
    });

    it('falls back to per-file intelligence requests when the batch request fails in an active host session', async () => {
        const calls: Array<{ source: string; transport: string | undefined; sectorPath?: string }> = [];
        const provider = new SamplingProvider(async (request) => {
            calls.push({
                source: request.caller?.source ?? 'unknown',
                transport: request.transport_mode,
                sectorPath: request.caller?.sector_path,
            });
            if (request.caller?.source === 'pennyone:intel:batch-intent') {
                throw new Error('Batch bridge timeout.');
            }

            return {
                status: 'success',
                raw_text: JSON.stringify({
                    intent: `Intent for ${request.caller?.sector_path}`,
                    interaction: 'Direct file subagent protocol.',
                }),
                trace: {
                    correlation_id: 'pennyone-provider-single-file',
                    transport_mode: 'host_session',
                },
            };
        }, { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' });

        const results = await provider.getBatchIntent([
            {
                code: 'export const answer = 42;',
                data: TEST_FILE_DATA,
            },
            {
                code: 'export const ask = () => 41 + 1;',
                data: {
                    ...TEST_FILE_DATA,
                    path: 'src/ask.ts',
                    exports: ['ask'],
                },
            },
        ]);

        assert.deepStrictEqual(results, [
            {
                intent: 'Intent for src/answer.ts',
                interaction: 'Direct file subagent protocol.',
            },
            {
                intent: 'Intent for src/ask.ts',
                interaction: 'Direct file subagent protocol.',
            },
        ]);
        assert.deepStrictEqual(calls.map((call) => call.source), [
            'pennyone:intel:batch-intent',
            'pennyone:intel:file-intent',
            'pennyone:intel:file-intent',
        ]);
        assert.ok(calls.every((call) => call.transport === 'host_session' || call.transport === 'auto'));
    });

    it('uses the synapse bus when an interactive broker is explicitly configured', async () => {
        const requests: IntelligenceRequest[] = [];
        const provider = new SamplingProvider(async (request) => {
            requests.push(request);
            return {
                status: 'success',
                raw_text: '[{"intent":"Intent one","interaction":"Interaction one"}]',
                trace: {
                    correlation_id: 'pennyone-provider-broker-test',
                    transport_mode: 'synapse_db',
                },
            };
        }, { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1', CORVUS_ONE_MIND_BROKER_ACTIVE: '1' });

        await provider.getBatchIntent([
            {
                code: 'export const answer = 42;',
                data: TEST_FILE_DATA,
            },
        ]);

        assert.equal(requests[0]?.transport_mode, 'synapse_db');
    });

    it('degrades to deterministic local summaries when host intelligence is unavailable', async () => {
        const provider = new SamplingProvider(async () => {
            throw new Error('Host bridge unavailable.');
        }, {});

        const [result] = await provider.getBatchIntent([
            {
                code: 'export const answer = 42;',
                data: TEST_FILE_DATA,
            },
        ]);

        assert.match(result.intent, /answer\.ts sector captures runtime or tooling logic/i);
        assert.match(result.interaction, /local authority surface/i);
    });
});
