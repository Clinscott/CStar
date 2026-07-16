import type { Command } from 'commander';

import type { WorkspaceRootSource } from '../runtime/invocation.js';

export const ONE_MIND_COMMAND_RETIRED_ERROR =
    'legacy_one_mind_command_retired_use_cstar_kernel';

/**
 * Register an import-compatible tombstone. The workspace source is
 * intentionally never resolved: lifecycle and coordination belong to the
 * typed cstar-kernel surface.
 */
export function registerOneMindCommand(
    program: Command,
    _workspaceRootSource: WorkspaceRootSource = '',
): void {
    program
        .command('one-mind [args...]')
        .description('Retired: use typed cstar-kernel coordination tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(ONE_MIND_COMMAND_RETIRED_ERROR);
        });
}
