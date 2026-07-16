import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SamplingProvider,
} from '../../src/tools/pennyone/intel/llm.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../src/core/host_delegation.js';
import { createGungnirMatrix } from '../../src/types/gungnir.js';

const TEST_FILE_DATA = {
    path: 'src/answer.ts',
    loc: 1,
    complexity: 1,
    matrix: createGungnirMatrix({ logic: 7, style: 7, intel: 7 }),
    imports: [],
    exports: ['answer'],
    hash: 'synthetic-hash',
};

describe('retired PennyOne sampling compatibility', () => {
    it('uses a deterministic local projection without invoking the supplied model callback', async () => {
        let callbackCalls = 0;
        const provider = new SamplingProvider(async () => {
            callbackCalls += 1;
            throw new Error('must not run');
        }, { SYNTHETIC_SECRET: 'must-not-be-read' });
        const [result] = await provider.getBatchIntent([{
            code: 'export const answer = 42;',
            data: TEST_FILE_DATA,
        }]);
        assert.match(result.intent, /answer\.ts/);
        assert.match(result.intent, /src\/answer\.ts/);
        assert.equal(result.interaction, RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
        assert.equal(callbackCalls, 0);
    });

    it('returns an empty result for an empty batch', async () => {
        assert.deepEqual(await new SamplingProvider().getBatchIntent([]), []);
    });
});
