import { test } from 'node:test';
import assert from 'node:assert';
import { getDiskUsage } from '../../src/node/core/runtime/health.js';

test('getDiskUsage returns disk space metrics', async () => {
  const metrics = await getDiskUsage();
  assert.strictEqual(typeof metrics.available, 'number');
  assert.ok(metrics.available >= 0, 'available space should be non-negative');
  assert.ok(metrics.total > 0, 'total space should be positive');
});