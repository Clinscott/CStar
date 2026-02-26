#!/usr/bin/env tsx

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, parse } from 'node:path';
import { execa } from 'execa';
import { CortexLink } from './src/node/cortex_link.js';
import { executeCycle } from './src/node/agent_loop.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = __dirname;
const pkgPath = join(PROJECT_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const program = new Command();

// Gungnir Calculus: Opinionated Error Handler
const handleError = (msg: string) => {
    console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
    console.error(chalk.red(`Critical Failure: ${msg}\n`));
    process.exit(1);
};

// Hook into Commander's output configuration to capture errors
program.configureOutput({
    writeErr: (_str: string) => {
        // Suppress stdout/stderr if we handle it below
    },
    outputError: (str: string, _write: (str: string) => void) => {
        const cleanMsg = str.replace(/^error:\s*/i, '').trim();
        handleError(cleanMsg);
    }
});

program
    .name('cstar')
    .description('Corvus Star (C*) - Gungnir Control Plane (TypeScript Core)')
    .version(pkg.version);

program
    .command('start <target>')
    .description('The Agent Loop')
    .option('-t, --task <desc>', 'task description for the compute plane', '')
    .option('--ledger <dir>', 'ledger context directory', join(process.cwd(), 'ledger'))
    .option('--debug', 'enable debug mode')
    .action(async (target: string, options: { task: string; ledger: string; debug?: boolean }) => {
        try {
            // Instantiate and assure Gungnir -> Cortex link
            const link = new CortexLink();
            await link.ensureDaemon();

            await executeCycle(
                target,
                options.ledger,
                options.task,
                link
            );

        } catch (error: any) {
            handleError(error.message);
        }
    });

program
    .command('dominion')
    .description('The UI')
    .action(async () => {
        try {
            await execa('python', [join(PROJECT_ROOT, 'src/cstar/core/tui.py')], { stdio: 'inherit' });
        } catch (err) {
            handleError('Dominion TUI crashed or was interrupted.');
        }
    });

program
    .command('odin')
    .description('The Protocol')
    .action(async () => {
        try {
            await execa('python', [join(PROJECT_ROOT, 'src/games/odin_protocol/main.py')], { stdio: 'inherit' });
        } catch (err) {
            handleError('Odin Protocol crashed or was interrupted.');
        }
    });

program
    .command('ravens')
    .description('Monitor the Raven Wardens')
    .option('--status', 'Display Raven health and quota isolation')
    .action(async (options: { status?: boolean }) => {
        if (options.status) {
            try {
                console.log(chalk.bgCyan.black.bold('\n ◤ MUNINN MONITOR ◢ '));
                console.log(chalk.cyan(' ' + '━'.repeat(40)));

                const muninnPidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');
                let muninnStatus = chalk.red.bold('OFFLINE');

                if (fs.existsSync(muninnPidPath)) {
                    try {
                        const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                        process.kill(pid, 0);
                        muninnStatus = chalk.green.bold('ACTIVE');
                    } catch (e) {
                        muninnStatus = chalk.red.bold('OFFLINE');
                    }
                }
                console.log(`${chalk.bold(' Raven Status:')}     ${muninnStatus}`);

                const envPath = join(PROJECT_ROOT, '.env.local');
                let envContent = "";
                if (fs.existsSync(envPath)) {
                    envContent = fs.readFileSync(envPath, 'utf-8');
                }

                const isSet = (key: string) => (process.env[key] || new RegExp('^\\s*' + key + '\\s*=', 'm').test(envContent)) ? chalk.green('SECURED') : chalk.red('FALLBACK');

                console.log(chalk.cyan('\n ◤ QUOTA ISOLATION ◢ '));
                console.log(` MUNINN_KEY:     ${isSet('MUNINN_API_KEY')}`);
                console.log(` DAEMON_KEY:     ${isSet('GOOGLE_API_DAEMON_KEY')}`);
                console.log(` BRAVE_KEY:      ${isSet('BRAVE_API_KEY')}`);
                console.log(` SHARED_KEY:     ${isSet('GOOGLE_API_KEY')}`);

                console.log(chalk.cyan('\n ◤ ACTIVE RAVENS ◢ '));
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
                        const w2 = displayWardens[i + 1] || "";
                        console.log(` ◈ ${chalk.bold(w1.padEnd(15))}   ${w2 ? '◈ ' + chalk.bold(w2) : ''}`);
                    }
                } else {
                    console.log(chalk.yellow(' No wardens detected in src/sentinel/wardens.'));
                }

                console.log(chalk.cyan('\n ' + '━'.repeat(40)));
                if (muninnStatus.includes('ACTIVE')) {
                    console.log(chalk.green(` Muninn reports nominal operation.`));
                } else {
                    console.log(chalk.yellow(` Muninn is idle. Invoke 'c* start' to release the ravens.`));
                }
                console.log();

            } catch (err: any) {
                handleError(err.message);
            }
        } else {
            program.help();
        }
    });

// ◤ DYNAMIC WORKFLOW & SKILL DISCOVERY ◢
const discoverAll = (): Map<string, string> => {
    const commands = new Map<string, string>();
    const scriptDirs = [
        join(PROJECT_ROOT, '.agent', 'skills'),
        join(PROJECT_ROOT, 'src', 'tools'),
        join(PROJECT_ROOT, 'src', 'skills', 'local'),
        join(PROJECT_ROOT, 'skills_db'),
        join(PROJECT_ROOT, 'src', 'sentinel'),
        join(PROJECT_ROOT, 'scripts'),
    ];

    scriptDirs.forEach(d => {
        if (fs.existsSync(d)) {
            fs.readdirSync(d).forEach(f => {
                if (f.endsWith('.py') && !f.startsWith('_')) {
                    const name = parse(f).name;
                    commands.set(name, join(d, f));
                }
            });
        }
    });

    const workflowDir = join(PROJECT_ROOT, '.agent', 'workflows');
    if (fs.existsSync(workflowDir)) {
        fs.readdirSync(workflowDir).forEach(f => {
            if (f.endsWith('.md') || f.endsWith('.qmd')) {
                const name = parse(f).name.toLowerCase();
                commands.set(name, join(workflowDir, f));
            }
        });
    }
    return commands;
};

// Fallback for unrecognized usage - Attempts dynamic resolution via Python Dispatcher
program.on('command:*', async (operands: string[]) => {
    const cmd = operands[0].toLowerCase();
    const allCmds = discoverAll();

    if (allCmds.has(cmd)) {
        try {
            // Forward to Python Dispatcher for Persona, UI, and Warden (Learning) support
            const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
            const dispatcherPath = join(PROJECT_ROOT, 'src', 'core', 'cstar_dispatcher.py');

            await execa(pythonPath, [dispatcherPath, ...process.argv.slice(2)], {
                stdio: 'inherit',
                env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
            });
        } catch (err) {
            // Silence execa errors as they usually mean the subprocess failed (handled internally)
        }
    } else {
        handleError(`Unknown command '${cmd}'`);
    }
});

try {
    program.parse(process.argv);
} catch (error: any) {
    handleError(error.message);
}
