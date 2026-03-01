import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { P1Daemon } from '../../src/tools/pennyone/daemon.ts';
import { GitChronograph } from '../../src/tools/pennyone/intel/git_monitor.ts';
import { getFileGravity } from '../../src/tools/pennyone/intel/gravity_db.ts';

/**
 * [EMPIRE TDD]: Operation PennyOne Ascension (v2.0)
 * Purpose: Verify the structural integrity of the P1 v2.0 Autonomic Nervous System.
 */

test('◤ EMPIRE: P1 DAEMON LIFECYCLE ◢', async (t) => {
    const statsDir = path.join(registry.getRoot(), '.stats');
    const pidFile = path.join(statsDir, 'p1-daemon.pid');

    await t.test('Daemon PID and Lock Check', () => {
        const daemon = new P1Daemon('.');
        // Check if running (we'll simulate or check actual file)
        if (fs.existsSync(pidFile)) {
            assert.ok(daemon.isRunning(), 'Daemon should be marked as running if PID exists and is valid.');
        } else {
            assert.strictEqual(daemon.isRunning(), false, 'Daemon should be dormant if no PID file exists.');
        }
    });

    await t.test('Signal File Generation', () => {
        const signalFile = path.join(statsDir, 'p1-refresh.signal');
        // We simulate a scan trigger or check for current file
        if (fs.existsSync(signalFile)) {
            const content = fs.readFileSync(signalFile, 'utf-8');
            assert.ok(/^\d+$/.test(content), 'Signal file must contain a valid timestamp.');
        }
    });
});

test('◤ EMPIRE: TEMPORAL CHRONOGRAPH ◢', async (t) => {
    await t.test('Git Churn Extraction', async () => {
        const currentFile = path.join(registry.getRoot(), 'package.json');
        const churn = await GitChronograph.getFileChurn(currentFile);
        
        assert.ok(churn.commitCount >= 0, 'Commit count must be a non-negative integer.');
        assert.ok(typeof churn.linesChanged === 'number', 'Lines changed should be a number.');
        assert.ok(churn.lastModified > 0, 'Last modified should be a valid epoch.');
    });

    await t.test('Gravity Fusion Calculation', async () => {
        const testFile = path.join(registry.getRoot(), 'cstar.ts');
        const gravity = await getFileGravity(testFile);
        
        assert.ok(gravity >= 0, 'Fused gravity must be non-negative.');
        // If it's a known file with history, gravity should be > 0
        assert.ok(gravity > 0, 'Gungnir Matrix: cstar.ts should have historical gravity.');
    });
});

test('◤ EMPIRE: PATH SOVEREIGNTY ◢', async (t) => {
    await t.test('Registry Root Ascension', () => {
        const root = registry.getRoot();
        assert.ok(fs.existsSync(path.join(root, 'package.json')), 'Registry root must contain the package.json axis.');
        assert.ok(!root.endsWith('/'), 'Registry root should not have a trailing slash.');
    });
});
