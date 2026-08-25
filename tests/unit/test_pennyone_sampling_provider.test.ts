import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { LocalIntentProvider } from '../../src/tools/pennyone/intel/llm.js';
import { createGungnirMatrix } from '../../src/types/gungnir.js';

const TEST_FILE_DATA = {
    path: 'src/answer.ts',
    loc: 1,
    complexity: 1,
    matrix: createGungnirMatrix({ logic: 7, style: 7, intel: 7 }),
    imports: [{ source: './math.js', local: 'sum', imported: 'sum' }],
    exports: ['answer'],
    hash: 'test-hash',
};

describe('PennyOne deterministic local intent provider (CS-P1-02)', () => {
    it('derives repeatable intent from bounded analyzer metadata only', async () => {
        const provider = new LocalIntentProvider();
        const first = await provider.getIntent(TEST_FILE_DATA);
        const second = await provider.getIntent({ ...TEST_FILE_DATA });

        assert.deepStrictEqual(first, second);
        assert.match(first.intent, /answer\.ts contains runtime or tooling logic/i);
        assert.match(first.intent, /It exposes answer\./);
        assert.match(first.intent, /\.\/math\.js/);
        assert.match(first.interaction, /analyzer-detected exports/i);
    });

    it('does not contain a Mimir, OneMind, host, model, requester, or prompt path', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'tools', 'pennyone', 'intel', 'llm.ts'),
            'utf8',
        );

        assert.doesNotMatch(source, /mimir_client|resolveOneMindDecision|requestHostText|requestIntelligence/);
        assert.doesNotMatch(source, /system_prompt|buildBatchPrompt|buildSingleFilePrompt|transport_mode/);
        assert.doesNotMatch(source, /requestPerFileIntents|single-file-fallback/i);
    });

    it('bounds metadata included in deterministic summaries', async () => {
        const provider = new LocalIntentProvider();
        const result = await provider.getIntent({
            ...TEST_FILE_DATA,
            imports: Array.from({ length: 50 }, (_, index) => ({
                source: `dependency-${index}`,
                local: `local-${index}`,
                imported: `import-${index}`,
            })),
            exports: Array.from({ length: 50 }, (_, index) => `export${index}`),
        });

        assert.equal((result.intent.match(/dependency-/g) ?? []).length, 5);
        assert.equal((result.intent.match(/export\d+/g) ?? []).length, 8);
    });
});
