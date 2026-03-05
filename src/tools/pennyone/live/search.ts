import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { registry } from '../pathRegistry.ts';
import { searchIntents } from '../intel/database.ts';

/**
 * Search matrix
 * @param {string} query - The search query
 * @param {string} _targetPath - Optional path to target
 * @returns {Promise<void>} The search results
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMatrix(query: string, _targetPath: string = '.'): Promise<void> {
    console.log(chalk.cyan(`\n ◤ WELL OF MIMIR: SEARCHING "${query}" ◢ `));
    console.log(chalk.cyan(' ' + '━'.repeat(45)));

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
                    console.log(` 📜 ${chalk.magenta(r.path)} > ${chalk.white.bold(r.intent)}`);
                    console.log(`   ${chalk.dim(r.interaction_protocol.slice(0, 300) + '...')}`);
                    console.log();
                    return;
                }

                const entry = graph.files.find((f: any) => registry.normalize(f.path) === registry.normalize(r.path));
                const m = entry?.matrix || { overall: 0 };
                
                console.log(` ◈ ${chalk.yellow(registry.getRelative(r.path))} [Ω: ${((m.sovereignty || 0) * 100).toFixed(0)}%]`);
                console.log(`   ${chalk.white('Intent:')} ${chalk.italic(r.intent || '...')}`);
                
                const metrics = [
                    `L: ${Number(m.logic || 0).toFixed(1)}`,
                    `S: ${Number(m.style || 0).toFixed(1)}`,
                    `I: ${Number(m.intel || 0).toFixed(1)}`,
                    `G: ${Number(m.gravity || 0).toFixed(0)}`,
                    `V: ${Number(m.vigil || 0).toFixed(1)}`,
                    `St: ${Number(m.stability || 0).toFixed(2)}`,
                    `Cp: ${Number(m.coupling || 0).toFixed(2)}`,
                    `Ae: ${Number(m.aesthetic || 0).toFixed(1)}`,
                    `An: ${Number(m.anomaly || 0).toFixed(2)}`,
                    `Ov: ${Number(m.overall || 0).toFixed(1)}`
                ];
                console.log(`   ${chalk.dim(metrics.join(' | '))}`);
                
                if (r.interaction_protocol) {
                    console.log(`   ${chalk.yellow('Protocol:')} ${chalk.dim(r.interaction_protocol)}`);
                }
                console.log();
            });
            console.log(chalk.cyan(' ' + '━'.repeat(45)));
            console.log(chalk.cyan(` Found ${dbResults.length} high-fidelity sectors via FTS5.\n`));
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
            console.log(chalk.yellow(' [INFO] No matches found in the Hall of Records.'));
            console.log(chalk.dim(' Try a broader query or ensure a scan has been run.\n'));
            return;
        }

        results.forEach(r => {
            const m = r.matrix || { overall: 0 };
            console.log(` ◈ ${chalk.blue(registry.getRelative(r.path))} [Ω: ${((m.sovereignty || 0) * 100).toFixed(0)}%]`);
            console.log(`   ${chalk.white('Intent:')} ${chalk.italic(r.intent || '...')}`);
            
            const metrics = [
                `L: ${Number(m.logic || 0).toFixed(1)}`,
                `S: ${Number(m.style || 0).toFixed(1)}`,
                `I: ${Number(m.intel || 0).toFixed(1)}`,
                `G: ${Number(m.gravity || 0).toFixed(0)}`,
                `V: ${Number(m.vigil || 0).toFixed(1)}`,
                `St: ${Number(m.stability || 0).toFixed(2)}`,
                `Cp: ${Number(m.coupling || 0).toFixed(2)}`,
                `Ae: ${Number(m.aesthetic || 0).toFixed(1)}`,
                `An: ${Number(m.anomaly || 0).toFixed(2)}`,
                `Ov: ${Number(m.overall || 0).toFixed(1)}`
            ];
            console.log(`   ${chalk.dim(metrics.join(' | '))}`);
            console.log();
        });

        console.log(chalk.cyan(' ' + '━'.repeat(45)));
        console.log(chalk.cyan(` Found ${results.length} relevant sectors via heuristic scan.\n`));

    } catch (err) {
        console.error(chalk.red('[ALFRED]: "I am afraid the Hall of Records is currently inaccessible, sir."'), err);
    }
}

/**
 * CLI entry point for testing
 */
if (process.argv[1].includes('search')) {
    const q = process.argv.slice(2).join(' ');
    if (q) searchMatrix(q);
}

