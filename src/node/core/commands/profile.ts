import type { Command } from 'commander';

export const PROFILE_COMMAND_RETIRED_ERROR =
    'legacy_profile_command_retired_requires_supported_profile_surface';

/** Register a tombstone that never reads identity, environment, stdin, or secrets. */
export function registerProfileCommand(program: Command): void {
    program
        .command('profile [args...]')
        .description('Retired: use a supported operator-gated profile surface')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(PROFILE_COMMAND_RETIRED_ERROR);
        });
}
