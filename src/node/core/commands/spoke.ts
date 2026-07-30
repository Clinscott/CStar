import type { Command } from 'commander';

import type { WorkspaceRootSource } from '../runtime/invocation.js';

export const SPOKE_COMMAND_RETIRED_ERROR =
    'legacy_spoke_command_retired_use_cstar_kernel';

/**
 * Register a fail-closed compatibility route. The workspace source is not
 * evaluated, so parsing cannot project files or mutate Hall/state.
 */
export function registerSpokeCommand(
    program: Command,
    _projectRootSource: WorkspaceRootSource,
): void {
    program
        .command('spoke [args...]')
        .description('Retired: use typed cstar-kernel spoke tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(SPOKE_COMMAND_RETIRED_ERROR);
        });
}
