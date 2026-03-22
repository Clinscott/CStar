import chalk from 'chalk';
import { registry } from  '../pathRegistry.js';
import { getHallFiles, getLatestHallScanId, listHallMountedSpokes, searchIntents } from  '../intel/database.js';
import { HUD } from  '../../../node/core/hud.js';
import { createGungnirMatrix } from  '../../../types/gungnir.js';
import type { HallFileRecord } from  '../../../types/hall.js';

function getEstateHallFiles(workspaceRoot: string): HallFileRecord[] {
    const mounted = listHallMountedSpokes(workspaceRoot);
    const roots = [workspaceRoot, ...mounted.map((entry) => entry.root_path)];
    const files: HallFileRecord[] = [];

    for (const root of roots) {
        files.push(...getHallFiles(root, getLatestHallScanId(root)));
    }

    return files;
}

function formatEstatePath(filePath: string, workspaceRoot: string): string {
    const mounted = listHallMountedSpokes(workspaceRoot);
    const normalized = registry.normalize(filePath);
    for (const entry of mounted) {
        const root = registry.normalize(entry.root_path);
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (normalized === root || normalized.startsWith(prefix)) {
            const relative = normalized.slice(prefix.length);
            return relative ? `spoke://${entry.slug}/${relative}` : `spoke://${entry.slug}/`;
        }
    }

    return registry.getRelative(filePath);
}

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
        const hallFiles = getEstateHallFiles(registry.getRoot());
        const hallFileMap = new Map(hallFiles.map((record) => [registry.normalize(record.path), record]));

        // 1. Primary Path: High-Fidelity FTS5 Search
        const dbResults = searchIntents(query);

        if (dbResults.length > 0) {
            dbResults.forEach(r => {
                if (r.type === 'LORE') {
                    process.stdout.write(HUD.boxRow('📜 LORE', r.path, palette.mimir));
                    process.stdout.write(HUD.boxRow('  INTENT', (r.intent.slice(0, 40) + '...'), palette.void));
                    process.stdout.write(HUD.boxSeparator());
                    return;
                }

                const entry = hallFileMap.get(registry.normalize(r.path));
                const m = entry?.matrix ? createGungnirMatrix(entry.matrix) : createGungnirMatrix({});
                
                process.stdout.write(HUD.boxRow('◈ SECTOR', formatEstatePath(r.path, registry.getRoot()), palette.accent));
                process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
                process.stdout.write(HUD.boxRow('  INTENT', (r.intent || '...').slice(0, 40) + '...', palette.void));
                process.stdout.write(HUD.boxSeparator());
            });
            process.stdout.write(HUD.boxNote(palette.bifrost(`Found ${dbResults.length} high-fidelity sectors via FTS5.`)));
            process.stdout.write(HUD.boxBottom());
            return;
        }

        // 2. Fallback Path: Heuristic Hall Search (Structural)
        const results = [];

        const lowerQuery = query.toLowerCase();

        for (const file of hallFiles) {
            const relPath = registry.getRelative(file.path);
            const intentText = file.intent_summary || '';
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
            const m = r.matrix ? createGungnirMatrix(r.matrix) : createGungnirMatrix({});
            process.stdout.write(HUD.boxRow('◈ SECTOR', formatEstatePath(r.path, registry.getRoot()), chalk.blue));
            process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
            process.stdout.write(HUD.boxRow('  INTENT', (r.intent_summary || '...').slice(0, 40) + '...'));
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

