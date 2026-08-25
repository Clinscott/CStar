import type { Command } from 'commander';

import type {
    RavensAction,
    RavensWeavePayload,
    RuntimeDispatchPort,
    WeaveInvocation,
} from '../runtime/contracts.js';
import { withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.js';

export const RAVENS_COMMAND_RETIRED_ERROR =
    'legacy_ravens_command_retired_use_cstar_kernel';

export function buildRavensInvocation(
    action: RavensAction,
    options: { shadowForge?: boolean; spoke?: string; hostSupervision?: boolean } = {},
    workspaceRoot: string,
): WeaveInvocation<RavensWeavePayload> {
    const payload: RavensWeavePayload = {
        action,
        shadow_forge: options.shadowForge,
    };
    if (options.spoke) payload.spoke = options.spoke;
    if (options.hostSupervision === true) payload.host_supervision = true;
    return withCliWorkspaceTarget({ weave_id: 'weave:ravens', payload }, workspaceRoot);
}

/** Register a tombstone that never resolves a workspace or dispatches Ravens. */
export function registerRavenCommand(
    program: Command,
    _workspaceRootSource: WorkspaceRootSource = '',
    _dispatchPort?: RuntimeDispatchPort,
): void {
    program
        .command('ravens [args...]')
        .description('Retired: use typed cstar-kernel inspection and lifecycle tools')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(RAVENS_COMMAND_RETIRED_ERROR);
        });
}
