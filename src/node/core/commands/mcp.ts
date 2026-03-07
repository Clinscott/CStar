import { Command } from 'commander';
import chalk from 'chalk';

/**
 * MCP Command Spoke (v1.0)
 * Purpose: Provide documentation for the Bifrost Bridge (MCP Servers).
 * Standard: Linscott Protocol / Spoke Standard
 */
export function registerMcpCommand(program: Command): void {
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
}
