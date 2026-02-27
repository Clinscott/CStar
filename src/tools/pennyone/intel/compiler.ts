import { FileData } from '../analyzer.js';
import fs from 'fs/promises';
import path from 'path';
import { registry } from '../pathRegistry.js';

export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
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
    const statsDir = path.join(targetRepo, '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const graphPath = path.join(statsDir, 'matrix-graph.json');

    // Create a set of all known absolute paths for fast lookup
    const knownPaths = new Set(results.map(r => registry.normalize(r.path)));

    // Helper to resolve an import
    const resolveDependency = (sourceFile: string, importPath: string): string | null => {
        let absolute: string;

        // Python specific: Convert dot-notation (core.engine) to path (core/engine)
        // only if it's not a relative import and contains dots
        let normalizedImport = importPath;
        if (!importPath.startsWith('.') && importPath.includes('.')) {
            normalizedImport = importPath.replace(/\./g, '/');
        }

        if (normalizedImport.startsWith('.')) {
            // Standard relative import (JS/TS or local Python)
            absolute = registry.resolve(sourceFile, normalizedImport);
        } else {
            // Absolute import (Usually Python root imports)
            absolute = registry.normalize(path.join(targetRepo, normalizedImport));
        }

        // 1. Try exact match
        if (knownPaths.has(absolute)) return absolute;

        // 2. Handle .js -> .ts / .tsx mapping (ESM style)
        if (absolute.endsWith('.js')) {
            const base = absolute.slice(0, -3);
            if (knownPaths.has(base + '.ts')) return base + '.ts';
            if (knownPaths.has(base + '.tsx')) return base + '.tsx';
        }

        // 3. Try common extensions if no extension provided
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];
        for (const ext of extensions) {
            if (knownPaths.has(absolute + ext)) return absolute + ext;
        }

        // 4. Try index files
        for (const ext of extensions) {
            const indexFile = registry.normalize(path.join(absolute, `index${ext}`));
            if (knownPaths.has(indexFile)) return indexFile;
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
            dependencies: r.imports
                .map(i => resolveDependency(r.path, i.source))
                .filter((d): d is string => d !== null)
        })),
        summary: {
            total_files: results.length,
            total_loc: results.reduce((a, b) => a + b.loc, 0),
            average_score: results.reduce((a, b) => a + b.matrix.overall, 0) / results.length
        }
    };

    await fs.writeFile(graphPath, JSON.stringify(payload, null, 2), 'utf-8');
    return graphPath;
}

