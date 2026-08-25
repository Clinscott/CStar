import type { Command } from 'commander';

import type { RuntimeDispatchPort, StartWeavePayload, WeaveInvocation } from '../runtime/contracts.js';
import { withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.js';

export const START_COMMAND_RETIRED_ERROR =
    'legacy_start_command_retired_use_cstar_kernel';

export function buildStartInvocation(
    target: string | undefined,
    options: { task: string; ledger: string; loki?: boolean; debug?: boolean; verbose?: boolean },
    workspaceRoot: string,
): WeaveInvocation<StartWeavePayload> {
    return withCliWorkspaceTarget({
        weave_id: 'weave:start',
        payload: {
            target,
            task: options.task,
            ledger: options.ledger,
            loki: options.loki,
            debug: options.debug,
            verbose: options.verbose,
        },
    }, workspaceRoot);
}

/** Register a tombstone that never resolves a workspace or dispatches a weave. */
export function registerStartCommand(
    program: Command,
    _workspaceRootSource: WorkspaceRootSource = '',
    _dispatchPort?: RuntimeDispatchPort,
): void {
    program
        .command('start [args...]')
        .description('Retired: use typed cstar-kernel lifecycle tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(START_COMMAND_RETIRED_ERROR);
        });
}
