import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';

import { renderStandardCommandResult } from './command_context.js';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import { RuntimeDispatchPort, StartWeavePayload, WeaveInvocation } from  '../runtime/contracts.js';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from  '../runtime/invocation.js';

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

/**
 * [GUNGNIR] Start Command Spoke
 * Purpose: Authoritative shell for the Agent Loop and system pulse.
 */
export function registerStartCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    program
        .command('start [target]')
        .description('Initiate the Agent Loop or awaken the system pulse')
        .option('-t, --task <desc>', 'task description for the compute plane', '')
        .option('--ledger <dir>', 'ledger context directory')
        .option('--loki', 'Enable Loki Mode: Autonomous, high-velocity execution bypassing human-in-the-loop')
        .option('--debug', 'enable debug mode')
        .option('-v, --verbose', 'Enable verbose architectural logging')
        .action(async (target: string | undefined, options: { task: string; ledger: string; loki?: boolean; debug?: boolean; verbose?: boolean }) => {
            try {
                const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
                const result = await dispatchPort.dispatch(buildStartInvocation(target, {
                    ...options,
                    ledger: options.ledger || join(workspaceRoot, 'ledger'),
                }, workspaceRoot));
                renderStandardCommandResult(result, workspaceRoot);
            } catch (error: any) {
                console.error(chalk.red(`\nCritical Dispatch Error: ${error.message}`));
            }
        });
}
