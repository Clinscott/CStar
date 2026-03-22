import test from 'node:test';
import assert from 'node:assert';
import { getCPUUsage } from '../../src/node/core/runtime/metrics.js';

test('getCPUUsage returns valid process metrics', () => {
  const usage = getCPUUsage();
  assert.strictEqual(typeof usage.user, 'number');
  assert.strictEqual(typeof usage.system, 'number');
  assert.ok(usage.user >= 0);
  assert.ok(usage.system >= 0);
});