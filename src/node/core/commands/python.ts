import { Command } from 'commander';
import { join } from 'node:path';
import { execa } from 'execa';
import { ANS } from '../ans.js';

import { getPythonPath } from '../python_utils.js';

/**
 * [GUNGNIR] Domain & Protocol Command Spokes
 * Purpose: Explicit compatibility entry points for UI, game, and state-only sleep.
 * @param program
 * @param PROJECT_ROOT
 */
export function registerPythonSpokes(program: Command, PROJECT_ROOT: string) {
    program
        .command('dominion')
        .description('Launch the explicit local Python compatibility UI')
        .action(async () => {
            try {
                await execa(getPythonPath(), [join(PROJECT_ROOT, 'src/cstar/core/tui.py')], { stdio: 'inherit' });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('odin')
        .description('Launch the explicit standalone Odin game')
        .action(async () => {
            try {
                await execa(getPythonPath(), [join(PROJECT_ROOT, 'src/games/odin_protocol/main.py')], { stdio: 'inherit' });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('dormancy')
        .alias('sleep')
        .description('Record a deterministic dormant runtime-state transition')
        .action(async () => {
            await ANS.sleep();
        });

}
