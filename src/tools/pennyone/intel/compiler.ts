import { FileData, CompiledGraph } from '../types.ts';
import fs from 'fs/promises';
import path from 'path';
import { registry } from '../pathRegistry.ts';
import { getHallFiles, getHallSummary, listHallMountedSpokes } from './database.ts';
import type { HallFileRecord } from '../../../types/hall.ts';
import { createGungnirMatrix, getGungnirOverall } from '../../../types/gungnir.ts';
import type { EstateTopologyPayload } from '../types.ts';

interface ProjectionMetadata {
    authority: 'hall_projection' | 'runtime_scan';
    scan_id?: string;
    artifact_role: 'runtime_view' | 'compatibility_export';
}

function buildCompiledGraph(
    results: FileData[],
    targetRepo: string,
    projection: ProjectionMetadata,
): CompiledGraph {
    // Create a set of all known absolute paths for fast lookup
    const knownPaths = new Set(results.map(r => registry.normalize(r.path)));

    /**
     * Helper to resolve an import path to an absolute file path known by the scan.
     * @param {string} sourceFile - The source file
     * @param {string} importPath - The import path
     * @returns {string | null} The absolute path or null
     */
    const resolveDependency = (sourceFile: string, importPath: string): string | null => {
        let absolute: string;

        // 1. Python dot-notation normalization
        let normalizedImport = importPath;
        if (!importPath.startsWith('.') && importPath.includes('.') && !importPath.includes('/')) {
            normalizedImport = importPath.replace(/\./g, '/');
        }

        // 2. Initial resolution
        if (normalizedImport.startsWith('.')) {
            absolute = registry.resolve(sourceFile, normalizedImport);
        } else {
            // Assume package or absolute path within targetRepo
            absolute = registry.normalize(path.join(targetRepo, normalizedImport));
        }

        // 3. Try variations (Handling TS/ESM extension quirks)
        const candidates = [absolute];

        // If it's an ESM import ending in .js, it might actually be a .ts file on disk
        if (absolute.endsWith('.js')) {
            candidates.push(absolute.slice(0, -3));
        }

        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py'];

        for (const cand of candidates) {
            // Exact match or with extensions
            for (const ext of extensions) {
                const p = cand + ext;
                if (knownPaths.has(p)) return p;
            }

            // Index file resolution
            for (const ext of extensions.filter(e => e !== '')) {
                const indexFile = registry.normalize(path.join(cand, `index${ext}`));
                if (knownPaths.has(indexFile)) return indexFile;
            }
        }

        return null;
    };

    const payload: CompiledGraph = {
        version: '1.8.0',
        scanned_at: new Date().toISOString(),
        projection: {
            authority: projection.authority,
            repo_root: registry.normalize(targetRepo),
            scan_id: projection.scan_id,
            artifact_role: projection.artifact_role,
        },
        files: results.map(r => ({
            path: registry.normalize(r.path),
            loc: r.loc,
            complexity: r.complexity,
            matrix: createGungnirMatrix(r.matrix),
            intent: r.intent || '...',
            interaction_protocol: r.interaction_protocol,
            dependencies: r.imports
                .map(i => resolveDependency(r.path, i.source))
                .filter((d): d is string => d !== null && d !== registry.normalize(r.path)),
            hash: r.hash,
            endpoints: r.endpoints,
            is_api: r.is_api
        })),
        summary: {
            total_files: results.length,
            total_loc: results.reduce((a, b) => a + b.loc, 0),
            average_score: results.length > 0
                ? results.reduce((a, b) => a + getGungnirOverall(b.matrix), 0) / results.length
                : 0
        }
    };

    payload.files.forEach(f => {
        f.dependencies = [...new Set(f.dependencies)];
    });

    return payload;
}

export function compileMatrixPayload(results: FileData[], targetRepo: string): CompiledGraph {
    return buildCompiledGraph(results, targetRepo, {
        authority: 'runtime_scan',
        artifact_role: 'compatibility_export',
    });
}

/**
 * Matrix Compiler
 * Purpose: Compile all FileData into a master JSON graph with resolved dependencies.
 * @param {FileData[]} results - The analysis results
 * @param {string} targetRepo - The target repository path
 * @returns {Promise<string>} Path to the generated graph
 */
export async function compileMatrix(results: FileData[], targetRepo: string): Promise<string> {
    const statsDir = path.join(registry.getRoot(), '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const graphPath = path.join(statsDir, 'matrix-graph.json');
    const payload = compileMatrixPayload(results, targetRepo);

    await fs.writeFile(graphPath, JSON.stringify(payload, null, 2), 'utf-8');
    return graphPath;
}

export function compileMatrixFromHall(
    records: HallFileRecord[],
    targetRepo: string,
    options: {
        scanId?: string;
        artifactRole?: 'runtime_view' | 'compatibility_export';
    } = {},
): CompiledGraph {
    const results: FileData[] = records.map((record) => ({
        path: record.path,
        loc: 0,
        complexity: 0,
        matrix: createGungnirMatrix(record.matrix),
        imports: record.imports ?? [],
        exports: record.exports ?? [],
        intent: record.intent_summary,
        interaction_protocol: record.interaction_summary,
        hash: record.content_hash ?? '',
        dependencies: [],
    }));
    return buildCompiledGraph(results, targetRepo, {
        authority: 'hall_projection',
        scan_id: options.scanId ?? records[0]?.scan_id,
        artifact_role: options.artifactRole ?? 'runtime_view',
    });
}

export function readProjectedMatrixGraph(
    targetRepo: string,
    scanId?: string,
): CompiledGraph {
    return compileMatrixFromHall(getHallFiles(targetRepo, scanId), targetRepo, {
        scanId,
        artifactRole: 'runtime_view',
    });
}

export async function writeProjectedMatrixGraph(
    targetRepo: string,
    scanId?: string,
): Promise<string> {
    const statsDir = path.join(registry.getRoot(), '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const graphPath = path.join(statsDir, 'matrix-graph.json');
    const payload = compileMatrixFromHall(getHallFiles(targetRepo, scanId), targetRepo, {
        scanId,
        artifactRole: 'compatibility_export',
    });
    await fs.writeFile(graphPath, JSON.stringify(payload, null, 2), 'utf-8');
    return graphPath;
}

export function buildEstateTopology(workspaceRoot: string = registry.getRoot()): EstateTopologyPayload {
    const brainSummary = getHallSummary(workspaceRoot);
    const mountedSpokes = listHallMountedSpokes(workspaceRoot);
    const nodes: EstateTopologyPayload['nodes'] = [];
    const edges: EstateTopologyPayload['edges'] = [];

    if (brainSummary) {
        nodes.push({
            id: brainSummary.repo_id,
            label: brainSummary.name,
            kind: 'brain' as const,
            root_path: brainSummary.root_path,
            status: brainSummary.status,
            baseline_gungnir_score: brainSummary.baseline_gungnir_score,
            open_beads: brainSummary.open_beads,
            validation_runs: brainSummary.validation_runs,
        });
    }

    for (const mounted of mountedSpokes) {
        const summary = getHallSummary(mounted.root_path);
        nodes.push({
            id: mounted.spoke_id,
            label: mounted.slug,
            kind: 'spoke' as const,
            root_path: mounted.root_path,
            status: summary?.status ?? mounted.mount_status.toUpperCase(),
            baseline_gungnir_score: summary?.baseline_gungnir_score ?? 0,
            open_beads: summary?.open_beads ?? 0,
            validation_runs: summary?.validation_runs ?? 0,
            mount_status: mounted.mount_status,
            trust_level: mounted.trust_level,
            projection_status: mounted.projection_status,
        });

        if (brainSummary) {
            edges.push({
                source: brainSummary.repo_id,
                target: mounted.spoke_id,
                relation: 'mounted_spoke' as const,
            });
        }
    }

    return {
        generated_at: new Date().toISOString(),
        brain_id: brainSummary?.repo_id ?? `repo:${registry.normalize(workspaceRoot)}`,
        nodes,
        edges,
    };
}


