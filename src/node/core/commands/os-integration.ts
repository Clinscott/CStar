import type { Command } from 'commander';

export const OS_INTEGRATION_COMMAND_RETIRED_ERROR =
    'legacy_os_integration_command_retired_requires_operator_gate';

/** Register a tombstone that cannot install, remove, or inspect host hooks. */
export function registerOsCommands(program: Command): void {
    program
        .command('os [args...]')
        .description('Retired: host integration requires an explicit supported operator window')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(OS_INTEGRATION_COMMAND_RETIRED_ERROR);
        });
}
