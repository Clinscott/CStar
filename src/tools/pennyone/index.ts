 
import { crawlRepository } from './crawler.js';
import { analyzeFile, FileData } from './analyzer.js';
import { writeReport } from './intel/writer.js';
import { compileMatrix, CompiledGraph } from './intel/compiler.js';
import { registerSpoke } from './intel/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from './pathRegistry.js';

/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @returns {Promise<FileData[]>} Scanned files
 */
export async function runScan(targetPath: string): Promise<FileData[]> {
    // [Ω] Register this spoke in the central database
    registerSpoke(targetPath);

    const files = await crawlRepository(targetPath);
    const results: FileData[] = [];

    // Load existing matrix for incremental check (Always in project root .stats)
    let existingGraph: CompiledGraph | null = null;
    const statsDir = path.join(registry.getRoot(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');
    try {
        const raw = await fs.readFile(graphPath, 'utf-8');
        existingGraph = JSON.parse(raw);
    } catch {
        // No existing graph, full scan
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hashMap = new Map<string, any>();
    if (existingGraph) {
        existingGraph.files.forEach(f => hashMap.set(f.path, f));
    }

    for (const file of files) {
        try {
            const code = await fs.readFile(file, 'utf-8');
            const currentHash = crypto.createHash('md5').update(code).digest('hex');
            const normalizedPath = registry.normalize(file);

            const existing = hashMap.get(normalizedPath);
            if (existing && existing.hash === currentHash) {
                // Skip analysis, but keep the data for recompilation
                results.push({
                    path: file,
                    loc: existing.loc,
                    complexity: existing.complexity,
                    matrix: existing.matrix,
                    imports: [],
                    exports: [],
                    intent: existing.intent,
                    hash: currentHash,
                    cachedDependencies: existing.dependencies || []
                });
                continue;
            }

            const data = await analyzeFile(code, file);

            // Phase 2: Intelligence Generation (Only for new/changed files)
            const { intent } = await writeReport(data, targetPath, code);
            data.intent = intent;

            results.push(data);
        } catch (error: unknown) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    // Phase 2: Matrix Compilation
    if (results.length > 0) {
        await compileMatrix(results, targetPath);
    }

    return results;
}
