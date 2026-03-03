#!/usr/bin/env tsx

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runStartupCeremony } from './src/node/ceremony.ts';

// Command Spokes
import { registerStartCommand } from './src/node/core/commands/start.ts';
import { registerPythonSpokes } from './src/node/core/commands/python.ts';
import { registerPennyOneCommand } from './src/node/core/commands/pennyone.ts';
import { registerRavenCommand } from './src/node/core/commands/ravens.ts';
import { registerDispatcher } from './src/node/core/commands/dispatcher.ts';

/**
 * 🔱 GUNGNIR CONTROL PLANE (v2.0)
 * Purpose: Sovereign entry point for Corvus Star. 
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = __dirname;
const pkgPath = join(PROJECT_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const program = new Command();

(async () => {
    const isHelpOrVersion = process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--version') || process.argv.includes('-V');

    if (!isHelpOrVersion) {
        await runStartupCeremony();
    }

    if (process.env.GEMINI_CLI_ACTIVE === 'true' && !isHelpOrVersion) {
        console.log(chalk.bgMagenta.white.bold(' ◤ GEMINI CLI INTEGRATION ACTIVE ◢ '));
        console.log(chalk.magenta(' ' + '━'.repeat(40) + '\n'));
    }

    program
        .name('cstar')
        .description('Corvus Star (C*) - Gungnir Control Plane (TypeScript Core)')
        .version(pkg.version);

    // --- Register Command Spokes ---
    registerStartCommand(program);
    registerPythonSpokes(program, PROJECT_ROOT);
    registerPennyOneCommand(program, PROJECT_ROOT);
    registerRavenCommand(program, PROJECT_ROOT);
    registerDispatcher(program, PROJECT_ROOT);

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
