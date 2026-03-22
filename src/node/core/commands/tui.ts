import { Command } from 'commander';

import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import type { RuntimeDispatchPort } from  '../runtime/contracts.js';
import { runOperatorTui } from  '../tui/operator_tui.js';

export function registerTuiCommand(
    program: Command,
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
): void {
    program
        .command('tui')
        .description('Launch the Corvus Star operator matrix')
        .action(async () => {
            await runOperatorTui(dispatchPort);
        });
}
