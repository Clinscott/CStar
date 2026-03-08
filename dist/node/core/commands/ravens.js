import chalk from 'chalk';
import fs from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';
import { HUD } from '../hud.js';
/**
 * [GUNGNIR] Raven Command Spoke
 * Purpose: Monitor and Orchestrate the Raven Wardens (Muninn).
 * @param program
 * @param PROJECT_ROOT
 */
export function registerRavenCommand(program, PROJECT_ROOT) {
    const ravens = program
        .command('ravens')
        .description('Monitor and Orchestrate the Raven Wardens');
    ravens
        .command('status')
        .description('Display Raven health and quota isolation')
        .action(async () => {
        await displayStatus(PROJECT_ROOT);
    });
    ravens
        .command('start')
        .description('Release the Ravens (Launch Muninn Daemon)')
        .option('--shadow-forge', 'Execute in sandboxed Docker container')
        .action(async (options) => {
        try {
            const muninnPidPath = join(PROJECT_ROOT, '.agents', 'muninn.pid');
            // 1. Check if already active
            if (fs.existsSync(muninnPidPath)) {
                try {
                    const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                    process.kill(pid, 0);
                    console.log(chalk.yellow(`[ALFRED]: "The Ravens are already in flight (PID: ${pid})."`));
                    return;
                }
                catch (e) {
                    // Process not found, stale PID
                    fs.unlinkSync(muninnPidPath);
                }
            }
            console.log(chalk.cyan('[ALFRED]: "Releasing the Ravens into the matrix..."'));
            // 2. Launch main_loop.py in background
            const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
            const mainLoopScript = join(PROJECT_ROOT, 'src', 'sentinel', 'main_loop.py');
            const args = [mainLoopScript];
            if (options.shadowForge)
                args.push('--shadow-forge');
            const child = execa(pythonPath, args, {
                detached: true,
                stdio: 'ignore',
                env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
            });
            child.unref();
            console.log(chalk.green('[ALFRED]: "Muninn Daemon launched successfully. Orientation complete."'));
        }
        catch (err) {
            console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
            console.error(chalk.red(`Critical Failure: ${err.message}`));
            process.exit(1);
        }
    });
    ravens
        .command('stop')
        .description('Recall the Ravens (Stop Muninn Daemon)')
        .action(async () => {
        try {
            const muninnPidPath = join(PROJECT_ROOT, '.agents', 'muninn.pid');
            if (!fs.existsSync(muninnPidPath)) {
                console.log(chalk.yellow('[ALFRED]: "The Ravens are already nesting, sir."'));
                return;
            }
            const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
            process.kill(pid, 'SIGTERM');
            fs.unlinkSync(muninnPidPath);
            console.log(chalk.green(`[ALFRED]: "Muninn Daemon (PID: ${pid}) has been silenced."`));
        }
        catch (err) {
            console.error(chalk.red(`[ALFRED]: "I encountered resistance while recalling the ravens: ${err.message}"`));
        }
    });
    // Default to status if no subcommand
    ravens.action(() => {
        displayStatus(PROJECT_ROOT);
    });
}
/**
 *
 * @param PROJECT_ROOT
 */
async function displayStatus(PROJECT_ROOT) {
    try {
        const palette = HUD.palette;
        process.stdout.write(HUD.boxTop('◤ MUNINN MONITOR ◢'));
        const muninnPidPath = join(PROJECT_ROOT, '.agents', 'muninn.pid');
        let muninnStatus = 'OFFLINE';
        let sColor = palette.crucible;
        if (fs.existsSync(muninnPidPath)) {
            try {
                const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                process.kill(pid, 0);
                muninnStatus = 'ACTIVE';
                sColor = palette.sterling;
            }
            catch (e) {
                muninnStatus = 'OFFLINE (STALE)';
            }
        }
        process.stdout.write(HUD.boxRow('RAVEN STATUS', muninnStatus, sColor.bold));
        const envPath = join(PROJECT_ROOT, '.env.local');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        const isSet = (key) => (process.env[key] || new RegExp('^\\s*' + key + '\\s*=', 'm').test(envContent)) ? palette.sterling('SECURED') : palette.crucible('FALLBACK');
        process.stdout.write(HUD.boxSeparator());
        process.stdout.write(HUD.boxRow('MUNINN_KEY', isSet('MUNINN_API_KEY')));
        process.stdout.write(HUD.boxRow('DAEMON_KEY', isSet('GOOGLE_API_DAEMON_KEY')));
        process.stdout.write(HUD.boxRow('BRAVE_KEY', isSet('BRAVE_API_KEY')));
        process.stdout.write(HUD.boxRow('SHARED_KEY', isSet('GOOGLE_API_KEY')));
        process.stdout.write(HUD.boxSeparator());
        const wardenDir = join(PROJECT_ROOT, 'src', 'sentinel', 'wardens');
        let active_wardens = [];
        if (fs.existsSync(wardenDir)) {
            active_wardens = fs.readdirSync(wardenDir)
                .filter(f => f.endsWith('.py') && !f.startsWith('__'))
                .map(f => f.replace('.py', ''));
        }
        if (active_wardens.length > 0) {
            process.stdout.write(HUD.boxRow('ACTIVE WARDENS', active_wardens.length));
            active_wardens.forEach(w => {
                const name = w.charAt(0).toUpperCase() + w.slice(1);
                process.stdout.write(HUD.boxRow('  ◈', name, chalk.bold));
            });
        }
        else {
            process.stdout.write(HUD.boxRow('WARDENS', 'NONE DETECTED', chalk.yellow));
        }
        process.stdout.write(HUD.boxSeparator());
        process.stdout.write(HUD.boxNote());
        process.stdout.write(HUD.boxBottom());
    }
    catch (err) {
        process.exit(1);
    }
}
