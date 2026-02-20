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

// Fallback for completely unrecognized usage or missing commands
program.on('command:*', function (operands) {
    handleError(`Unknown command '${operands[0]}'`);
});

try {
    program.parse(process.argv);
} catch (error) {
    handleError(error.message);
}
