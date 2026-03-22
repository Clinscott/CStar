import { test } from 'node:test';
import assert from 'node:assert';
import { getMemoryUsage } from '../../src/node/core/runtime/health.js';

test('getMemoryUsage returns valid process memory metrics', () => {
  const metrics = getMemoryUsage();
  assert.strictEqual(typeof metrics.rss, 'number');
  assert.ok(metrics.rss > 0, 'rss should be positive');
  assert.ok(metrics.heapTotal > 0, 'heapTotal should be positive');
  assert.ok(metrics.heapUsed > 0, 'heapUsed should be positive');
});