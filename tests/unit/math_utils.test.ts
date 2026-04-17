import test from 'node:test';
import assert from 'node:assert';
import { multiply } from '../../src/node/core/runtime/math_utils.js';

test('multiply function', (t) => {
    t.test('should multiply two numbers correctly', () => {
        assert.strictEqual(multiply(2, 5), 10);
    });

    t.test('should handle negative numbers correctly', () => {
        assert.strictEqual(multiply(-3, 4), -12);
    });

    t.test('should handle zero correctly', () => {
        assert.strictEqual(multiply(0, 100), 0);
    });
});
