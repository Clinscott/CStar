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
 * Purpose: Explicit, deterministic runtime-state transition.
 */
export function registerStartCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    program
        .command('start [target]')
        .description('Record a deterministic awake runtime-state transition')
        .option('-t, --task <desc>', 'compatibility metadata only; does not dispatch work', '')
        .option('--ledger <dir>', 'compatibility metadata only; does not grant lifecycle authority')
        .option('--loki', 'Retired compatibility flag; fails closed and never resumes autonomous execution')
        .option('--debug', 'set local debug diagnostics for the current process')
        .option('-v, --verbose', 'set local verbose diagnostics for the current process')
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
