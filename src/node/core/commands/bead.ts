import type { Command } from 'commander';

export const BEAD_COMMAND_RETIRED_ERROR =
    'legacy_bead_command_retired_use_cstar_kernel';

/** Register a tombstone that cannot read or transition Hall beads. */
export function registerBeadCommand(program: Command): void {
    program
        .command('bead [args...]')
        .description('Retired: use typed cstar-kernel bead lifecycle tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(BEAD_COMMAND_RETIRED_ERROR);
        });
}
