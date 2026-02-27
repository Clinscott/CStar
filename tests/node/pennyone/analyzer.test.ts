import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeFile } from '../../../src/tools/pennyone/analyzer.js';

test('analyzeFile extracts metrics correctly', () => {
    const code = `
    import { foo as bar } from 'baz';
    export const x = 10;
    if (x > 5) {
      console.log('hello');
    }
  `;
    const result = analyzeFile(code, 'test.ts');

    assert.strictEqual(result.loc, 5); // import, export, if, console, empty line
    assert.strictEqual(result.complexity, 2); // Base 1 + IfStatement

    // Verify aliased import
    const imp = result.imports.find(i => i.source === 'baz');
    assert.ok(imp);
    assert.strictEqual(imp.local, 'bar');
    assert.strictEqual(imp.imported, 'foo');

    // Verify export
    assert.ok(result.exports.includes('x'));
});

test('analyzeFile handles complex logic and nesting', () => {
    const code = `
    function complex() {
      if (true) {
        if (false) {
          while(true) {
            switch(x) {
              case 1: break;
            }
          }
        }
      }
    }
  `;
    const result = analyzeFile(code, 'test.ts');
    // if + if + while + switch + case = 5 Decision Points + 1 Base = 5 Complexity
    assert.strictEqual(result.complexity, 5);
});
