import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { compileMatrix } from '../../../src/tools/pennyone/intel/compiler.js';
import { FileData } from '../../../src/tools/pennyone/analyzer.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import fs from 'fs/promises';
import path from 'path';

describe('PennyOne Dependency Resolution', () => {
    it('should resolve various import formats correctly', async () => {
        const root = process.cwd().replace(/\\/g, '/');
        
        // Mock FileData results
        const mockResults: FileData[] = [
            {
                path: registry.normalize('src/main.ts'),
                loc: 10, complexity: 1, hash: 'h1',
                matrix: { logic: 10, style: 10, intel: 10, overall: 10, gravity: 0 },
                exports: [],
                imports: [
                    { source: './utils.js', local: 'u', imported: '*' }, // ESM TS quirk
                    { source: 'src/core/engine.ts', local: 'e', imported: '*' }, // absolute-ish
                    { source: 'logic.service', local: 'l', imported: '*' } // python dot
                ]
            },
            {
                path: registry.normalize('src/utils.ts'),
                loc: 5, complexity: 1, hash: 'h2',
                matrix: { logic: 10, style: 10, intel: 10, overall: 10, gravity: 0 },
                exports: [], imports: []
            },
            {
                path: registry.normalize('src/core/engine.ts'),
                loc: 20, complexity: 2, hash: 'h3',
                matrix: { logic: 10, style: 10, intel: 10, overall: 10, gravity: 0 },
                exports: [], imports: []
            },
            {
                path: registry.normalize('logic/service.py'),
                loc: 15, complexity: 1, hash: 'h4',
                matrix: { logic: 10, style: 10, intel: 10, overall: 10, gravity: 0 },
                exports: [], imports: []
            }
        ];

        const graphPath = await compileMatrix(mockResults, root);
        const graph = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
        
        const mainFile = graph.files.find((f: any) => f.path.endsWith('src/main.ts'));
        assert.ok(mainFile, 'Main file should be in graph');
        
        const deps = mainFile.dependencies;
        
        // Verify ESM .js -> .ts resolution
        assert.ok(deps.some((d: string) => d.endsWith('src/utils.ts')), 'Should resolve .js import to .ts file');
        
        // Verify absolute-ish path resolution
        assert.ok(deps.some((d: string) => d.endsWith('src/core/engine.ts')), 'Should resolve repo-absolute path');
        
        // Verify Python dot-notation resolution
        assert.ok(deps.some((d: string) => d.endsWith('logic/service.py')), 'Should resolve Python dot-notation');
        
        assert.strictEqual(deps.length, 3, 'Should have resolved all 3 dependencies');
    });
});
