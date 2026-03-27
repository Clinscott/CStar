import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as contracts from  '../../../src/node/core/runtime/contracts.js';

describe('contracts', () => {
    test('should be importable', () => {
        assert.ok(contracts !== undefined);
    });

    test('exports explicit capability tier and spell classification constants', () => {
        assert.deepStrictEqual(contracts.CAPABILITY_TIERS, ['PRIME', 'SKILL', 'WEAVE', 'SPELL']);
        assert.deepStrictEqual(contracts.SPELL_CLASSIFICATIONS, ['runtime-backed', 'policy-only', 'deprecated']);
    });
});
