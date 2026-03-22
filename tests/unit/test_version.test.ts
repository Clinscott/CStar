import test from 'node:test';
import assert from 'node:assert';
import { CSTAR_VERSION } from '../../src/node/core/runtime/version.js';

test('CSTAR_VERSION is correct', () => {
  assert.strictEqual(CSTAR_VERSION, '0.1.0');
});
