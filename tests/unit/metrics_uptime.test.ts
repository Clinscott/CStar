import test from 'node:test';
import assert from 'node:assert';
import { getUptime } from '../../src/node/core/runtime/metrics.js';

test('getUptime returns numeric seconds', () => {
  const uptime = getUptime();
  assert.strictEqual(typeof uptime, 'number');
  assert.ok(uptime >= 0);
});