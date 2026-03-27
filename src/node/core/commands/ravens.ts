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
 * [GUNGNIR] Raven Command Spoke
 * Purpose: Authoritative shell for Raven Warden orchestration.
 */
export function registerRavenCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    const ravens = program
        .command('ravens')
        .description('Monitor and Orchestrate the Raven Wardens');

    ravens
        .command('start')
        .description('Run a one-shot Ravens sweep across configured repos')
        .option('--shadow-forge', 'Execute in sandboxed Docker container')
        .option('--spoke <slug>', 'Sweep only a specific mounted spoke')
        .action(async (options: { shadowForge?: boolean; spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('start', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('sweep')
        .description('Run a one-shot Ravens sweep across configured repos')
        .option('--shadow-forge', 'Execute in sandboxed Docker container')
        .option('--spoke <slug>', 'Sweep only a specific mounted spoke')
        .action(async (options: { shadowForge?: boolean; spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('sweep', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('cycle')
        .description('Execute one ravens cycle through the stage-composed runtime')
        .option('--spoke <slug>', 'Run one cycle against a specific mounted spoke')
        .action(async (options: { spoke?: string }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('cycle', options, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('stop')
        .description('Show that no resident Ravens daemon is active in kernel mode')
        .action(async () => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const result = await dispatchPort.dispatch(buildRavensInvocation('stop', {}, workspaceRoot));
            renderStandardCommandResult(result, workspaceRoot);
        });

    ravens
        .command('status')
        .description('Display Raven health and quota isolation')
        .option('--spoke <slug>', 'Show target information for a specific mounted spoke')
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
