import chalk from 'chalk';
import type { Command } from 'commander';

export const RUN_SKILL_RETIRED_ERROR =
    'legacy_run_skill_cli_retired_use_host_or_cstar_kernel';

/** Register an explicit tombstone for the retired dynamic skill CLI. */
export function registerRunSkillCommand(program: Command): void {
    program
        .command('run-skill <id>')
        .description('Retired: use the active host skill surface or cstar-kernel MCP')
        .allowUnknownOption(true)
        .action((id: string) => {
            console.error(chalk.red(`${RUN_SKILL_RETIRED_ERROR}:${id.trim().toLowerCase()}`));
            process.exitCode = 1;
        });
}
