import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { SemanticIndexer } from '../../src/tools/pennyone/intel/semantic.js';

describe('PennyOne Phase 3: Semantic Intelligence', () => {
    
    it('should resolve cross-file dependencies via symbol registry', async () => {
        const root = process.cwd();
        const indexer = new SemanticIndexer(root);
        
        const fileA = path.resolve(root, 'integration_test_a.ts');
        const fileB = path.resolve(root, 'integration_test_b.ts');

        fs.writeFileSync(fileB, 'export const SharedLogic = 42;');
        fs.writeFileSync(fileA, 'import { SharedLogic } from  './integration_test_b.js'; console.log(SharedLogic);');

        try {
            const graph = await indexer.index([fileA, fileB]);
            
            const nodeA = graph.files.find((f: any) => path.resolve(f.path) === fileA);
            const nodeB = graph.files.find((f: any) => path.resolve(f.path) === fileB);

            assert.ok(nodeA, 'File A should be indexed');
            assert.ok(nodeB, 'File B should be indexed');
            
            const hasDep = nodeA.dependencies.some(d => path.resolve(d) === fileB);
            assert.ok(hasDep, 'File A should semantically depend on File B');
            
            // Logic score check (Phase 3 requirement)
            assert.ok(nodeA.logic <= 10, 'Logic score should be calculated');

        } finally {
            if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
            if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
        }
    });
});
