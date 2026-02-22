#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execa } from 'execa';
import { CortexLink } from '../src/node/cortex_link.js';
import { executeCycle } from '../src/node/agent_loop.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../');
const pkgPath = join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const program = new Command();

// Gungnir Calculus: Opinionated Error Handler
const handleError = (msg) => {
    console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
    console.error(chalk.red(`Critical Failure: ${msg}\n`));
    process.exit(1);
};

// Hook into Commander's output configuration to capture errors
program.configureOutput({
    writeErr: (str) => {
        // Suppress stdout/stderr if we handle it below, but we use outputError mainly
    },
    outputError: (str, write) => {
        const cleanMsg = str.replace(/^error:\s*/i, '').trim();
        handleError(cleanMsg);
    }
});

program
    .name('cstar')
    .description('Corvus Star (C*) - Gungnir Control Plane')
    .version(pkg.version);

program
    .command('start <target>')
    .description('The Agent Loop')
    .option('-t, --task <desc>', 'task description for the compute plane', '')
    .option('--ledger <dir>', 'ledger context directory', join(process.cwd(), 'ledger'))
    .option('--debug', 'enable debug mode')
    .action(async (target, options) => {
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

        } catch (error) {
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
    .action(async (options) => {
        if (options.status) {
            try {
                // ◤ WOW DESIGN: Local Deterministic Status Report ◢
                // We no longer rely on the Daemon API for status (User Directive)

                console.log(chalk.bgCyan.black.bold('\n ◤ MUNINN MONITOR ◢ '));
                console.log(chalk.cyan(' ' + '━'.repeat(40)));

                // 1. Muninn Status (Local PID Check)
                const muninnPidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');
                let muninnStatus = chalk.red.bold('OFFLINE');

                if (fs.existsSync(muninnPidPath)) {
                    try {
                        const pid = parseInt(fs.readFileSync(muninnPidPath, 'utf-8').trim());
                        // Simple cross-platform check for PID existence
                        process.kill(pid, 0);
                        muninnStatus = chalk.green.bold('ACTIVE');
                    } catch (e) {
                        // PID file exists but process is dead
                        muninnStatus = chalk.red.bold('OFFLINE');
                    }
                }
                console.log(`${chalk.bold(' Raven Status:')}     ${muninnStatus}`);

                // 2. Quota Isolation Table (Local Env Check)
                // We read .env.local manually if it exists to verify isolation
                const envPath = join(PROJECT_ROOT, '.env.local');
                let envContent = "";
                if (fs.existsSync(envPath)) {
                    envContent = fs.readFileSync(envPath, 'utf-8');
                }

                const isSet = (key) => (process.env[key] || new RegExp('^\\s*' + key + '\\s*=', 'm').test(envContent)) ? chalk.green('SECURED') : chalk.red('FALLBACK');

                console.log(chalk.cyan('\n ◤ QUOTA ISOLATION ◢ '));
                console.log(` MUNINN_KEY:     ${isSet('MUNINN_API_KEY')}`);
                console.log(` DAEMON_KEY:     ${isSet('GOOGLE_API_DAEMON_KEY')}`);
                console.log(` BRAVE_KEY:      ${isSet('BRAVE_API_KEY')}`);
                console.log(` SHARED_KEY:     ${isSet('GOOGLE_API_KEY')}`);

                // 3. Active Wardens (Local File Scan)
                console.log(chalk.cyan('\n ◤ ACTIVE RAVENS ◢ '));
                const wardenDir = join(PROJECT_ROOT, 'src', 'sentinel', 'wardens');
                let active_wardens = [];
                if (fs.existsSync(wardenDir)) {
                    active_wardens = fs.readdirSync(wardenDir)
                        .filter(f => f.endsWith('.py') && !f.startsWith('__'))
                        .map(f => f.replace('.py', ''));
                }

                if (active_wardens.length > 0) {
                    // Title Case formatting
                    active_wardens = active_wardens.map(w => w.charAt(0).toUpperCase() + w.slice(1));
                    for (let i = 0; i < active_wardens.length; i += 2) {
                        const w1 = active_wardens[i];
                        const w2 = active_wardens[i + 1] || "";
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

            } catch (err) {
                handleError(err.message);
            }
        } else {
            program.help();
        }
    });

// Fallback for completely unrecognized usage or missing commands
program.on('command:*', function (operands) {
    handleError(`Unknown command '${operands[0]}'`);
});

try {
    program.parse(process.argv);
} catch (error) {
    handleError(error.message);
}
