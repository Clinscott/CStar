import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { runScan } from '../../../src/tools/pennyone/index.ts';
import { defaultProvider } from '../../../src/tools/pennyone/intel/llm.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 🔱 PENNYONE SCAN LOGIC TEST (Section 13 Compliance)
 * Purpose: Verify batching and provider integration.
 */
describe('PennyOne Scan Logic', () => {
    it('should correctly batch intent requests and use the provider', async () => {
        // Mock the provider to avoid real API calls during the test
        const mockGetBatchIntent = mock.method(defaultProvider, 'getBatchIntent', async (items) => {
            return items.map(() => ({ intent: 'Mock Intent', interaction: 'Mock Protocol' }));
        });

        // Target a small, known directory for the test scan
        const testPath = 'src/tools/pennyone/intel'; 
        
        try {
            const results = await runScan(testPath, true); // Force scan
            
            assert.ok(results.length > 0, 'Scan should return results');
            assert.ok(mockGetBatchIntent.mock.callCount() > 0, 'Provider should be called for intelligence');
            
            console.log(`[VERIFICATION]: Scan complete. Batches processed: ${mockGetBatchIntent.mock.callCount()}`);
        } catch (error: any) {
            assert.fail(`Scan failed during verification: ${error.message}`);
        }
    });
});
