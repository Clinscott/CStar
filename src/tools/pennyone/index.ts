import { crawlRepository } from './crawler.ts';
import { analyzeFile, FileData } from './analyzer.ts';
import { writeReport } from './intel/writer.ts';
import { compileMatrix, CompiledGraph } from './intel/compiler.ts';
import { registerSpoke } from './intel/database.ts';
import { SemanticIndexer } from './intel/semantic.ts';
import { Warden } from './intel/warden.ts';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from './pathRegistry.ts';
import { activePersona } from './personaRegistry.ts';
import { ScanResult } from './types.ts';
import { defaultProvider } from './intel/llm.ts';


/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @param {boolean} force - Force re-analysis of all files
 * @returns {Promise<FileData[]>} Scanned files
 */
export async function runScan(targetPath: string, force = false): Promise<FileData[]> {
    // [Ω] Register this spoke in the central database
    registerSpoke(targetPath);

    // Phase 3: Semantic Pass (Global Registry)
    const indexer = new SemanticIndexer(targetPath);
    const semanticGraph = await indexer.index();

    const files = await crawlRepository(targetPath);
    const analyzedFiles: { code: string, data: FileData, needsIntent: boolean }[] = [];

    // Load existing matrix for incremental check
    let existingGraph: CompiledGraph | null = null;
    const statsDir = path.join(registry.getRoot(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');
    
    if (!force) {
        try {
            const raw = await fs.readFile(graphPath, 'utf-8');
            existingGraph = JSON.parse(raw);
        } catch { }
    }

    const hashMap = new Map<string, FileData>();
    if (existingGraph) {
        existingGraph.files.forEach(f => {
            const data = f as unknown as FileData;
            if (!data.imports) data.imports = [];
            if (!data.exports) data.exports = [];
            hashMap.set(data.path, data);
        });
    }

    // Phase 1: Local Analysis & Change Detection
    for (const file of files) {
        try {
            const code = await fs.readFile(file, 'utf-8');
            const currentHash = crypto.createHash('md5').update(code).digest('hex');
            const normalizedPath = registry.normalize(file);

            // Get semantic data for this file
            const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);

            const existing = hashMap.get(normalizedPath);
            if (!force && existing && existing.hash === currentHash) {
                analyzedFiles.push({
                    code,
                    data: {
                        path: file,
                        loc: existing.loc,
                        complexity: existing.complexity,
                        matrix: existing.matrix,
                        imports: [],
                        exports: [],
                        intent: existing.intent,
                        interaction_protocol: existing.interaction_protocol,
                        hash: currentHash,
                        cachedDependencies: semanticData ? semanticData.dependencies : (existing.dependencies || [])
                    },
                    needsIntent: false
                });
                continue;
            }

            const data = await analyzeFile(code, file);
            if (semanticData) {
                data.matrix.logic = (data.matrix.logic + semanticData.logic) / 2;
            }
            analyzedFiles.push({ code, data, needsIntent: true });
        } catch (error: unknown) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    // Phase 2: Batch Intelligence (Optimized for 600+ files)
    const filesNeedingIntent = analyzedFiles.filter(af => af.needsIntent);
    const BATCH_SIZE = 10;

    for (let i = 0; i < filesNeedingIntent.length; i += BATCH_SIZE) {
        const batch = filesNeedingIntent.slice(i, i + BATCH_SIZE);
        console.log(`[ALFRED] Analyzing intelligence for batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(filesNeedingIntent.length/BATCH_SIZE)}...`);
        
        try {
            const batchIntents = await defaultProvider.getBatchIntent(batch.map(b => ({ code: b.code, data: b.data })));
            
            // Map intents back to data and write reports
            for (let j = 0; j < batch.length; j++) {
                const intentData = batchIntents[j];
                const fileData = batch[j].data;
                const { intent, interaction } = await writeReport(fileData, targetPath, batch[j].code, intentData);
                fileData.intent = intent;
                fileData.interaction_protocol = interaction;
            }
        } catch (e) {
            console.error(`[ERROR] Batch processing failed: ${e}`);
        }
    }

    const finalResults = analyzedFiles.map(af => af.data);

    if (finalResults.length > 0) {
        const graphPath = await compileMatrix(finalResults, targetPath);

        // Phase 4: Active Threat Assessment (The Warden)
        try {
            const raw = await fs.readFile(graphPath, 'utf-8');
            const graph = JSON.parse(raw);
            const warden = new Warden();
            await warden.evaluate(graph);
        } catch (e: unknown) {
            console.warn(`[WARNING] Warden evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return finalResults;
}
