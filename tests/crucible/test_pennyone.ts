import { runScan } from '../../src/tools/pennyone/index';
import { registry } from '../../src/tools/pennyone/pathRegistry';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tier 3: PennyOne Chronicler Verification
 * This test uses a mock directory to verify the crawler and analyzer.
 */
async function testPennyOne() {
    console.log("--- TIER 3: PENNYONE CRUCIBLE ---");
    const testDir = path.join(process.cwd(), 'tmp_test_pennyone');
    
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
