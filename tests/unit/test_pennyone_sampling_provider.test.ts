import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SamplingProvider } from  '../../src/tools/pennyone/intel/llm.js';
import { createGungnirMatrix } from  '../../src/types/gungnir.js';

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
    it('parses host intelligence returned through the shared bridge', async () => {
        const provider = new SamplingProvider(async (request) => {
            assert.equal(request.source, 'pennyone:intel:batch-intent');
            return {
                provider: 'codex',
                text: `PREFACE\n[{"intent":"Intent one","interaction":"Interaction one"}]`,
                response: {
                    status: 'success',
                    raw_text: '[{"intent":"Intent one","interaction":"Interaction one"}]',
                    trace: {
                        correlation_id: 'pennyone-provider-test',
                        transport_mode: 'host_session',
                    },
                },
            };
        });

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
    });

    it('fails closed instead of inventing structural fallback intents', async () => {
        const provider = new SamplingProvider(async () => {
            throw new Error('Host bridge unavailable.');
        });

        await assert.rejects(
            provider.getBatchIntent([
                {
                    code: 'export const answer = 42;',
                    data: TEST_FILE_DATA,
                },
            ]),
            /PennyOne host intelligence failed: Host bridge unavailable\./i,
        );
    });
});
