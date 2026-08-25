import type { Command } from 'commander';
import type { RuntimeDispatchPort } from '../runtime/contracts.js';
import type { WorkspaceRootSource } from '../runtime/invocation.js';

export const PENNYONE_COMMAND_RETIRED_ERROR =
    'legacy_pennyone_command_retired_use_cstar_kernel';

export type LegacyPennyOneOptions = Record<string, unknown>;

/** Retired before constructing a host-workflow invocation. */
export function buildPennyOneInvocation(
    _options: LegacyPennyOneOptions,
    _workspaceRoot: string,
): never {
    throw new Error(PENNYONE_COMMAND_RETIRED_ERROR);
}

export function registerPennyOneCommand(
    program: Command,
    _workspaceRootSource: WorkspaceRootSource = '',
    _dispatchPort?: RuntimeDispatchPort,
): void {
    program
        .command('pennyone [args...]')
        .alias('p1')
        .description('Retired: use typed cstar-kernel PennyOne and Hall tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(PENNYONE_COMMAND_RETIRED_ERROR);
        });
}
