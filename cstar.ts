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

    program
        .command('mcp')
        .description('Explain the Model Context Protocol (MCP) / Bifrost Bridge integration')
        .action(() => {
            console.log(chalk.cyan('\n ◤ THE BIFROST BRIDGE: MCP DOCUMENTATION ◢ '));
            console.log(chalk.white(' Corvus Star is exposed via two primary MCP servers:'));
            
            console.log(chalk.magenta('\n 1. pennyone (The Brain)'));
            console.log(chalk.yellow('  ◈ search_by_intent: ') + chalk.dim('High-fidelity FTS5 search of Mimir\'s Well.'));
            console.log(chalk.yellow('  ◈ get_file_intent:  ') + chalk.dim('Retrieve intent and protocol for a file.'));
            console.log(chalk.yellow('  ◈ index_sector:     ') + chalk.dim('Trigger an incremental scan.'));
            console.log(chalk.yellow('  ◈ get_technical_debt: ') + chalk.dim('Retrieve the technical debt ledger.'));

            console.log(chalk.magenta('\n 2. corvus-control (The Bridge)'));
            console.log(chalk.yellow('  ◈ execute_cstar_command: ') + chalk.dim('Run core cstar commands (start, odin).'));
            console.log(chalk.yellow('  ◈ run_workflow:          ') + chalk.dim('Trigger complex workflows (fish, lets-go).'));
            console.log(chalk.yellow('  ◈ get_system_vitals:     ') + chalk.dim('Check system health and mission traces.'));
            console.log(chalk.yellow('  ◈ verify_sterling_compliance: ') + chalk.dim('Audit files for testing gaps.'));

            console.log(chalk.cyan('\n [MANDATE]: Agents MUST prioritize these tools over manual CLI execution.\n'));
        });

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
