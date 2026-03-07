import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { registry } from '../pathRegistry.ts';
import { searchIntents } from '../intel/database.ts';
import { HUD } from '../../../node/core/hud.ts';

/**
 * Search matrix
 * @param {string} query - The search query
 * @param {string} _targetPath - Optional path to target
 * @returns {Promise<void>} The search results
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMatrix(query: string, _targetPath: string = '.'): Promise<void> {
    const palette = HUD.palette;
    process.stdout.write(HUD.boxTop(`WELL OF MIMIR: SEARCHING "${query}"`));

    try {
        // 1. Primary Path: High-Fidelity FTS5 Search
        const dbResults = searchIntents(query);

        if (dbResults.length > 0) {
            // Load the graph to get full metrics for the FTS results
            const statsDir = path.join(registry.getRoot(), '.stats');
            const graphPath = path.join(statsDir, 'matrix-graph.json');
            let graph: any = { files: [] };
            try {
                graph = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
            } catch { /* fallback to partial data */ }

            dbResults.forEach(r => {
                if (r.type === 'LORE') {
                    process.stdout.write(HUD.boxRow('📜 LORE', r.path, palette.mimir));
                    process.stdout.write(HUD.boxRow('  INTENT', (r.intent.slice(0, 40) + '...'), palette.void));
                    process.stdout.write(HUD.boxSeparator());
                    return;
                }

                const entry = graph.files.find((f: any) => registry.normalize(f.path) === registry.normalize(r.path));
                const m = entry?.matrix || { overall: 0 };
                
                process.stdout.write(HUD.boxRow('◈ SECTOR', registry.getRelative(r.path), palette.accent));
                process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
                process.stdout.write(HUD.boxRow('  INTENT', (r.intent || '...').slice(0, 40) + '...', palette.void));
                process.stdout.write(HUD.boxSeparator());
            });
            process.stdout.write(HUD.boxNote(palette.bifrost(`Found ${dbResults.length} high-fidelity sectors via FTS5.`)));
            process.stdout.write(HUD.boxBottom());
            return;
        }

        // 2. Fallback Path: Heuristic Graph Search (Structural)
        const statsDir = path.join(registry.getRoot(), '.stats');
        const graphPath = path.join(statsDir, 'matrix-graph.json');
        
        const raw = await fs.readFile(graphPath, 'utf-8');
        const graph = JSON.parse(raw);
        const results = [];

        const lowerQuery = query.toLowerCase();

        for (const file of graph.files) {
            const relPath = registry.getRelative(file.path);
            const intentText = file.intent || '';
            const matchesIntent = intentText.toLowerCase().includes(lowerQuery);
            const matchesPath = relPath.toLowerCase().includes(lowerQuery);

            if (matchesIntent || matchesPath) {
                results.push(file);
            }
        }

        if (results.length === 0) {
            process.stdout.write(HUD.boxRow('INFO', 'No matches found in the Hall of Records.', chalk.yellow));
            process.stdout.write(HUD.boxBottom());
            return;
        }

        results.forEach(r => {
            const m = r.matrix || { overall: 0 };
            process.stdout.write(HUD.boxRow('◈ SECTOR', registry.getRelative(r.path), chalk.blue));
            process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
            process.stdout.write(HUD.boxRow('  INTENT', (r.intent || '...').slice(0, 40) + '...'));
            process.stdout.write(HUD.boxSeparator());
        });

        process.stdout.write(HUD.boxNote(`Found ${results.length} relevant sectors via heuristic scan.`));
        process.stdout.write(HUD.boxBottom());

    } catch (err) {
        process.stdout.write(HUD.boxRow('ERROR', 'Hall of Records currently inaccessible.', chalk.red));
        process.stdout.write(HUD.boxBottom());
    }
}

/**
 * CLI entry point for testing
 */
if (process.argv[1].includes('search')) {
    const q = process.argv.slice(2).join(' ');
    if (q) searchMatrix(q);
}
