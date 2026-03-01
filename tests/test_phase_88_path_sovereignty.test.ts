import { test, expect } from 'vitest';
import { getTracesForFile, saveTrace } from '../src/tools/pennyone/intel/database.js';

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
    expect(winResults.some(t => t.mission_id === missionId)).toBe(true);

    // 3. Query with Unix style
    const unixResults = getTracesForFile(unixPath);
    expect(unixResults.some(t => t.mission_id === missionId)).toBe(true);
});

test('SQL Injection Resilience: mission_traces', async () => {
    // Basic check that we are using prepared statements correctly
    const maliciousPath = "'; DROP TABLE mission_traces; --";
    
    // This should just return 0 results, NOT crash or drop the table.
    const results = getTracesForFile(maliciousPath);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
});
