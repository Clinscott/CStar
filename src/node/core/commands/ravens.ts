import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

/**
 * [GUNGNIR] Raven Command Spoke
 * Purpose: Monitor and Orchestrate the Raven Wardens (Muninn).
 * @param program
 * @param PROJECT_ROOT
 */
export function registerRavenCommand(program: Command, PROJECT_ROOT: string) {
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
        .action(async (options: { shadowForge?: boolean }) => {
            try {
                const muninnPidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');

                // 1. Check if already active
                if (fs.existsSync(muninnPidPath)) {
                    try {
                        const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                        process.kill(pid, 0);
                        console.log(chalk.yellow(`[ALFRED]: "The Ravens are already in flight (PID: ${pid})."`));
                        return;
                    } catch (e) {
                        // Process not found, stale PID
                        fs.unlinkSync(muninnPidPath);
                    }
                }

                console.log(chalk.cyan('[ALFRED]: "Releasing the Ravens into the matrix..."'));

                // 2. Launch main_loop.py in background
                const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
                const mainLoopScript = join(PROJECT_ROOT, 'src', 'sentinel', 'main_loop.py');
                const args = [mainLoopScript];
                if (options.shadowForge) args.push('--shadow-forge');

                const child = execa(pythonPath, args, {
                    detached: true,
                    stdio: 'ignore',
                    env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                });

                child.unref();

                console.log(chalk.green('[ALFRED]: "Muninn Daemon launched successfully. Orientation complete."'));

            } catch (err: any) {
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
                const muninnPidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');
                if (!fs.existsSync(muninnPidPath)) {
                    console.log(chalk.yellow('[ALFRED]: "The Ravens are already nesting, sir."'));
                    return;
                }

                const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                process.kill(pid, 'SIGTERM');
                fs.unlinkSync(muninnPidPath);
                console.log(chalk.green(`[ALFRED]: "Muninn Daemon (PID: ${pid}) has been silenced."`));
            } catch (err: any) {
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
async function displayStatus(PROJECT_ROOT: string) {
    try {
        console.log(chalk.bgCyan.black.bold(' ◤ MUNINN MONITOR ◢ '));
        console.log(chalk.cyan(' ' + '━'.repeat(40)));

        const muninnPidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');
        let muninnStatus = chalk.red.bold('OFFLINE');

        if (fs.existsSync(muninnPidPath)) {
            try {
                const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                process.kill(pid, 0);
                muninnStatus = chalk.green.bold('ACTIVE');
            } catch (e) {
                muninnStatus = chalk.red.bold('OFFLINE (STALE)');
            }
        }
        console.log(`${chalk.bold(' Raven Status:')}     ${muninnStatus}`);

        const envPath = join(PROJECT_ROOT, '.env.local');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }

        const isSet = (key: string) => (process.env[key] || new RegExp('^\s*' + key + '\s*=', 'm').test(envContent)) ? chalk.green('SECURED') : chalk.red('FALLBACK');

        console.log(chalk.cyan(' ◤ QUOTA ISOLATION ◢ '));
        console.log(` MUNINN_KEY:     ${isSet('MUNINN_API_KEY')}`);
        console.log(` DAEMON_KEY:     ${isSet('GOOGLE_API_DAEMON_KEY')}`);
        console.log(` BRAVE_KEY:      ${isSet('BRAVE_API_KEY')}`);
        console.log(` SHARED_KEY:     ${isSet('GOOGLE_API_KEY')}`);

        console.log(chalk.cyan(' ◤ ACTIVE RAVENS ◢ '));
        const wardenDir = join(PROJECT_ROOT, 'src', 'sentinel', 'wardens');
        let active_wardens: string[] = [];
        if (fs.existsSync(wardenDir)) {
            active_wardens = fs.readdirSync(wardenDir)
                .filter(f => f.endsWith('.py') && !f.startsWith('__'))
                .map(f => f.replace('.py', ''));
        }

        if (active_wardens.length > 0) {
            const displayWardens = active_wardens.map(w => w.charAt(0).toUpperCase() + w.slice(1));
            for (let i = 0; i < displayWardens.length; i += 2) {
                const w1 = displayWardens[i];
                const w2 = displayWardens[i + 1] || '';
                console.log(` ◈ ${chalk.bold(w1.padEnd(15))}   ${w2 ? '◈ ' + chalk.bold(w2) : ''}`);
            }
        } else {
            console.log(chalk.yellow(' No wardens detected in src/sentinel/wardens.'));
        }

        console.log(chalk.cyan('━'.repeat(40)));
        if (muninnStatus.includes('ACTIVE')) {
            console.log(chalk.green(' Muninn reports nominal operation.'));
        } else {
            console.log(chalk.yellow(' Muninn is idle. Invoke \'cstar ravens start\' to release the ravens.'));
        }
        console.log();

    } catch (err: any) {
        process.exit(1);
    }
}
