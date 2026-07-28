import test from 'node:test';
import assert from 'node:assert';
import { multiply } from '../../src/node/core/runtime/math_utils.js';

test('multiply function', async (t) => {
    await t.test('should multiply two numbers correctly', () => {
        assert.strictEqual(multiply(2, 5), 10);
    });

    await t.test('should handle negative numbers correctly', () => {
        assert.strictEqual(multiply(-3, 4), -12);
    });

    await t.test('should handle zero correctly', () => {
        assert.strictEqual(multiply(0, 100), 0);
    });
});
