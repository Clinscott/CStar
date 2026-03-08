import { CortexLink } from '../cortex_link.js';
import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { registry } from '../../tools/pennyone/pathRegistry.js';
import chalk from 'chalk';
import { activePersona } from '../../tools/pennyone/personaRegistry.js';
import { getPythonPath } from './python_utils.js';
import { HUD } from './hud.js';
/**
 * Autonomic Nervous System (ANS)
 * Purpose: Synchronize the waking and sleeping of all framework organs.
 * Mandate: Unified Consciousness (Oracle + PennyOne + Ravens)
 */
export class ANS {
    /**
     * Wakes the entire system (Oracle + PennyOne)
     */
    static async wake() {
        // [🔱] THE BRAIN: Wake Oracle (Python Daemon)
        const link = new CortexLink();
        await HUD.spinner('Awakening the Gungnir Oracle...', 800);
        await link.ensureDaemon();
        // [🔱] THE BODY: Wake PennyOne (Node Daemon)
        await this.ensurePennyOne();
    }
    static _checkPort(port) {
        return new Promise((resolve) => {
            const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
                client.end();
                resolve(true);
            });
            client.on('error', () => resolve(false));
        });
    }
    /**
     * Puts the entire system to sleep (Dormancy)
     */
    static async sleep() {
        console.error(chalk.cyan(`
${activePersona.prefix}: "Initiating global dormancy protocol..."`));
        // 1. Stop PennyOne
        await this.stopPennyOne();
        // 2. Trigger REM Sleep / Dormancy in Python (Oracle)
        const projectRoot = registry.getRoot();
        const pythonPath = getPythonPath();
        const dormancyScript = path.join(projectRoot, 'src', 'skills', 'local', 'dormancy.py');
        try {
            await execa(pythonPath, [dormancyScript], {
                stdio: 'inherit',
                env: { ...process.env, PYTHONPATH: projectRoot }
            });
        }
        catch (e) {
            console.error(chalk.red(`[ERROR] Dormancy transition failed: ${e instanceof Error ? e.message : String(e)}`));
        }
    }
    /**
     * Ensures P1 Daemon is running
     */
    static async ensurePennyOne() {
        const statsDir = path.join(registry.getRoot(), '.stats');
        const pidFile = path.join(statsDir, 'p1-daemon.pid');
        let isRunning = false;
        if (fs.existsSync(pidFile)) {
            const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
            try {
                process.kill(pid, 0);
                isRunning = true;
            }
            catch (e) { }
        }
        if (!isRunning) {
            console.error(chalk.dim(`${activePersona.prefix} 'Igniting PennyOne...'`));
            const p1Entry = path.join(registry.getRoot(), 'src', 'tools', 'pennyone', 'daemon.js');
            const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            // Spawn detached tsx process for the daemon
            execa(npxCmd, ['tsx', p1Entry], {
                detached: true,
                stdio: 'ignore',
                cwd: registry.getRoot()
            }).unref();
        }
    }
    /**
     * Stops P1 Daemon
     */
    static async stopPennyOne() {
        const statsDir = path.join(registry.getRoot(), '.stats');
        const pidFile = path.join(statsDir, 'p1-daemon.pid');
        if (fs.existsSync(pidFile)) {
            const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
            try {
                process.kill(pid, 'SIGTERM');
                console.error(chalk.dim(`${activePersona.prefix} 'PennyOne standing down.'`));
            }
            catch (e) { }
            if (fs.existsSync(pidFile)) {
                try {
                    fs.unlinkSync(pidFile);
                }
                catch (e) { }
            }
        }
    }
}
