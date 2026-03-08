import { crawlRepository } from './crawler.js';
import { analyzeFile } from './analyzer.js';
import { writeReport } from './intel/writer.js';
import { compileMatrix } from './intel/compiler.js';
import { registerSpoke, updateFtsIndex } from './intel/database.js';
import { SemanticIndexer } from './intel/semantic.js';
import { ChronicleIndexer } from './intel/chronicle.js';
import { Warden } from './intel/warden.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from './pathRegistry.js';
import { defaultProvider } from './intel/llm.js';
import chalk from 'chalk';
/**
 * Targeted Incremental Scan (The Sector Strike)
 * Purpose: Re-analyze a single file and update the global matrix.
 * @param {string} filePath - Path to the file to re-index
 * @returns {Promise<FileData | null>} The analyzed data
 */
export async function indexSector(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        const normalizedPath = registry.normalize(absolutePath);
        const code = await fs.readFile(absolutePath, 'utf-8');
        const currentHash = crypto.createHash('md5').update(code).digest('hex');
        // 1. Local Analysis
        const data = await analyzeFile(code, absolutePath);
        // 2. Semantic Analysis (Targeted)
        const indexer = new SemanticIndexer(path.dirname(absolutePath));
        const semanticGraph = await indexer.index();
        const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);
        if (semanticData) {
            data.matrix.logic = (data.matrix.logic + semanticData.logic) / 2;
            data.dependencies = semanticData.dependencies;
        }
        // 3. Intelligence (Intent)
        console.error(`[ALFRED] Analyzing intelligence for sector ${normalizedPath}...`);
        const [{ intent, interaction }] = await defaultProvider.getBatchIntent([{ code, data }]);
        data.intent = intent;
        data.interaction_protocol = interaction;
        data.hash = currentHash;
        // 4. Global Memory Update (SQLite)
        updateFtsIndex(absolutePath, intent, interaction);
        // 5. Hot-patch matrix-graph.json
        const statsDir = path.join(registry.getRoot(), '.stats');
        const graphPath = path.join(statsDir, 'matrix-graph.json');
        try {
            const raw = await fs.readFile(graphPath, 'utf-8');
            const graph = JSON.parse(raw);
            const index = graph.files.findIndex(f => registry.normalize(f.path) === normalizedPath);
            if (index !== -1) {
                graph.files[index] = data;
            }
            else {
                graph.files.push(data);
            }
            await fs.writeFile(graphPath, JSON.stringify(graph, null, 2));
        }
        catch (e) {
            console.warn(`[WARNING] Failed to hot-patch matrix-graph.json: ${e}`);
        }
        return data;
    }
    catch (error) {
        console.error(`[ERROR] Failed to index sector ${filePath}:`, error);
        return null;
    }
}
/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @param {boolean} force - Force re-analysis of all files
 * @returns {Promise<FileData[]>} Scanned files
 */
export async function runScan(targetPath, force = false) {
    // [Ω] Register this spoke in the central database
    registerSpoke(targetPath);
    // Phase 0: Chronicle Ingestion (One Mind)
    const chronicles = new ChronicleIndexer();
    await chronicles.index();
    // Phase 3: Semantic Pass (Global Registry)
    const indexer = new SemanticIndexer(targetPath);
    const semanticGraph = await indexer.index();
    const files = await crawlRepository(targetPath);
    const analyzedFiles = [];
    // Load existing matrix for incremental check
    let existingGraph = null;
    const statsDir = path.join(registry.getRoot(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');
    if (!force) {
        try {
            const raw = await fs.readFile(graphPath, 'utf-8');
            existingGraph = JSON.parse(raw);
        }
        catch { }
    }
    const hashMap = new Map();
    if (existingGraph) {
        existingGraph.files.forEach(f => {
            const data = f;
            if (!data.imports)
                data.imports = [];
            if (!data.exports)
                data.exports = [];
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
                // [🔱] Sync cached intent to FTS
                updateFtsIndex(file, existing.intent || '...', existing.interaction_protocol || 'Standard');
                analyzedFiles.push({
                    code,
                    data: {
                        path: file,
                        loc: existing.loc,
                        complexity: existing.complexity,
                        matrix: existing.matrix,
                        imports: existing.imports || [],
                        exports: existing.exports || [],
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
        }
        catch (error) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }
    // Phase 2: High-Fidelity Intelligence (Batch Size 50 for speed)
    const filesNeedingIntent = analyzedFiles.filter(af => af.needsIntent);
    const BATCH_SIZE = 50;
    for (let i = 0; i < filesNeedingIntent.length; i += BATCH_SIZE) {
        const batch = filesNeedingIntent.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(filesNeedingIntent.length / BATCH_SIZE);
        // [🔱] THE HEARTBEAT: Explicit progress logs and telemetry
        const status = {
            batch: batchNum,
            total_batches: totalBatches,
            last_update: Date.now(),
            status: 'PROCESSING'
        };
        try {
            fsSync.writeFileSync(path.join(registry.getRoot(), '.agents', 'scan_heartbeat.json'), JSON.stringify(status, null, 2));
        }
        catch { /* Ignore telemetry errors */ }
        console.log(chalk.cyan(` ◈ [HEARTBEAT] Processing Intelligence Batch ${batchNum}/${totalBatches}...`));
        try {
            let batchIntents;
            try {
                batchIntents = await defaultProvider.getBatchIntent(batch.map(b => ({ code: b.code, data: b.data })));
            }
            catch (intentError) {
                console.warn(chalk.yellow(`[WARNING] Batch ${batchNum} intelligence generation failed: ${intentError.message}. Using fallback metadata.`));
                batchIntents = batch.map(() => ({
                    intent: 'Intelligence generation offline. See sector lore for details.',
                    interaction: 'Standard'
                }));
            }
            // Map intents back to data and write reports
            for (let j = 0; j < batch.length; j++) {
                const intentData = batchIntents[j];
                const fileData = batch[j].data;
                const { intent, interaction } = await writeReport(fileData, targetPath, batch[j].code, intentData);
                fileData.intent = intent;
                fileData.interaction_protocol = interaction;
                // [🔱] WELL OF MIMIR: Update FTS Index
                updateFtsIndex(fileData.path, intent, interaction);
            }
            console.log(chalk.dim(` ✔ Batch ${batchNum} finalized.`));
            // Update heartbeat to idle between batches
            status.status = 'WAITING';
            status.last_update = Date.now();
            try {
                fsSync.writeFileSync(path.join(registry.getRoot(), '.agents', 'scan_heartbeat.json'), JSON.stringify(status, null, 2));
            }
            catch { }
            // [Ω] ANTI-HANG: Brief delay between batches to allow the Host to breathe
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch (e) {
            console.error(chalk.red(`[CRITICAL FAILURE] Intelligence scan aborted: ${e.message}`));
            // Re-throw to halt the entire scan process as per mandate
            throw e;
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
        }
        catch (e) {
            console.warn(`[WARNING] Warden evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return finalResults;
}
