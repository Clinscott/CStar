import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUD } from '../hud.js';
import chalk from 'chalk';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
/**
 * [GUNGNIR] Vitals Command Spoke
 * Purpose: Display real-time system health and mission traces with SovereignHUD.
 */
export function registerVitalsCommand(program) {
    program
        .command('vitals')
        .description('Display real-time system health and mission traces')
        .action(async () => {
        try {
            const spokePath = path.join(PROJECT_ROOT, 'src/core/vitals_spoke.py');
            const pythonPath = path.join(PROJECT_ROOT, '.venv/Scripts/python.exe');
            const { stdout } = await execa(pythonPath, [spokePath]);
            const data = JSON.parse(stdout);
            const palette = HUD.palette;
            process.stdout.write(HUD.boxTop('🔱 SOVEREIGN SYSTEM VITALS'));
            // 1. Status Section
            const status = data.vitals?.status || 'UNKNOWN';
            const sColor = status === 'OPERATIONAL' ? palette.sterling : palette.crucible;
            process.stdout.write(HUD.boxRow('SYSTEM STATUS', status, sColor));
            process.stdout.write(HUD.boxRow('UPTIME', data.vitals?.uptime || 'N/A', palette.mimir));
            // Neural Pulse (Random Activity)
            const pulse = Math.random() * 0.4 + 0.6;
            process.stdout.write(HUD.boxRow('NEURAL PULSE', palette.bifrost('|||||||||||||||')));
            process.stdout.write(HUD.boxSeparator());
            // 2. Traces Section
            process.stdout.write(HUD.boxRow('ACTIVE TRACES', data.traces?.length || 0, palette.mimir));
            if (data.traces && data.traces.length > 0) {
                for (const t of data.traces.slice(0, 3)) {
                    const statusText = t.status === 'SUCCESS' ? 'PASS' : 'FAIL';
                    const statusColor = t.status === 'SUCCESS' ? palette.sterling : palette.crucible;
                    process.stdout.write(HUD.boxRow(`  ◈ ${t.mission_id.slice(0, 10)}`, statusText, statusColor));
                }
            }
            process.stdout.write(HUD.boxSeparator());
            // 3. Tasks
            const taskCount = data.tasks?.length || 0;
            process.stdout.write(HUD.boxRow('PENDING TASKS', taskCount, palette.accent));
            if (data.tasks && data.tasks.length > 0) {
                for (const t of data.tasks.slice(0, 3)) {
                    const cleanTask = t.replace(/\*\*/g, '').slice(0, 35) + '...';
                    process.stdout.write(HUD.boxRow('  ▷', cleanTask, palette.void));
                }
            }
            process.stdout.write(HUD.boxSeparator());
            // 4. Persona Note
            process.stdout.write(HUD.boxNote());
            process.stdout.write(HUD.boxBottom());
        }
        catch (error) {
            console.error(chalk.red(`[ERROR] Failed to retrieve vitals: ${error.message}`));
        }
    });
}
