import { Command } from 'commander';

import { RuntimeDispatcher } from '../runtime/dispatcher.ts';
import type { RuntimeDispatchPort } from '../runtime/contracts.ts';
import { runOperatorTui } from '../tui/operator_tui.ts';

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
