import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { SynapticNexus } from './nexus.js';
import { HUD } from './hud.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const LORE_DIR = path.join(PROJECT_ROOT, '.agents/lore');
/**
 * 🔱 Sovereign Loop (v1.0)
 * Lore: "The magic never sleeps. The loop is eternal."
 * Purpose: The autonomous heartbeat of Corvus Star.
 */
export class SovereignLoop {
    static isRunning = false;
    static lastScanTime = 0;
    /**
     * [🔱] Initiate the Heartbeat.
     * Starts the autonomous loop.
     */
    static async initiate() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.error(chalk.magenta('\n  ◤ INITIATING SOVEREIGN LOOP (THE HEARTBEAT) ◢'));
        SynapticNexus.pulse();
        // 1. Ensure Lore Sanctuary exists
        await fs.mkdir(LORE_DIR, { recursive: true });
        // 2. Start the Pulse Cycle
        this.pulseCycle();
        // 3. Start the Watch Cycle
        this.watchCycle();
    }
    static async pulseCycle() {
        while (this.isRunning) {
            SynapticNexus.pulse(0.1); // Small passive health regeneration
            await new Promise(resolve => setTimeout(resolve, 30000)); // Pulse every 30s
        }
    }
    static async watchCycle() {
        console.error(chalk.cyan('  ◈ [THE WATCH]: Monitoring .agents/lore/ for new chants...'));
        while (this.isRunning) {
            try {
                const files = await fs.readdir(LORE_DIR);
                const qmdFiles = files.filter(f => f.endsWith('.qmd'));
                for (const file of qmdFiles) {
                    const filePath = path.join(LORE_DIR, file);
                    const stats = await fs.stat(filePath);
                    if (stats.mtimeMs > this.lastScanTime) {
                        await this.handleNewChant(file, filePath);
                    }
                }
                this.lastScanTime = Date.now();
            }
            catch (e) {
                console.error(chalk.red(`  [!] Watch Cycle Error: ${e}`));
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5s
        }
    }
    static async handleNewChant(fileName, filePath) {
        console.error(chalk.magenta(`\n  ⚡ [IGNITION]: New chant detected: ${fileName}`));
        SynapticNexus.recordIntent(`Forging artifact from lore: ${fileName}`);
        // In a real autonomous environment, this would call the MCP taliesin_forge tool.
        // For the materialization phase, we log the ignition.
        await HUD.spinner(`Analyzing Lore: ${fileName}`, 1500);
        console.error(chalk.green(`  ✔ [FORGE]: Lore synchronized with the One Mind.`));
    }
    static stop() {
        this.isRunning = false;
        console.error(chalk.yellow('\n  ◈ [HEARTBEAT]: Dormancy protocol engaged.'));
    }
}
