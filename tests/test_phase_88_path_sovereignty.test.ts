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
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-phase88-path-'));
    registry.setRoot(testRoot);
    closeDb();
});

after(() => {
    closeDb();
    registry.setRoot(originalRoot);
    fs.rmSync(testRoot, { recursive: true, force: true });
});

test('Path Sovereignty: Cross-OS Path Matching', async () => {
    const unixPath = 'src/core/utils.py';
    const winPath = 'src\\core\\utils.py';
    const missionId = 'path-sov-' + Date.now();
    
    // 1. Seed with Unix style
    await saveTrace({
        mission_id: missionId,
        file_path: unixPath,
        target_metric: 'LOGIC',
        initial_score: 1.0,
        final_score: 2.0,
        justification: 'Path Test',
        status: 'SUCCESS',
        timestamp: Date.now()
    });

    // 2. Query with Windows style
    const winResults = getTracesForFile(winPath);
    assert.ok(winResults.some(t => t.mission_id === missionId), 'Should find trace with Windows path');

    // 3. Query with Unix style
    const unixResults = getTracesForFile(unixPath);
    assert.ok(unixResults.some(t => t.mission_id === missionId), 'Should find trace with Unix path');
});

test('SQL Injection Resilience: mission_traces', async () => {
    // Basic check that we are using prepared statements correctly
    const maliciousPath = "'; DROP TABLE mission_traces; --";
    
    // This should just return 0 results, NOT crash or drop the table.
    const results = getTracesForFile(maliciousPath);
    assert.ok(Array.isArray(results), 'Results should be an array');
    assert.strictEqual(results.length, 0, 'Should return 0 results for malicious path');
});
