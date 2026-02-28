import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { registry } from '../pathRegistry.js';

/**
 * [O.D.I.N.]: "The Gungnir Compass searches through the Hall of Records."
 */

export async function searchMatrix(query: string, targetPath: string = '.') {
    const statsDir = path.join(process.cwd(), '.stats');
    const graphPath = path.join(statsDir, 'matrix-graph.json');

    try {
        const raw = await fs.readFile(graphPath, 'utf-8');
        const graph = JSON.parse(raw);
        const results = [];

        const lowerQuery = query.toLowerCase();

        for (const file of graph.files) {
            const relPath = registry.getRelative(file.path);
            const intentText = file.intent || "";
            const matchesIntent = intentText.toLowerCase().includes(lowerQuery);
            const matchesPath = relPath.toLowerCase().includes(lowerQuery);
            const matchesEndpoints = file.endpoints?.some((e: string) => e.toLowerCase().includes(lowerQuery));

            if (matchesIntent || matchesPath || matchesEndpoints) {
                results.push(file);
            }
        }

        console.log(chalk.cyan(`\n ◤ GUNGNIR SEARCH: "${query}" ◢ `));
        console.log(chalk.cyan(' ' + '━'.repeat(45)));

        if (results.length === 0) {
            console.log(chalk.yellow(' [INFO] No matches found in the Hall of Records.'));
            console.log(chalk.dim(' Try a broader query or ensure a scan has been run.\n'));
            return;
        }

        results.forEach(r => {
            console.log(` ◈ ${chalk.blue(registry.getRelative(r.path))}`);
            console.log(`   ${chalk.white('Intent:')} ${chalk.italic(r.intent || "...")}`);
            if (r.endpoints?.length > 0) {
                console.log(`   ${chalk.magenta('Gateways:')} ${r.endpoints.slice(0, 2).join(', ')}`);
            }
            console.log(`   ${chalk.dim(`[L] ${r.matrix.logic.toFixed(1)} | [G] ${r.matrix.gravity}`)}`);
            console.log();
        });

        console.log(chalk.cyan(' ' + '━'.repeat(45)));
        console.log(chalk.cyan(` Found ${results.length} relevant sectors.\n`));

    } catch (err) {
        console.error(chalk.red('[ALFRED]: "I am afraid the Hall of Records is currently inaccessible, sir."'));
    }
}

/**
 * CLI entry point for testing
 */
if (process.argv[1].includes('search')) {
    const q = process.argv.slice(2).join(' ');
    if (q) searchMatrix(q);
}
