import { FileData } from '../analyzer.js';
import fs from 'fs/promises';
import path from 'path';
import { registry } from '../pathRegistry.js';

export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
    gravity: number;
}

export interface CompiledGraph {
    version: string;
    scanned_at: string;
    files: Array<{
        path: string;
        loc: number;
        complexity: number;
        matrix: GungnirMatrix;
        intent: string;
        dependencies: string[];
        hash: string;
        endpoints?: string[];
        is_api?: boolean;
    }>;
    summary: {
        total_files: number;
        total_loc: number;
        average_score: number;
    };
}

/**
 * Matrix Compiler
 * Purpose: Compile all FileData into a master JSON graph with resolved dependencies.
 */
export async function compileMatrix(results: FileData[], targetRepo: string): Promise<string> {
    const statsDir = path.join(process.cwd(), '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const graphPath = path.join(statsDir, 'matrix-graph.json');

    // Create a set of all known absolute paths for fast lookup
    const knownPaths = new Set(results.map(r => registry.normalize(r.path)));

    /**
     * Helper to resolve an import path to an absolute file path known by the scan.
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
        version: "1.7.0",
        scanned_at: new Date().toISOString(),
        files: results.map(r => ({
            path: registry.normalize(r.path),
            loc: r.loc,
            complexity: r.complexity,
            matrix: r.matrix,
            intent: r.intent || "...",
            dependencies: r.cachedDependencies || r.imports
                .map(i => resolveDependency(r.path, i.source))
                .filter((d): d is string => d !== null && d !== registry.normalize(r.path)), // Avoid self-refs
            hash: r.hash,
            endpoints: r.endpoints,
            is_api: r.is_api
        })),
        summary: {
            total_files: results.length,
            total_loc: results.reduce((a, b) => a + b.loc, 0),
            average_score: results.length > 0 
                ? results.reduce((a, b) => a + b.matrix.overall, 0) / results.length
                : 0
        }
    };

    // Deduplicate dependencies per file
    payload.files.forEach(f => {
        f.dependencies = [...new Set(f.dependencies)];
    });

    await fs.writeFile(graphPath, JSON.stringify(payload, null, 2), 'utf-8');
    return graphPath;
}
