import { test, expect } from 'vitest';
import { getTracesForFile, saveTrace, getDb } from '../src/tools/pennyone/intel/database.js';
import path from 'node:path';
import fs from 'node:fs';
import { registry } from '../src/tools/pennyone/pathRegistry.js';

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
    
    expect(target).toBeDefined();
    expect(target.initial_score).toBe(5.0);
    expect(target.final_score).toBe(8.5);
    expect(target.status).toBe('SUCCESS');
});
