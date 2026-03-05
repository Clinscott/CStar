import test, { mock } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { P1Daemon } from '../../src/tools/pennyone/daemon.ts';

test('Autonomic Reflex (P1 Daemon)', async () => {
    const targetPath = path.resolve('.');
    const daemon = new P1Daemon(targetPath);
    
    // Because triggerSectorIndex is private, we bypass TS for the test
    const d = daemon as any;
    
    assert.strictEqual(typeof d.triggerSectorIndex, 'function', 'Should have triggerSectorIndex method');
    assert.strictEqual(d.targetPath, targetPath);
    assert.strictEqual(typeof d.start, 'function');
});
