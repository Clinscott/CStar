import { runScan } from '../../src/tools/pennyone/index.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import fs from 'fs/promises';
import path from 'path';
import { defaultProvider } from '../../src/tools/pennyone/intel/llm.ts';
import { test } from 'node:test';

/**
 * Tier 3: PennyOne Chronicler Verification
 * This test uses a mock directory to verify the crawler and analyzer.
 */
async function testPennyOne() {
    console.log("--- TIER 3: PENNYONE CRUCIBLE ---");
    const testDir = path.join(process.cwd(), 'sandbox_test_pennyone');

    // Mock the provider to test offline logic
    test.mock.method(defaultProvider, 'getBatchIntent', async (batch: any[]) => {
        return batch.map(b => ({
            intent: `Mocked intent`,
            interaction: 'Mocked protocol'
        }));
    });

    try {
        // Setup mock environment
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, 'test_file.ts'), 'export const x = 1;');

        console.log("[TEST] Running Crawler...");
        const results = await runScan(testDir);

        if (results.length > 0) {
            console.log(`[PASS] PennyOne identified ${results.length} files.`);
            const first = results[0];
            if (first.path.includes('test_file.ts')) {
                console.log("[PASS] File path correctly identified.");
            }
        } else {
            throw new Error("No files found by crawler.");
        }

        console.log("[TEST] Verifying .stats Generation...");
        const statsDir = path.join(registry.getRoot(), '.stats');
        const exists = await fs.access(statsDir).then(() => true).catch(() => false);
        if (exists) {
            console.log("[PASS] .stats directory exists.");
        }

    } catch (e: any) {
        console.error(`[FAIL] PennyOne Crucible Failed: ${e.message}`);
        process.exit(1);
    } finally {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
    }
}

testPennyOne();
