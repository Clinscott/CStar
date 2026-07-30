import type { Command } from 'commander';

import type { RuntimeDispatchPort } from '../runtime/contracts.js';

export const TUI_COMMAND_RETIRED_ERROR =
    'legacy_tui_command_retired_use_cstar_status';

/** Register a tombstone that never resolves or invokes a runtime dispatcher. */
export function registerTuiCommand(
    program: Command,
    _dispatchPort?: RuntimeDispatchPort,
): void {
    program
        .command('tui [args...]')
        .description('Retired: use bounded CStar inspection surfaces')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(TUI_COMMAND_RETIRED_ERROR);
        });
}
