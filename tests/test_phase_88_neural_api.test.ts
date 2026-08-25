import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

import { closeDb, getTracesForFile, saveTrace } from '../src/tools/pennyone/intel/database.js';
import { registry } from '../src/tools/pennyone/pathRegistry.js';

const originalRoot = registry.getRoot();
let testRoot: string;

before(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-phase88-neural-'));
    registry.setRoot(testRoot);
    closeDb();
});

after(() => {
    closeDb();
    registry.setRoot(originalRoot);
    fs.rmSync(testRoot, { recursive: true, force: true });
});

test('Neural Trajectory Database Logic', async () => {
    const testFile = 'src/core/test_logic.py';
    const missionId = 'test-mission-' + Date.now();
    
    // 1. Seed a trace
    await saveTrace({
        mission_id: missionId,
        file_path: testFile,
        target_metric: 'LOGIC',
        initial_score: 5.0,
        final_score: 8.5,
        justification: 'Crucible Success',
        status: 'SUCCESS',
        timestamp: Date.now()
    });

    // 2. Retrieve the trace
    const traces = getTracesForFile('test_logic.py'); // Testing LIKE matching
    const target = traces.find(t => t.mission_id === missionId);
    
    assert.ok(target, 'Trace should be defined');
    assert.strictEqual(target.initial_score, 5.0);
    assert.strictEqual(target.final_score, 8.5);
    assert.strictEqual(target.status, 'SUCCESS');
});
