import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as contracts from '../../../src/node/core/runtime/contracts.ts';

describe('contracts', () => {
    test('should be importable', () => {
        // Since this file only has types, it will be empty at runtime.
        assert.ok(contracts !== undefined);
    });
});
