import { CortexLink } from '../cortex_link.js';
import { execa } from 'execa';
import path from 'node:path';
import { registry } from '../../tools/pennyone/pathRegistry.js';
import chalk from 'chalk';
import { activePersona } from '../../tools/pennyone/personaRegistry.js';
import { getHallSummary } from  '../../tools/pennyone/intel/database.js';
import { runScan } from  '../../tools/pennyone/index.js';

import { getPythonPath } from './python_utils.js';

import { HUD } from './hud.js';
import { StateRegistry } from  './state.js';

/**
 * Autonomic Nervous System (ANS)
 * Purpose: Synchronize the waking and sleeping of all framework organs.
 * Mandate: Unified Consciousness (Oracle + PennyOne + Ravens)
 */
export class ANS {
    /**
     * Wakes the runtime without resident daemons.
     */
    static async wake() {
        const link = new CortexLink();
        await HUD.spinner('Synchronizing the kernel bridge...', 400);
        await link.ensureDaemon();

        await this.ensurePennyOne();

        StateRegistry.updateFramework({
            status: 'AWAKE',
            last_awakening: Date.now()
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
        } catch (e) {
            console.error(chalk.red(`[ERROR] Dormancy transition failed: ${e instanceof Error ? e.message : String(e)}`));
        }

        // [🔱] THE STATE: Sleep Synchronized
        StateRegistry.updateFramework({
            status: 'DORMANT'
        });
    }

    /**
     * Ensures PennyOne has a current Hall projection without a resident watcher.
     */
    static async ensurePennyOne() {
        const summary = getHallSummary(registry.getRoot());
        if (!summary?.last_scan_id) {
            console.error(chalk.dim(`${activePersona.prefix} 'Seeding PennyOne Hall projection...'`));
            await runScan(registry.getRoot());
        }
    }

    /**
     * There is no resident PennyOne daemon in kernel mode.
     */
    static async stopPennyOne() {
        console.error(chalk.dim(`${activePersona.prefix} 'PennyOne is already on-demand in kernel mode.'`));
    }
}

