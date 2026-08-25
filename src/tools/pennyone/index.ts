import { analyzeFile } from  './analyzer.js';
import { writeReport } from  './intel/writer.js';
import { writeProjectedMatrixGraph } from  './intel/compiler.js';
import {
    getLatestHallScanId,
    getHallFilesByIntentSummary,
    registerSpoke,
    saveHallFile,
    saveHallRepository,
    saveHallScan,
    updateHallFileIntent,
    updateFtsIndex,
} from './intel/database.ts';
import { SemanticIndexer } from  './intel/semantic.js';
import { ChronicleIndexer } from  './intel/chronicle.js';
import { ChronosIndexer } from  './intel/chronos.js';
import { Warden } from  './intel/warden.js';
import fsSync from 'node:fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { registry } from  './pathRegistry.js';
import { activePersona } from  './personaRegistry.js';
import { FileData } from  './types.js';
import { defaultProvider, OFFLINE_INTENT_PLACEHOLDER } from  './intel/llm.js';
import chalk from 'chalk';
import { buildHallRepositoryId } from  '../../types/hall.js';
import { getGungnirOverall, patchGungnirMatrix } from  '../../types/gungnir.js';
import {
    buildPennyOneScanManifest,
    PennyOneResourceLimitError,
    preflightPennyOneFiles,
    readBoundedPennyOneSource,
    type PennyOneResourceLimits,
} from './resource_limits.js';

export interface IntentRefreshResult {
    refreshed: number;
    failed: number;
    total_candidates: number;
}

export interface RunScanOptions {
    include_history?: boolean;
    evaluate_warden?: boolean;
    throttle_ms?: number;
    limits?: Partial<PennyOneResourceLimits>;
}


/**
 * Targeted Incremental Scan (The Sector Strike)
 * Purpose: Re-analyze a single file and update the global matrix.
 * @param {string} filePath - Path to the file to re-index
 * @returns {Promise<FileData | null>} The analyzed data
 */
export async function indexSector(filePath: string): Promise<FileData | null> {
    try {
        const absolutePath = path.resolve(filePath);
        const manifest = await preflightPennyOneFiles([absolutePath]);
        const normalizedPath = registry.normalize(absolutePath);
        const targetRepoRoot = registry.detectWorkspaceRoot(absolutePath);
        const code = await readBoundedPennyOneSource(absolutePath, manifest.limits.max_file_bytes);
        const currentHash = crypto.createHash('md5').update(code).digest('hex');

        // 1. Local Analysis
        const data = await analyzeFile(code, absolutePath);

        // 2. Semantic Analysis (Targeted)
        const indexer = new SemanticIndexer(path.dirname(absolutePath), manifest.limits);
        const semanticGraph = await indexer.index([absolutePath]);
        const semanticData = semanticGraph.files.find(f => registry.normalize(f.path) === normalizedPath);

        if (semanticData) {
            data.matrix = patchGungnirMatrix(data.matrix, {
                logic: (data.matrix.logic + semanticData.logic) / 2,
            });
            data.dependencies = semanticData.dependencies;
            data.cluster = semanticData.cluster;
        }

        // 3. Deterministic local intent projection.
        const intentData = await defaultProvider.getIntent(data);
        data.intent = intentData.intent;
        data.interaction_protocol = intentData.interaction;
        data.hash = currentHash;

        // 4. Global Memory Update (SQLite)
        updateFtsIndex(absolutePath, data.intent ?? '', data.interaction_protocol ?? '');

        // PennyOne projections are derived from Hall records, never patched directly.
        const repoId = buildHallRepositoryId(targetRepoRoot);
        saveHallRepository({
            root_path: targetRepoRoot,
            name: path.basename(targetRepoRoot),
            status: 'AWAKE',
            active_persona: activePersona.name,
            baseline_gungnir_score: getGungnirOverall(data.matrix),
            intent_integrity: 0,
            metadata: {
                source: 'pennyone_sector_index',
                intent_integrity_measurement: 'not_run',
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
            saveHallScan({
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
        saveHallFile({
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
        if (error instanceof PennyOneResourceLimitError) throw error;
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
export async function runScan(
    targetPath: string,
    force = false,
    options: RunScanOptions = {},
): Promise<FileData[]> {
    void force;
    // Resource admission is the first stateful scan boundary. A cap failure
    // must occur before Hall registration, report writes, or heartbeat writes.
    const manifest = await buildPennyOneScanManifest(targetPath, options.limits);

    // [Ω] Register this spoke in the central database only after preflight.
    registerSpoke(targetPath);
    const targetRepoRoot = registry.detectWorkspaceRoot(targetPath);
    saveHallRepository({
        root_path: targetRepoRoot,
        name: path.basename(targetRepoRoot),
        status: 'AWAKE',
        active_persona: activePersona.name,
        baseline_gungnir_score: 0,
        intent_integrity: 0,
        metadata: {
            source: 'pennyone_scan',
            intent_integrity_measurement: 'not_run',
            resource_admission: {
                file_count: manifest.files.length,
                aggregate_bytes: manifest.aggregate_bytes,
                limits: manifest.limits,
            },
            estate_projection: {
                mounted_from: registry.getRoot(),
            },
        },
        created_at: Date.now(),
        updated_at: Date.now(),
    });

    // History ingestion is separately opt-in; a source scan never silently
    // widens into session-history ingestion.
    if (options.include_history === true) {
        const chronicles = new ChronicleIndexer();
        await chronicles.index();

        // Phase 0.5: Temporal History Ingestion (Chronos)
        const chronos = new ChronosIndexer();
        await chronos.index();
    }

    // Phase 3: Semantic Pass (Global Registry)
    const indexer = new SemanticIndexer(targetPath, manifest.limits);
    const semanticGraph = await indexer.index(manifest.files);
    const semanticByPath = new Map(
        semanticGraph.files.map((entry) => [registry.normalize(entry.path), entry]),
    );
    const finalResults: FileData[] = [];

    // Analyze and finalize one bounded source at a time. Source strings never
    // accumulate in an all-repository batch.
    for (let index = 0; index < manifest.files.length; index += 1) {
        const file = manifest.files[index];
        try {
            const code = await readBoundedPennyOneSource(file, manifest.limits.max_file_bytes);
            const normalizedPath = registry.normalize(file);
            const semanticData = semanticByPath.get(normalizedPath);
            const data = await analyzeFile(code, file);
            if (semanticData) {
                data.matrix = patchGungnirMatrix(data.matrix, {
                    logic: (data.matrix.logic + semanticData.logic) / 2,
                });
                data.dependencies = semanticData.dependencies;
                data.cluster = semanticData.cluster;
            }
            const intentData = await defaultProvider.getIntent(data);
            const { intent, interaction } = await writeReport(data, targetPath, intentData);
            data.intent = intent;
            data.interaction_protocol = interaction;
            updateFtsIndex(data.path, intent, interaction);
            finalResults.push(data);

            const status = {
                batch: index + 1,
                total_batches: manifest.files.length,
                last_update: Date.now(),
                status: 'WAITING',
            };
            try {
                fsSync.writeFileSync(path.join(registry.getRoot(), '.agents', 'scan_heartbeat.json'), JSON.stringify(status, null, 2));
            } catch { }
            console.log(chalk.dim(` ✔ Sector ${index + 1}/${manifest.files.length} finalized.`));
            const throttleMs = options.throttle_ms ?? 0;
            if (throttleMs > 0) await new Promise(resolve => setTimeout(resolve, throttleMs));
        } catch (error: unknown) {
            if (error instanceof PennyOneResourceLimitError) throw error;
            console.warn(`[WARNING] Failed to analyze ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    if (finalResults.length > 0) {
        const scanId = `hall-scan:${Date.now()}`;
        const repoId = buildHallRepositoryId(targetRepoRoot);
        const startedAt = Date.now();
        const averageScore = finalResults.reduce((sum, file) => sum + getGungnirOverall(file.matrix), 0) / finalResults.length;

        saveHallScan({
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
            saveHallFile({
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
        if (options.evaluate_warden !== false) {
            try {
                const warden = new Warden();
                await warden.evaluateProjection(targetRepoRoot, scanId);
            } catch (e: unknown) {
                console.warn(`[WARNING] Warden evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    return finalResults;
}

function isPathWithinTarget(recordPath: string, targetPath: string, targetIsDirectory: boolean): boolean {
    const normalizedRecord = registry.normalize(recordPath);
    const normalizedTarget = registry.normalize(targetPath).replace(/[\\/]$/, '');

    if (!targetIsDirectory) {
        return normalizedRecord === normalizedTarget;
    }

    return normalizedRecord === normalizedTarget || normalizedRecord.startsWith(`${normalizedTarget}/`);
}

export async function refreshOfflineIntents(
    targetPath: string,
    requestedLimits: Partial<PennyOneResourceLimits> = {},
): Promise<IntentRefreshResult> {
    const absoluteTarget = path.resolve(targetPath);
    const targetRepoRoot = registry.detectWorkspaceRoot(absoluteTarget);
    const targetStats = await fs.stat(absoluteTarget).catch(() => null);
    const targetIsDirectory = targetStats?.isDirectory() ?? !path.extname(absoluteTarget);
    const repoId = buildHallRepositoryId(targetRepoRoot);
    const candidates = getHallFilesByIntentSummary(OFFLINE_INTENT_PLACEHOLDER, targetRepoRoot)
        .filter((record) => isPathWithinTarget(record.path, absoluteTarget, targetIsDirectory));

    if (candidates.length === 0) {
        return {
            refreshed: 0,
            failed: 0,
            total_candidates: 0,
        };
    }

    // Admit the complete refresh set before the first report or Hall mutation.
    const manifest = await preflightPennyOneFiles(
        candidates.map((record) => record.path),
        requestedLimits,
    );
    let failed = 0;

    let refreshed = 0;
    for (const record of candidates) {
        try {
            const code = await readBoundedPennyOneSource(record.path, manifest.limits.max_file_bytes);
            const data = await analyzeFile(code, record.path);
            data.hash = crypto.createHash('md5').update(code).digest('hex');
            const intentData = await defaultProvider.getIntent(data);
            const { intent, interaction } = await writeReport(data, targetRepoRoot, intentData);
            updateHallFileIntent({
                repo_id: repoId,
                scan_id: record.scan_id,
                path: record.path,
                intent_summary: intent,
                interaction_summary: interaction,
            });
            updateFtsIndex(record.path, intent, interaction);
            refreshed += 1;
        } catch (error: unknown) {
            if (error instanceof PennyOneResourceLimitError) throw error;
            failed += 1;
            console.warn(`[WARNING] Failed to apply refreshed intent for ${record.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return {
        refreshed,
        failed,
        total_candidates: candidates.length,
    };
}
