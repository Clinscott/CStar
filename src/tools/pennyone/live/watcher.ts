/* eslint-disable no-useless-escape */
import chokidar from 'chokidar';
import path from 'path';
import { runScan } from '../index.ts';
import { SubspaceRelay } from './socket.ts';
import chalk from 'chalk';
import { activePersona } from '../personaRegistry.ts';

export function startWatcher(
    targetPath: string,
    relay: SubspaceRelay,
    scanRunner: typeof runScan = runScan,
) {
    const watcher = chokidar.watch(targetPath, {
        ignored: [/(^|[\/\\])\../, '**/node_modules/**', '**/.stats/**', '**/.agents/**'],
        persistent: true,
        ignoreInitial: true
    });

    console.log(chalk.cyan(`${activePersona.prefix}: "Telemetry sensors active. Monitoring sector: ${targetPath}"`));

    let scanTimer: NodeJS.Timeout | null = null;
    let rebuildTimer: NodeJS.Timeout | null = null;

    // 1. Handle File Changes (Delta Update)
    watcher.on('change', async (filePath: string) => {
        if (!filePath.match(/\.(ts|js|tsx|jsx|py)$/)) return;

        if (scanTimer) clearTimeout(scanTimer);

        scanTimer = setTimeout(async () => {
            console.log(chalk.yellow(`${activePersona.prefix}: "Delta detected in ${path.basename(filePath)}. Recalibrating sensors..."`));
            try {
                // Re-run the full scan for consistency and to update qmd/json
                const results = await scanRunner(targetPath);
                const data = results.find(r => r.path.replace(/\\/g, '/') === filePath.replace(/\\/g, '/'));

                if (data) {
                    // Broadcast update to frontend for smooth interpolation
                    relay.broadcast('NODE_UPDATED', {
                        path: data.path,
                        loc: data.loc,
                        matrix: data.matrix,
                        intent: data.intent || '...'
                    });
                }
            } catch (err: any) {
                console.error(chalk.red(`[ERROR] Failed to process delta for ${filePath}:`), err);
            }
        }, 500);
    });

    // 2. Handle Add/Unlink (Full Rebuild)
    const rebuild = async (filePath: string) => {
        if (filePath && !filePath.match(/\.(ts|js|tsx|jsx|py)$/)) return;

        if (rebuildTimer) clearTimeout(rebuildTimer);

        rebuildTimer = setTimeout(async () => {
            console.log(chalk.magenta(`${activePersona.prefix}: "Structural shift detected. Recompiling Matrix buffer..."`));
            try {
                await scanRunner(targetPath);
                relay.broadcast('MATRIX_UPDATED', { source: 'watcher:structural-shift' });
            } catch (err: any) {
                console.error(chalk.red('[ERROR] Failed to rebuild matrix: '), err);
            }
        }, 500);
    };

    watcher.on('add', rebuild);
    watcher.on('unlink', rebuild);

    return watcher;
}



