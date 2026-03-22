import { test } from 'node:test';
import assert from 'node:assert';
import { checkOverallHealth } from '../../src/node/core/runtime/health.js';

test('checkOverallHealth aggregates system health correctly', async () => {
  const report = await checkOverallHealth();
  const validStatuses = ['healthy', 'degraded', 'critical'];
  assert.ok(validStatuses.includes(report.status), `Invalid status: ${report.status}`);
  assert.ok(report.components.memory, 'Missing memory component in report');
  assert.ok(report.components.disk, 'Missing disk component in report');
});