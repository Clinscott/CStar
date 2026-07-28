import test from 'node:test';
import assert from 'node:assert';
import { formatBytes } from '../../src/node/core/runtime/metrics.js';

test('formatBytes formatting logic', async (t) => {
  await t.test('handles zero', () => {
    assert.strictEqual(formatBytes(0), '0 Bytes');
  });

  await t.test('handles KB', () => {
    assert.strictEqual(formatBytes(1024), '1 KB');
  });

  await t.test('handles MB', () => {
    assert.strictEqual(formatBytes(1048576), '1 MB');
  });

  await t.test('handles fractional values', () => {
    assert.strictEqual(formatBytes(1536), '1.5 KB');
  });
});