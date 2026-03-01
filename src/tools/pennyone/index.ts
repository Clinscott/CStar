
import { crawlRepository } from './crawler';
import { analyzeFile, FileData } from './analyzer';
import { writeReport } from './intel/writer';
import { compileMatrix, CompiledGraph } from './intel/compiler';
import { registerSpoke } from './intel/database';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from './pathRegistry';
import { SemanticIndexer } from './intel/semantic';
import { Warden } from './intel/warden';

/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @returns {Promise<FileData[]>} Scanned files
 */
export async function runScan(targetPath: string): Promise<FileData[]> {
    // [Ω] Register this spoke in the central database
    registerSpoke(targetPath);

    // Phase 3: Semantic Pass (Global Registry)
    const indexer = new SemanticIndexer(targetPath);
    const semanticGraph = await indexer.index();

    const files = await crawlRepository(targetPath);
    const results: FileData[] = [];

    // Load existing matrix for incremental check
    let existingGraph: CompiledGraph | null = null;
    const statsDir = path.join(registry.getRoot(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');
    try {
        const raw = await fs.readFile(graphPath, 'utf-8');
        existingGraph = JSON.parse(raw);
    } catch { }

    const hashMap = new Map<string, any>();
    if (existingGraph) {
        existingGraph.files.forEach(f => hashMap.set(f.path, f));
    }

    for (const file of files) {
        try {
            const code = await fs.readFile(file, 'utf-8');
            const currentHash = crypto.createHash('md5').update(code).digest('hex');
            const normalizedPath = registry.normalize(file);

            // Get semantic data for this file
            const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);

            const existing = hashMap.get(normalizedPath);
            if (existing && existing.hash === currentHash) {
                results.push({
                    path: file,
                    loc: existing.loc,
                    complexity: existing.complexity,
                    matrix: existing.matrix,
                    imports: [],
                    exports: [],
                    intent: existing.intent,
                    hash: currentHash,
                    // Use semantic dependencies if available
                    cachedDependencies: semanticData ? semanticData.dependencies : (existing.dependencies || [])
                });
                continue;
            }

            const data = await analyzeFile(code, file);

            // Merge semantic logic score (but NOT dependencies, which cause hyper-connectivity)
            if (semanticData) {
                data.matrix.logic = (data.matrix.logic + semanticData.logic) / 2;
            }

            const { intent } = await writeReport(data, targetPath, code);
            data.intent = intent;

            results.push(data);
        } catch (error: unknown) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    if (results.length > 0) {
        const graphPath = await compileMatrix(results, targetPath);

        // Phase 4: Active Threat Assessment (The Warden)
        try {
            const raw = await fs.readFile(graphPath, 'utf-8');
            const graph = JSON.parse(raw);
            const warden = new Warden();
            await warden.evaluate(graph);
        } catch (e: any) {
            console.warn(`[WARNING] Warden evaluation failed: ${e.message}`);
        }
    }

    return results;
}
