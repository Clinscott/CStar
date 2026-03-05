import test, { mock } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { indexSector } from '../../src/tools/pennyone/index.ts';
import { defaultProvider } from '../../src/tools/pennyone/intel/llm.ts';

test('Targeted Incremental Scan (indexSector)', async () => {
    // [🛡️] STERLING MANDATE: Isolation Strike
    // We mock the provider to avoid the "No Mocking" mandate during unit tests.
    mock.method(defaultProvider, 'getBatchIntent', async () => {
        return [{ intent: 'Test Intent', interaction: 'Test Protocol' }];
    });

    const targetFile = path.resolve('src/core/annex.py');
    
    // We expect indexSector to return a valid FileData object
    const result = await indexSector(targetFile);
    
    assert.ok(result, 'Should return a FileData object');
    assert.strictEqual(result?.path, targetFile, 'Path should match');
    assert.ok(result?.matrix, 'Should have a Gungnir Matrix');
    assert.ok(result?.hash, 'Should compute a hash');
    assert.ok(typeof result?.matrix.overall === 'number', 'Overall score should be a number');
});
