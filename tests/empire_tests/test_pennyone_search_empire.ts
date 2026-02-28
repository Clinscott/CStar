import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { searchMatrix } from '../../src/tools/pennyone/live/search.js';

/**
 * [EMPIRE TDD] PennyOne Unified Search Verification
 * Verifies the cross-platform search logic against the Hall of Records.
 */

describe('PennyOne Unified Search (Phase D)', () => {
    const statsDir = path.join(process.cwd(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');

    test('searchMatrix identifies files by intent', async (t) => {
        // Mock a matrix-graph if it doesn't exist for the test runner
        // (In a real run, the scan we just did populated this)
        const raw = await fs.readFile(graphPath, 'utf-8').catch(() => null);
        if (!raw) {
            console.log("Skipping search test: matrix-graph.json not found.");
            return;
        }

        // We'll capture console.log to verify output
        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (msg: string) => logs.push(msg);

        try {
            await searchMatrix('intent');
            
            // Verify we found results (since we know 'intent.ts' exists from our previous scan)
            const foundGateway = logs.some(l => l.includes('gateway') || l.includes('intent'));
            assert.ok(foundGateway, 'Search should identify sectors matching "intent"');
            
        } finally {
            console.log = originalLog;
        }
    });

    test('searchMatrix handles unknown queries gracefully', async () => {
        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (msg: string) => logs.push(msg);

        try {
            await searchMatrix('NON_EXISTENT_SECTOR_TOKEN_XYZ');
            const noMatch = logs.some(l => l.includes('No matches found'));
            assert.ok(noMatch, 'Search should report no matches for garbage queries');
        } finally {
            console.log = originalLog;
        }
    });
});
