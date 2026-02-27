#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runScan } from '../src/tools/pennyone/index.js';
import { startBridge } from '../src/tools/pennyone/vis/server.js';

const program = new Command();

program
    .name('pennyone')
    .description('PennyOne: 3D Repository Stat Crawler')
    .version('1.5.0');

program
    .command('scan')
    .description('Scan the repository for static stats and Gungnir Matrix scores')
    .argument('[path]', 'path to scan', '.')
    .action(async (path) => {
        console.log(chalk.cyan('\n[ALFRED]: "Initializing Operation PennyOne... Scanning the neural pathways, sir."\n'));

        try {
            const results = await runScan(path);

            if (results.length === 0) {
                console.warn(chalk.yellow(`[ALFRED]: "I am afraid the scan path '${path}' yielded no results, sir. Perhaps the Python Paradox has claimed another victim?"`));
                process.exit(1);
            }

            console.log(chalk.white('--- Scan Results ---'));
            results.forEach(res => {
                const m = res.matrix;
                const getScoreColor = (s) => s > 7 ? chalk.green : (s > 4 ? chalk.yellow : chalk.red);

                console.log(
                    chalk.blue(`[File]: ${res.path.replace(process.cwd(), '')}\n`) +
                    `  LOC: ${chalk.white(res.loc)} | Complexity: ${chalk.white(res.complexity)}\n` +
                    `  Matrix: [L] ${getScoreColor(m.logic)(m.logic.toFixed(1))} | [S] ${getScoreColor(m.style)(m.style.toFixed(1))} | [I] ${getScoreColor(m.intel)(m.intel.toFixed(1))} | ` +
                    chalk.bold(`Score: ${getScoreColor(m.overall)(m.overall.toFixed(2))}\n`)
                );
            });

            const totalLoc = results.reduce((acc, curr) => acc + curr.loc, 0);
            const avgScore = results.length > 0 ? (results.reduce((acc, curr) => acc + curr.matrix.overall, 0) / results.length).toFixed(2) : 0;

            console.log(chalk.cyan(`\n[ALFRED]: "Scan complete, sir. Generated ${results.length} reports and compiled the matrix graph in the '.stats/' directory."`));
            console.log(chalk.cyan(`[ALFRED]: "Total LOC: ${totalLoc}. Average Gungnir Score: ${avgScore} (Scale 1-10)."`));
            console.log(chalk.cyan('[ALFRED]: "The visualization bridge is primed for Phase 3."\n'));

        } catch (err) {
            console.error(chalk.red('\n[ALFRED]: "I am dreadfully sorry, sir. The scan has failed."'));
            console.error(err);
            process.exit(1);
        }
    });

program
    .command('view')
    .description('Spin up the 3D Gungnir Matrix visualization bridge')
    .argument('[path]', 'path to the scanned repository', '.')
    .option('-p, --port <number>', 'port to run the bridge on', '4000')
    .action((path, options) => {
        console.log(chalk.cyan('\n[ALFRED]: "Pre-flight checks complete. Spinning up the visualization bridge, sir."\n'));
        startBridge(path, parseInt(options.port));
    });

program.parse();
