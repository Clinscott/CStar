import { Command } from 'commander';

import { renderStandardCommandResult } from './command_context.js';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import { RavensAction, RavensWeavePayload, RuntimeDispatchPort, WeaveInvocation } from  '../runtime/contracts.js';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from  '../runtime/invocation.js';

export function buildRavensInvocation(
    action: RavensAction,
    options: { shadowForge?: boolean; spoke?: string } = {},
    workspaceRoot: string,
): WeaveInvocation<RavensWeavePayload> {
    const payload: RavensWeavePayload = {
        action,
        shadow_forge: options.shadowForge,
    };

    if (options.spoke) {
        payload.spoke = options.spoke;
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:ravens',
        payload,
    }, workspaceRoot);
}

/**
 * Read-only Ravens compatibility command.
 */
export function registerRavenCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    const ravens = program
        .command('ravens')
        .description('Inspect retired Ravens compatibility status');

    ravens
        .command('start')
        .description('Reject retired Ravens execution (compatibility command)')
        .option('--shadow-forge', 'Retired compatibility option; no execution occurs')
        .option('--spoke <slug>', 'Record the requested spoke in the rejection receipt')
        .action(async (options: { shadowForge?: boolean; spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('start', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('sweep')
        .description('Reject retired Ravens execution (compatibility command)')
        .option('--shadow-forge', 'Retired compatibility option; no execution occurs')
        .option('--spoke <slug>', 'Record the requested spoke in the rejection receipt')
        .action(async (options: { shadowForge?: boolean; spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('sweep', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('cycle')
        .description('Reject retired Ravens execution (compatibility command)')
        .option('--spoke <slug>', 'Record the requested spoke in the rejection receipt')
        .action(async (options: { spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('cycle', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('stop')
        .description('Report that no resident Ravens daemon is active')
        .action(async () => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('stop', {}, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('status')
        .description('Display read-only retired Ravens compatibility status')
        .option('--spoke <slug>', 'Show read-only target information for a specific mounted spoke')
        .action(async (options: { spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('status', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens.action(async () => {
        const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
        const result = await dispatchPort.dispatch(buildRavensInvocation('status', {}, workspaceRoot));
        renderStandardCommandResult(result, workspaceRoot);
    });
}
