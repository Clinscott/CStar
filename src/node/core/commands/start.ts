import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import { CortexLink } from '../../cortex_link.ts';
import { executeCycle } from '../../agent_loop.ts';

/**
 * [GUNGNIR] Start Command Spoke
 * Purpose: Initiate the Agent Loop and bind the Gungnir-Cortex link.
 */
export function registerStartCommand(program: Command) {
    program
        .command('start <target>')
        .description('The Agent Loop')
        .option('-t, --task <desc>', 'task description for the compute plane', '')
        .option('--ledger <dir>', 'ledger context directory', join(process.cwd(), 'ledger'))
        .option('--debug', 'enable debug mode')
        .action(async (target: string, options: { task: string; ledger: string; debug?: boolean }) => {
            try {
                // Instantiate and assure Gungnir -> Cortex link
                const link = new CortexLink();
                await link.ensureDaemon();

                await executeCycle(
                    target,
                    options.ledger,
                    options.task,
                    link
                );

            } catch (error: any) {
                console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
                console.error(chalk.red(`Critical Failure: ${error.message}`));
                process.exit(1);
            }
        });
}
