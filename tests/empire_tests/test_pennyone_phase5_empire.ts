import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeFile } from '../../src/tools/pennyone/analyzer.js';

describe('PennyOne Phase 5: Polyglot Extraction', async () => {
    it('should correctly analyze a TypeScript file using Tree-sitter', async () => {
        const tsCode = `
            import { run } from './agent';
            export function main() {
                if (true) {
                    console.log("TS Active");
                }
            }
        `;
        const result = await analyzeFile(tsCode, 'test.ts');
        assert.strictEqual(result.loc, 6, 'Should count 6 lines of code in TS');
        assert.strictEqual(result.complexity, 2, 'Should detect 1 if_statement + base complexity');
        assert.ok(result.imports.length > 0, 'Should detect TS imports');
        assert.ok(result.exports.includes('main'), 'Should detect TS exports');
    });

    it('should correctly analyze a Python file using Tree-sitter', async () => {
        const pyCode = `
import os
from cortex import flow

def analyze_sector():
    # This is a comment
    if os.path.exists("."):
        print("Python Sector Active")

class Warden:
    pass
        `;
        const result = await analyzeFile(pyCode, 'test.py');
        assert.strictEqual(result.loc, 7, 'Should count 7 lines of code in Python (ignoring comment)');
        assert.strictEqual(result.complexity, 2, 'Should detect 1 if_statement + base complexity');
        assert.strictEqual(result.imports.length, 2, 'Should detect 2 Python imports');
        assert.ok(result.exports.includes('analyze_sector'), 'Should detect Python function as export');
        assert.ok(result.exports.includes('Warden'), 'Should detect Python class as export');
    });

    it('should correctly handle comments in both languages (The Comment Trap)', async () => {
        const tsWithComments = `
            const x = 1; // TS Comment
            /* Block
               Comment */
            const y = 2;
        `;
        const pyWithComments = `
x = 1 # Python Comment
def f():
    pass
        `;

        const tsResult = await analyzeFile(tsWithComments, 'test.ts');
        const pyResult = await analyzeFile(pyWithComments, 'test.py');

        assert.strictEqual(tsResult.loc, 2, 'TS LOC should be 2');
        assert.strictEqual(pyResult.loc, 3, 'Python LOC should be 3');
    });
});
