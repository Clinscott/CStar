import test from 'node:test';
import assert from 'node:assert';
import { getTracesForFile, saveTrace } from  '../src/tools/pennyone/intel/database.js';

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
