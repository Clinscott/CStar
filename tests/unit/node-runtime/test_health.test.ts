import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMemoryUsage, getDiskUsage, checkOverallHealth } from  '../../../src/node/core/runtime/health.js';

describe('System Health Module', () => {
    it('should return memory usage with numeric values', () => {
        const usage = getMemoryUsage();
        assert.strictEqual(typeof usage.rss, 'number');
        assert.strictEqual(typeof usage.heapTotal, 'number');
        assert.strictEqual(typeof usage.heapUsed, 'number');
        assert.ok(usage.rss > 0);
    });

    it('should return disk usage', () => {
        const disk = getDiskUsage();
        assert.strictEqual(typeof disk.total, 'number');
        assert.strictEqual(typeof disk.used, 'number');
        assert.strictEqual(typeof disk.available, 'number');
    });

    it('should return overall healthy status', () => {
        const health = checkOverallHealth();
        assert.strictEqual(health.status, 'healthy');
        assert.ok(health.components.memory);
        assert.ok(health.components.disk);
    });
});
