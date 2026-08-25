import type { Command } from 'commander';

export const VITALS_COMMAND_RETIRED_ERROR =
    'legacy_vitals_command_retired_use_cstar_status';

/** Register an import-compatible fail-closed tombstone for legacy vitals. */
export function registerVitalsCommand(program: Command): void {
    program
        .command('vitals [args...]')
        .description('Retired: use the bounded cstar status surface')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(VITALS_COMMAND_RETIRED_ERROR);
        });
}
