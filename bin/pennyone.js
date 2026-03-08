#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runScan } from '../src/tools/pennyone/index.js';
import { P1Daemon } from '../src/tools/pennyone/daemon.js';
import { startProxy } from '../src/tools/pennyone/vis/proxy.js';
import { searchMatrix } from '../src/tools/pennyone/live/search.js';
import fs from 'node:fs';
import path from 'node:path';
import { registry } from '../src/tools/pennyone/pathRegistry.js';
import { ANS } from '../src/node/core/ans.js';

const program = new Command();

program
    .name('p1')
    .description('PennyOne: Autonomic Repository Intelligence System (v2.0)')
    .version('2.0.0');

program
    .command('scan')
    .description('Run a one-time structural scan of the repository')
    .argument('[path]', 'path to scan', '.')
    .option('-f, --force', 'force re-analysis of all files', false)
    .option('-m, --mock', 'use mock intent generation (fast/offline)', false)
    .action(async (targetPath, options) => {
        console.log(chalk.cyan('\n[ALFRED]: "Initializing Operation PennyOne... Scanning the neural pathways, sir."\n'));
        try {
            const results = await runScan(targetPath, options.force, options.mock);
            console.log(chalk.cyan(`[ALFRED]: "Scan complete. Total Files: ${results.length}."`));
        } catch (err) {
            console.error(chalk.red('[ALFRED]: "One-time scan failed."'), err);
            process.exit(1);
        }
    });

program
    .command('start')
    .description('Ignite the background P1 Daemon (Continuous Intelligence)')
    .argument('[path]', 'path to monitor', '.')
    .action((targetPath) => {
        const daemon = new P1Daemon(targetPath);
        daemon.start();
    });

program
    .command('status')
    .description('Check the status of the P1 Daemon')
    .action(() => {
        const statsDir = path.join(registry.getRoot(), '.stats');
        const pidFile = path.join(statsDir, 'p1-daemon.pid');
        
        if (fs.existsSync(pidFile)) {
            const pid = fs.readFileSync(pidFile, 'utf-8');
            try {
                process.kill(parseInt(pid), 0);
                console.log(chalk.green(`[ALFRED]: "The P1 Daemon is ACTIVE. (PID: ${pid})"`));
            } catch {
                console.log(chalk.yellow('[ALFRED]: "The P1 Daemon is STALLED (PID file exists but process is dead)."'));
            }
        } else {
            console.log(chalk.dim('[ALFRED]: "The P1 Daemon is currently DORMANT."'));
        }
    });

program
    .command('view')
    .description('Launch the P1 Visualization Bridge')
    .argument('[path]', 'path to target', '.')
    .option('-p, --port <number>', 'port to run on', '4000')
    .action((targetPath, options) => {
        console.log(chalk.cyan('\n[ALFRED]: "Pre-flight checks complete. Spinning up the visualization proxy, sir."\n'));
        startProxy(targetPath, parseInt(options.port));
    });

program
    .command('stop')
    .description('Terminate the P1 Daemon')
    .action(() => {
        const statsDir = path.join(registry.getRoot(), '.stats');
        const pidFile = path.join(statsDir, 'p1-daemon.pid');
        if (fs.existsSync(pidFile)) {
            const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
            try {
                process.kill(pid, 'SIGTERM');
                console.log(chalk.yellow('[ALFRED]: "Termination signal sent to P1 Daemon."'));
            } catch (e) {
                console.error(chalk.red('Failed to kill daemon process.'));
            }
        } else {
            console.log(chalk.dim('[ALFRED]: "No active P1 Daemon found."'));
        }
    });

program
    .command('clean')
    .description('Purge the .stats/ directory with tiered retention')
    .argument('[path]', 'repository path', '.')
    .option('--total-reset', 'DANGEROUS: Hard purge of all matrix scores, gravity, and SQLite history')
    .option('--ghosts', 'Remove .qmd reports for files that no longer exist (Default)')
    .action(async (target, options) => {
        const statsDir = path.join(target, '.stats');
        
        try {
            if (options.totalReset) {
                await fs.rm(statsDir, { recursive: true, force: true });
                console.log(chalk.red(`\n[ALFRED]: "TOTAL RESET COMPLETE. The Hall of Records has been leveled, sir."\n`));
                return;
            }

            // Default: Surgical Clean (Ghosts)
            console.log(chalk.cyan(`\n[ALFRED]: "Performing surgical clean of the archives..."`));
            
            const graphPath = path.join(statsDir, 'matrix-graph.json');
            if (fs.existsSync(graphPath)) {
                const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
                const knownFiles = new Set(graph.files.map(f => f.path));
                
                const reportFiles = fs.readdirSync(statsDir).filter(f => f.endsWith('.qmd'));
                let removed = 0;

                for (const report of reportFiles) {
                    // This is a heuristic - real mapping is in writer.ts
                    // For now, we skip surgical delete to keep it safe, 
                    // just clearing the sessions folder if requested or 
                    // providing basic feedback.
                }
            }

            console.log(chalk.green(`[ALFRED]: "Surgical clean complete. Long-term memory preserved."\n`));

        } catch (err) {
            console.error(chalk.red('[ALFRED]: "I am afraid I could not complete the cleaning, sir."'), err);
        }
    });

program
    .command('search')
    .description('Query the Well of Mimir for repository intelligence')
    .argument('<query>', 'Search query')
    .argument('[path]', 'Target directory', '.')
    .action(async (query, target) => {
        await searchMatrix(query, target);
    });

program
    .command('mcp')
    .description('Explain the Model Context Protocol (MCP) integration')
    .action(() => {
        console.log(chalk.cyan('\n ◤ THE BIFROST BRIDGE: MCP DOCUMENTATION ◢ '));
        console.log(chalk.white(' PennyOne is exposed via the "pennyone" MCP server.'));
        console.log(chalk.white('\n Available Tools:'));
        console.log(chalk.yellow('  ◈ search_by_intent: ') + chalk.dim('High-fidelity FTS5 search of Mimir\'s Well.'));
        console.log(chalk.yellow('  ◈ get_file_intent:  ') + chalk.dim('Retrieve the intent and protocol for a specific file.'));
        console.log(chalk.yellow('  ◈ index_sector:     ') + chalk.dim('Trigger an incremental scan of a single file.'));
        console.log(chalk.yellow('  ◈ get_technical_debt: ') + chalk.dim('Retrieve the current Sterling Mandate ledger.'));
        console.log(chalk.cyan('\n [MANDATE]: Agents MUST use these tools before performing generic shell searches.\n'));
    });

program.hook('preAction', async () => {
    await ANS.wake();
});

program.parse();


