import { test } from 'node:test';
import assert from 'node:assert';
import { calculateLogicScore } from '../../../src/core/calculus/logic.js';
import { calculateStyleScore } from '../../../src/core/calculus/style.js';
import { calculateIntelScore } from '../../../src/core/calculus/intel.js';

test('calculateLogicScore scales correctly', () => {
    // Pure linear code
    const simple = calculateLogicScore(1, 1, 10);
    assert.strictEqual(simple, 9.2);

    // Complex code
    const complex = calculateLogicScore(20, 6, 100);
    assert.strictEqual(complex, 1);
});

test('calculateStyleScore detects claustrophobia', () => {
    const goodCode = `
    const x = 1;
    
    const y = 2;
  `;
    assert.strictEqual(calculateStyleScore(goodCode), 10);

    const badCode = "x = 1;\n".repeat(15);
    assert.strictEqual(calculateStyleScore(badCode), 4); // Three lines of breach (13,14,15) = -6
});

test('calculateIntelScore rewards documentation', () => {
    const opaqueCode = "const x = 1;";
    const lowScore = calculateIntelScore(opaqueCode, 1);

    const transparentCode = `
    /** This is documented */
    const x = 1;
  `;
    const highScore = calculateIntelScore(transparentCode, 2);
    assert.ok(highScore > lowScore);
});
