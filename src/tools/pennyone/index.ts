import { crawlRepository } from './crawler.ts';
import { analyzeFile } from './analyzer.ts';
import { writeReport } from './intel/writer.ts';
import { writeProjectedMatrixGraph } from './intel/compiler.ts';
import {
    getLatestHallScanId,
    recordHallFile,
    recordHallScan,
    registerSpoke,
    updateFtsIndex,
    upsertHallRepository,
} from './intel/database.ts';
import { SemanticIndexer } from './intel/semantic.ts';
import { ChronicleIndexer } from './intel/chronicle.ts';
import { Warden } from './intel/warden.ts';
import fsSync from 'node:fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from './pathRegistry.ts';
import { activePersona } from './personaRegistry.ts';
import { ScanResult, FileData } from './types.ts';
import { defaultProvider } from './intel/llm.ts';
import chalk from 'chalk';
import { buildHallRepositoryId } from '../../types/hall.ts';
import { getGungnirOverall, patchGungnirMatrix } from '../../types/gungnir.ts';


/**
 * Targeted Incremental Scan (The Sector Strike)
 * Purpose: Re-analyze a single file and update the global matrix.
 * @param {string} filePath - Path to the file to re-index
 * @returns {Promise<FileData | null>} The analyzed data
 */
export async function indexSector(filePath: string): Promise<FileData | null> {
    try {
        const absolutePath = path.resolve(filePath);
        const normalizedPath = registry.normalize(absolutePath);
        const targetRepoRoot = registry.detectWorkspaceRoot(absolutePath);
        const code = await fs.readFile(absolutePath, 'utf-8');
        const currentHash = crypto.createHash('md5').update(code).digest('hex');

        // 1. Local Analysis
        const data = await analyzeFile(code, absolutePath);
        
        // 2. Semantic Analysis (Targeted)
        const indexer = new SemanticIndexer(path.dirname(absolutePath));
        const semanticGraph = await indexer.index();
        const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);
        
        if (semanticData) {
            data.matrix = patchGungnirMatrix(data.matrix, {
                logic: (data.matrix.logic + semanticData.logic) / 2,
            });
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

        // PennyOne projections are derived from Hall records, never patched directly.
        const repoId = buildHallRepositoryId(targetRepoRoot);
        upsertHallRepository({
            root_path: targetRepoRoot,
            name: path.basename(targetRepoRoot),
            status: 'AWAKE',
            active_persona: activePersona.name,
            baseline_gungnir_score: getGungnirOverall(data.matrix),
            intent_integrity: 100,
            metadata: {
                source: 'pennyone_sector_index',
                estate_projection: {
                    mounted_from: registry.getRoot(),
                },
            },
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        let scanId = getLatestHallScanId(targetRepoRoot);
        if (!scanId) {
            scanId = `hall-scan:${Date.now()}`;
            recordHallScan({
                scan_id: scanId,
                repo_id: repoId,
                scan_kind: 'pennyone_sector_index',
                status: 'COMPLETED',
                baseline_gungnir_score: getGungnirOverall(data.matrix),
                started_at: Date.now(),
                completed_at: Date.now(),
                metadata: {
                    scope: path.dirname(absolutePath),
                    projection_only: true,
                },
            });
        }
        recordHallFile({
            repo_id: repoId,
            scan_id: scanId,
            path: absolutePath,
            content_hash: currentHash,
            language: path.extname(absolutePath).replace(/^\./, '') || undefined,
            gungnir_score: getGungnirOverall(data.matrix),
            matrix: data.matrix,
            imports: data.imports,
            exports: data.exports,
            intent_summary: data.intent,
            interaction_summary: data.interaction_protocol,
            created_at: Date.now(),
        });
        await writeProjectedMatrixGraph(targetRepoRoot, scanId);

        return data;
    } catch (error) {
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
export async function runScan(targetPath: string, force = false): Promise<FileData[]> {
    // [Ω] Register this spoke in the central database
    registerSpoke(targetPath);
    const targetRepoRoot = registry.detectWorkspaceRoot(targetPath);
    upsertHallRepository({
        root_path: targetRepoRoot,
        name: path.basename(targetRepoRoot),
        status: 'AWAKE',
        active_persona: activePersona.name,
        baseline_gungnir_score: 0,
        intent_integrity: 100,
        metadata: {
            source: 'pennyone_scan',
            estate_projection: {
                mounted_from: registry.getRoot(),
            },
        },
        created_at: Date.now(),
        updated_at: Date.now(),
    });

    // Phase 0: Chronicle Ingestion (One Mind)
    const chronicles = new ChronicleIndexer();
    await chronicles.index();

    // Phase 3: Semantic Pass (Global Registry)
    const indexer = new SemanticIndexer(targetPath);
    const semanticGraph = await indexer.index();

    const files = await crawlRepository(targetPath);
    const analyzedFiles: { code: string, data: FileData, needsIntent: boolean }[] = [];

    // Phase 1: Local Analysis & Change Detection
    for (const file of files) {
        try {
            const code = await fs.readFile(file, 'utf-8');
            const currentHash = crypto.createHash('md5').update(code).digest('hex');
            const normalizedPath = registry.normalize(file);

            // Get semantic data for this file
            const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);

            const data = await analyzeFile(code, file);
            if (semanticData) {
                data.matrix = patchGungnirMatrix(data.matrix, {
                    logic: (data.matrix.logic + semanticData.logic) / 2,
                });
            }
            analyzedFiles.push({ code, data, needsIntent: true });
        } catch (error: unknown) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    // Phase 2: High-Fidelity Intelligence (Batch Size 50 for speed)
    const filesNeedingIntent = analyzedFiles.filter(af => af.needsIntent);
    const BATCH_SIZE = 50;

    for (let i = 0; i < filesNeedingIntent.length; i += BATCH_SIZE) {
        const batch = filesNeedingIntent.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i/BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(filesNeedingIntent.length/BATCH_SIZE);
        
        // [🔱] THE HEARTBEAT: Explicit progress logs and telemetry
        const status = {
            batch: batchNum,
            total_batches: totalBatches,
            last_update: Date.now(),
            status: 'PROCESSING'
        };
        try {
            fsSync.writeFileSync(path.join(registry.getRoot(), '.agents', 'scan_heartbeat.json'), JSON.stringify(status, null, 2));
        } catch { /* Ignore telemetry errors */ }

        console.log(chalk.cyan(` ◈ [HEARTBEAT] Processing Intelligence Batch ${batchNum}/${totalBatches}...`));
        
        try {
            let batchIntents;
            try {
                batchIntents = await defaultProvider.getBatchIntent(batch.map(b => ({ code: b.code, data: b.data })));
            } catch (intentError: any) {
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
            } catch { }

            // [Ω] ANTI-HANG: Brief delay between batches to allow the Host to breathe
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e: any) {
            console.error(chalk.red(`[CRITICAL FAILURE] Intelligence scan aborted: ${e.message}`));
            // Re-throw to halt the entire scan process as per mandate
            throw e;
        }
    }

    const finalResults = analyzedFiles.map(af => af.data);

    if (finalResults.length > 0) {
        const scanId = `hall-scan:${Date.now()}`;
        const repoId = buildHallRepositoryId(targetRepoRoot);
        const startedAt = Date.now();
        const averageScore = finalResults.reduce((sum, file) => sum + getGungnirOverall(file.matrix), 0) / finalResults.length;

        recordHallScan({
            scan_id: scanId,
            repo_id: repoId,
            scan_kind: 'pennyone_repository_scan',
            status: 'COMPLETED',
            baseline_gungnir_score: averageScore,
            started_at: startedAt,
            completed_at: Date.now(),
            metadata: {
                scope: path.resolve(targetPath),
                canonical_projection: {
                    authority: 'hall_projection',
                    artifact_role: 'runtime_view',
                    compatibility_exports: ['.stats/matrix-graph.json'],
                },
            },
        });

        for (const file of finalResults) {
            recordHallFile({
                repo_id: repoId,
                scan_id: scanId,
                path: file.path,
                content_hash: file.hash,
                language: path.extname(file.path).replace(/^\./, '') || undefined,
                gungnir_score: getGungnirOverall(file.matrix),
                matrix: file.matrix,
                imports: file.imports,
                exports: file.exports,
                intent_summary: file.intent,
                interaction_summary: file.interaction_protocol,
                created_at: Date.now(),
            });
        }

        await writeProjectedMatrixGraph(targetRepoRoot, scanId);

        // Phase 4: Active Threat Assessment (The Warden)
        try {
            const warden = new Warden();
            await warden.evaluateProjection(targetRepoRoot, scanId);
        } catch (e: unknown) {
            console.warn(`[WARNING] Warden evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return finalResults;
}

