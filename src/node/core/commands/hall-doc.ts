import type { Command } from 'commander';

export const HALL_DOCUMENT_COMMAND_RETIRED_ERROR =
    'legacy_hall_document_command_retired_use_cstar_kernel';

/** Register a fail-closed compatibility route for retired Hall document CLI actions. */
export function registerHallDocumentCommand(program: Command): void {
    program
        .command('hall-doc [args...]')
        .description('Retired: use typed cstar-kernel Hall document tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(HALL_DOCUMENT_COMMAND_RETIRED_ERROR);
        });
}
