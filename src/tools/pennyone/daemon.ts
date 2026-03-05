import * as chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { runScan, indexSector } from './index.ts';
import { registry } from './pathRegistry.ts';
import chalk from 'chalk';
import { activePersona } from './personaRegistry.ts';
import { CortexLink } from '../../node/cortex_link.ts';

/**
 * P1 Daemon: The Autonomic Nervous System
 * Purpose: Background file watching, incremental scanning, and matrix compilation.
 */
export class P1Daemon {
    private watcher: chokidar.FSWatcher | null = null;
    private targetPath: string;
    private statsDir: string;
    private pidFile: string;
    private isScanning: boolean = false;
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingChanges: Set<string> = new Set();

    constructor(targetPath: string) {
        this.targetPath = path.resolve(targetPath);
        this.statsDir = path.join(registry.getRoot(), '.stats');
        this.pidFile = path.join(this.statsDir, 'p1-daemon.pid');
    }

    /**
     * Start the background intelligence loop
     */
    public async start() {
        if (this.isRunning()) {
            console.error(chalk.red(`${activePersona.prefix}: "A P1 Daemon is already active in this sector, sir."`));
            process.exit(1);
        }

        if (!fs.existsSync(this.statsDir)) {
            fs.mkdirSync(this.statsDir, { recursive: true });
        }

        fs.writeFileSync(this.pidFile, process.pid.toString(), 'utf-8');

        console.log(chalk.cyan(`
${activePersona.prefix}: "P1 Daemon ignited. Monitoring neural pathways in ${this.targetPath}..."`));

        // Initial Full Scan
        await this.triggerScan();

        // Initialize Watcher
        this.watcher = chokidar.watch(this.targetPath, {
            ignored: [
                /(^|[/\\])\../, // ignore dotfiles
                '**/node_modules/**',
                '**/.stats/**',
                '**/dist/**',
                '**/build/**',
                '**/.agent/traces/**',
                '**/.agent/vault/**'
            ],
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        this.watcher.on('all', async (event: string, filePath: string) => {
            const relPath = path.relative(this.targetPath, filePath);
            const allowedExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.md', '.qmd'];
            const ext = path.extname(filePath).toLowerCase();

            if (!allowedExts.includes(ext)) return;

            if (event === 'unlink') {
                console.log(chalk.dim(`[P1 EVENT]: ${event.toUpperCase()} ${relPath}`));
                await this.triggerScan(); // Full scan to clean up graph on delete
                return;
            }

            if (event === 'change' || event === 'add') {
                this.pendingChanges.add(filePath);
                
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                
                this.debounceTimer = setTimeout(async () => {
                    const changes = Array.from(this.pendingChanges);
                    this.pendingChanges.clear();
                    
                    console.log(chalk.dim(`[P1 EVENT]: Processing batch of ${changes.length} changes...`));
                    for (const fp of changes) {
                        await this.triggerSectorIndex(fp);
                    }
                }, 2000);
            }
        });

        // Handle process termination
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    /**
     * Targeted indexing of a single modified sector
     */
    private async triggerSectorIndex(filePath: string) {
        try {
            const result = await indexSector(filePath);
            if (result) {
                const link = new CortexLink();
                await link.sendCommand('MATRIX_UPDATED');

                // [🔱] THE BRAIN: Heimdall Reflex
                if (result.matrix.overall < 4.0) {
                    console.log(chalk.red(`[HEIMDALL ALERT] Sector ${path.basename(filePath)} is TOXIC (${result.matrix.overall.toFixed(2)}).`));
                    await link.sendCommand('HEIMDALL_ALERT', {
                        file: filePath,
                        score: result.matrix.overall,
                        justification: "Logic corruption detected during autonomic reflex."
                    });
                }
            }
        } catch (e) {
            console.warn(`[WARNING] Autonomic indexing failed for ${filePath}: ${e}`);
        }
    }

    /**
     * Trigger an incremental scan and matrix compilation
     */
    private async triggerScan() {
        if (this.isScanning) return;
        this.isScanning = true;

        try {
            console.log(chalk.blue(`${activePersona.prefix}: "Structural shift detected. Recompiling the Gungnir Matrix..."`));
            await runScan(this.targetPath);
            console.log(chalk.green(`${activePersona.prefix}: "Matrix recompiled successfully."`));

            // Broadcast to the React Frontend via CortexLink
            try {
                const link = new CortexLink();
                await link.sendCommand('MATRIX_UPDATED');
            } catch (_broadcastError) {
                console.warn(chalk.dim(`${activePersona.prefix}: WebSocket broadcast offline. Proceeding autonomously.`));
            }

        } catch (error) {
            console.error(chalk.red(`${activePersona.prefix}: "Scan failed during background operation."`), error);
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Stop the daemon and cleanup
     */
    public stop() {
        if (this.watcher) {
            this.watcher.close();
        }
        if (fs.existsSync(this.pidFile)) {
            fs.unlinkSync(this.pidFile);
        }
        console.log(chalk.yellow(`
${activePersona.prefix}: "P1 Daemon terminated. The Matrix is now static."`));
        process.exit(0);
    }

    /**
     * Check if the daemon is already running
     * @returns {boolean} True if running
     */
    public isRunning(): boolean {
        if (!fs.existsSync(this.pidFile)) return false;
        const pid = parseInt(fs.readFileSync(this.pidFile, 'utf-8'));
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }
}

// Entry point for standalone execution
if (process.argv[1].endsWith('daemon.ts') || process.argv[1].endsWith('daemon.js')) {
    const target = process.argv[2] || '.';
    const daemon = new P1Daemon(target);
    daemon.start();
}

