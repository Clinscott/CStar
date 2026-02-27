import { FileData } from '../analyzer.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Matrix Compiler
 * Purpose: Compile all FileData into a master JSON graph with resolved dependencies.
 * Mandate: Normalize all paths to forward slashes for cross-platform/D3 consistency.
 */
export async function compileMatrix(results: FileData[], targetRepo: string): Promise<string> {
    const statsDir = path.join(targetRepo, '.stats');
    await fs.mkdir(statsDir, { recursive: true });

    const graphPath = path.join(statsDir, 'matrix-graph.json');

    // Normalize utility
    const normalize = (p: string) => p.replace(/\\/g, '/');

    // Create a set of all known absolute paths for fast lookup
    const knownPaths = new Set(results.map(r => normalize(r.path)));

    // Helper to resolve an import
    const resolveDependency = (sourceFile: string, importPath: string): string | null => {
        if (!importPath.startsWith('.')) return null;

        const dir = path.dirname(sourceFile);
        let absolute = normalize(path.resolve(dir, importPath));

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
            const indexFile = normalize(path.join(absolute, `index${ext}`));
            if (knownPaths.has(indexFile)) return indexFile;
        }

        return null;
    };

    const payload = {
        version: "1.6.2",
        scanned_at: new Date().toISOString(),
        files: results.map(r => ({
            path: normalize(r.path),
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
