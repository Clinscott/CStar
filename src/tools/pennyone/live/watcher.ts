import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { runScan } from '../index.js';
import { compileMatrix } from '../intel/compiler.js';
import { SubspaceRelay } from './socket.js';
import chalk from 'chalk';

/**
 * RepositoryWatcher: Monitors files and triggers delta analysis
 */
export function startWatcher(targetPath: string, relay: SubspaceRelay) {
    const watcher = chokidar.watch(targetPath, {
        ignored: [/(^|[\/\\])\../, '**/node_modules/**', '**/.stats/**'],
        persistent: true,
        ignoreInitial: true
    });

    console.log(chalk.cyan(`[A.L.F.R.E.D]: "Telemetry sensors active. Monitoring sector: ${targetPath}"`));

    // 1. Handle File Changes (Delta Update)
    watcher.on('change', async (filePath: string) => {
        if (!filePath.match(/\.(ts|js|tsx|jsx|py)$/)) return;

        console.log(chalk.yellow(`[A.L.F.R.E.D]: "Delta detected in ${path.basename(filePath)}. Recalibrating sensors..."`));
        try {
            // Re-run the full scan for consistency and to update qmd/json
            const results = await runScan(targetPath);
            const data = results.find(r => r.path.replace(/\\/g, '/') === filePath.replace(/\\/g, '/'));

            if (data) {
                // Broadcast update to frontend for smooth interpolation
                relay.broadcast('NODE_UPDATED', {
                    path: data.path,
                    loc: data.loc,
                    matrix: data.matrix,
                    intent: data.intent || "..."
                });
            }
        } catch (err) {
            console.error(chalk.red(`[ERROR] Failed to process delta for ${filePath}:`), err);
        }
    });

    // 2. Handle Add/Unlink (Full Rebuild)
    const rebuild = async () => {
        console.log(chalk.magenta(`[A.L.F.R.E.D]: "Structural shift detected. Recompiling Matrix buffer..."`));
        try {
            const results = await runScan(targetPath);
            await compileMatrix(results, targetPath);
            relay.broadcast('GRAPH_REBUILT', {});
        } catch (err) {
            console.error(chalk.red(`[ERROR] Failed to rebuild matrix: `), err);
        }
    };

    watcher.on('add', rebuild);
    watcher.on('unlink', rebuild);

    return watcher;
}

