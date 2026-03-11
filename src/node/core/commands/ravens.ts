import { Command } from 'commander';
import chalk from 'chalk';

import { RuntimeDispatcher } from '../runtime/dispatcher.ts';
import { RavensAction, RavensWeavePayload, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../runtime/contracts.ts';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.ts';

function renderResult(result: WeaveResult): void {
    if (result.status === 'FAILURE') {
        console.error(chalk.red(`\n[SYSTEM FAILURE]: ${result.error ?? 'Unknown runtime failure.'}`));
        return;
    }

    const printer = result.status === 'TRANSITIONAL' ? chalk.yellow : chalk.green;
    console.log(printer(`\n[ALFRED]: "${result.output}"`));
}

export function buildRavensInvocation(
    action: RavensAction,
    options: { shadowForge?: boolean; spoke?: string } = {},
    workspaceRoot: string,
): WeaveInvocation<RavensWeavePayload> {
    return withCliWorkspaceTarget({
        weave_id: 'weave:ravens',
        payload: {
            action,
            shadow_forge: options.shadowForge,
            spoke: options.spoke,
        },
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
            const result = await dispatchPort.dispatch(buildRavensInvocation('start', options, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });

    ravens
        .command('sweep')
        .description('Run a one-shot Ravens sweep across configured repos')
        .option('--shadow-forge', 'Execute in sandboxed Docker container')
        .option('--spoke <slug>', 'Sweep only a specific mounted spoke')
        .action(async (options: { shadowForge?: boolean; spoke?: string }) => {
            const result = await dispatchPort.dispatch(buildRavensInvocation('sweep', options, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });

    ravens
        .command('cycle')
        .description('Execute one ravens cycle through the stage-composed runtime')
        .option('--spoke <slug>', 'Run one cycle against a specific mounted spoke')
        .action(async (options: { spoke?: string }) => {
            const result = await dispatchPort.dispatch(buildRavensInvocation('cycle', options, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });

    ravens
        .command('stop')
        .description('Show that no resident Ravens daemon is active in kernel mode')
        .action(async () => {
            const result = await dispatchPort.dispatch(buildRavensInvocation('stop', {}, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });

    ravens
        .command('status')
        .description('Display Raven health and quota isolation')
        .option('--spoke <slug>', 'Show target information for a specific mounted spoke')
        .action(async (options: { spoke?: string }) => {
            const result = await dispatchPort.dispatch(buildRavensInvocation('status', options, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });

    ravens.action(async () => {
        const result = await dispatchPort.dispatch(buildRavensInvocation('status', {}, resolveWorkspaceRoot(workspaceRootSource)));
        renderResult(result);
    });
}
