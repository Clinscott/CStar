import { multiply } from '../../src/node/core/runtime/math_utils.js';

describe('multiply function', () => {
    test('should multiply two numbers correctly', () => {
        expect(multiply(2, 5)).toBe(10);
    });

    test('should handle negative numbers correctly', () => {
        expect(multiply(-3, 4)).toBe(-12);
    });

    test('should handle zero correctly', () => {
        expect(multiply(0, 100)).toBe(0);
    });
});