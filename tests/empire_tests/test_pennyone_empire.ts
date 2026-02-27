import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateLogicScore } from '../../src/tools/pennyone/calculus/logic.js';
import { calculateStyleScore } from '../../src/tools/pennyone/calculus/style.js';
import { calculateIntelScore } from '../../src/tools/pennyone/calculus/intel.js';
import { analyzeFile } from '../../src/tools/pennyone/analyzer.js';

describe('PennyOne: Empire Gungnir Matrix Sensors', () => {
    describe('Logic Sensor (L)', () => {
        it('should reward linear, simple code with high scores', () => {
            const score = calculateLogicScore(1, 1, 10);
            assert.ok(score > 9, `Expected score > 9, got ${score}`);
        });

        it('should penalize complex logic and deep nesting', () => {
            const score = calculateLogicScore(25, 8, 100);
            assert.strictEqual(score, 1, 'Extremely complex code should be 1');
        });
    });

    describe('Style Sensor (S)', () => {
        it('should reward symmetrical, well-spaced code', () => {
            const goodCode = "const x = 1;\n\nconst y = 2;";
            const score = calculateStyleScore(goodCode);
            assert.strictEqual(score, 10);
        });

        it('should detect and penalize claustrophobic logic blocks', () => {
            // 20 lines of code without breaks
            const badCode = Array(20).fill("console.log('breach');").join('\n');
            const score = calculateStyleScore(badCode);
            assert.ok(score < 5, `Expected score < 5 for claustrophobic block, got ${score}`);
        });

        it('should correctly measure Birkhoff O/C for UI components', () => {
            const badUI = '<div className="w-[10px] m-[1px] p-[2px] h-[3px]">Breach</div>';
            const goodUI = '<div className="flex items-center p-4 mx-auto">Harmony</div>';

            const badScore = calculateStyleScore(badUI);
            const goodScore = calculateStyleScore(goodUI);
            assert.ok(goodScore > badScore, `Good UI (${goodScore}) should score higher than Bad UI (${badScore})`);
        });
    });

    describe('Intel Sensor (I)', () => {
        it('should reward high comment-to-LOC ratios', () => {
            const undocumented = "const x = 1;";
            const documented = "/** Documentation */\nconst x = 1;";

            const lowScore = calculateIntelScore(undocumented, 1);
            const highScore = calculateIntelScore(documented, 2);
            assert.ok(highScore > lowScore);
        });
    });
});

describe('PennyOne: Empire Analysis Engine', () => {
    it('should correctly build the nested GungnirMatrix object', () => {
        const code = "export const x = 1;";
        const result = analyzeFile(code, 'test.ts');

        assert.ok(result.matrix, 'Matrix object should exist');
        assert.ok(result.matrix.logic > 0);
        assert.ok(result.matrix.style > 0);
        assert.ok(result.matrix.intel > 0);
        assert.ok(result.matrix.overall > 0);
    });

    it('should handle aliased imports and exports rigorously', () => {
        const code = `
            import { foo as bar } from './module';
            export { bar as baz };
        `;
        const result = analyzeFile(code, 'test.ts');

        assert.deepStrictEqual(result.imports[0], { source: './module', local: 'bar', imported: 'foo' });
        assert.ok(result.exports.includes('baz'));
    });
});
