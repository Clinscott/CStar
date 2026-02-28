import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { runScan } from '../../../src/tools/pennyone/index.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * PennyOne: Graph Integrity Test Suite
 * Purpose: Ensure that the compiled matrix graph is structurally sound,
 * with absolute paths, non-empty dependencies, and correct summary metrics.
 */
describe('PennyOne Graph Integrity', () => {
    const statsDir = path.join(process.cwd(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');

    it('should generate a valid matrix-graph.json with dependencies', async () => {
        // 0. Ensure a fresh scan for the integrity check
        try {
            await fs.unlink(graphPath);
        } catch (e) {}

        // 1. Run a scan on a known directory (e.g., src/tools/pennyone)
        // We scan the tool itself to ensure we find internal dependencies.
        await runScan('src/tools/pennyone');

        // 2. Verify file existence
        const exists = await fs.access(graphPath).then(() => true).catch(() => false);
        assert.ok(exists, 'matrix-graph.json should be generated');

        // 3. Parse and validate structure
        const raw = await fs.readFile(graphPath, 'utf-8');
        const graph = JSON.parse(raw);

        assert.strictEqual(graph.version, '1.7.0', 'Graph version mismatch');
        assert.ok(Array.isArray(graph.files), 'Graph.files should be an array');
        assert.ok(graph.files.length > 0, 'Graph should contain files');

        // 4. Check for absolute paths, valid dependencies, and intent
        let foundDependency = false;
        let foundIntent = false;

        graph.files.forEach((file: any) => {
            assert.ok(path.isAbsolute(file.path), `Path should be absolute: ${file.path}`);
            assert.ok(file.path.includes('/'), 'Path should use forward-slashes (normalized)');
            
            // Check intent (should not be empty or "..." if scan was deep)
            if (file.intent && file.intent !== "..." && file.intent.length > 5) {
                foundIntent = true;
            }

            if (file.dependencies.length > 0) {
                foundDependency = true;
                file.dependencies.forEach((dep: string) => {
                    assert.ok(path.isAbsolute(dep), `Dependency path should be absolute: ${dep}`);
                    const depExists = graph.files.some((f: any) => f.path === dep);
                });
            }
        });

        assert.ok(foundDependency, 'At least one file should have resolved dependencies');
        assert.ok(foundIntent, 'At least one file should have a populated intent string');

        // 5. Validate Summary
        assert.ok(graph.summary.total_files > 0, 'Summary total_files should be > 0');
        assert.ok(graph.summary.total_loc > 0, 'Summary total_loc should be > 0');
        assert.ok(graph.summary.average_score >= 1 && graph.summary.average_score <= 10, 'Average score should be between 1 and 10');
    });

    it('should maintain integrity during incremental scans (caching)', async () => {
        // Run first scan
        await runScan('src/tools/pennyone');
        const raw1 = await fs.readFile(graphPath, 'utf-8');
        const graph1 = JSON.parse(raw1);
        const fileCount1 = graph1.files.length;
        const depCount1 = graph1.files.reduce((acc: number, f: any) => acc + f.dependencies.length, 0);

        // Run second scan (should use cache)
        await runScan('src/tools/pennyone');
        const raw2 = await fs.readFile(graphPath, 'utf-8');
        const graph2 = JSON.parse(raw2);

        assert.strictEqual(graph2.files.length, fileCount1, 'File count should remain same after incremental scan');
        const depCount2 = graph2.files.reduce((acc: number, f: any) => acc + f.dependencies.length, 0);
        assert.strictEqual(depCount2, depCount1, 'Dependency count should be preserved after incremental scan');
    });
});
