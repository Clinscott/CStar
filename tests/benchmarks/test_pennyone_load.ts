import { runScan } from  '../../src/tools/pennyone/index.js';
import fs from 'fs/promises';
import path from 'path';
import { test } from 'node:test';
import assert from 'node:assert';

/**
 * ⚡ PENNYONE LOAD TEST
 * Purpose: Benchmark PennyOne scanning performance and memory stability
 * under simulated high-volume conditions (1000+ files).
 */
async function runLoadTest() {
    const testDir = path.resolve(process.cwd(), 'tmp_load_test');
    await fs.mkdir(testDir, { recursive: true });

    console.log(`[LOAD TEST] Generating 1000 mock files in ${testDir}...`);
    const fileCreationPromises = [];
    for (let i = 0; i < 1000; i++) {
        const filePath = path.join(testDir, `mock_file_${i}.ts`);
        const content = `
            /** 
             * Mock File ${i} 
             * Complexity level: ${i % 10}
             */
            export const data_${i} = { value: ${i}, status: 'stable' };
            export function process_${i}() { return data_${i}.value * 2; }
        `;
        fileCreationPromises.push(fs.writeFile(filePath, content));
    }
    await Promise.all(fileCreationPromises);

    console.log(`[LOAD TEST] Initiating scan...`);
    const start = Date.now();
    const results = await runScan(testDir);
    const duration = Date.now() - start;

    console.log(`[LOAD TEST] Scan complete.`);
    console.log(`- Total Files: ${results.length}`);
    console.log(`- Total Duration: ${duration}ms`);
    console.log(`- Avg Time Per File: ${(duration / results.length).toFixed(2)}ms`);

    assert.strictEqual(results.length, 1000, 'Should have scanned all 1000 files');
    assert.ok(duration < 600000, 'Scan should complete within 10 minutes (Non-Batched)');

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
}

test('PennyOne: 1000-File High Volume Load Test', async () => {
    await runLoadTest();
});
