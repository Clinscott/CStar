import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import { CortexLink } from '../../cortex_link.ts';
import { executeCycle } from '../../agent_loop.ts';
import { ANS } from '../ans.ts';
import { runScan } from '../../../tools/pennyone/index.ts';

/**
 * [GUNGNIR] Start Command Spoke
 * Purpose: Initiate the Agent Loop OR Awaken the entire system if no target is provided.
 * @param program
 */
export function registerStartCommand(program: Command) {
    program
        .command('start [target]')
        .description('Initiate the Agent Loop or awaken the system pulse')
        .option('-t, --task <desc>', 'task description for the compute plane', '')
        .option('--ledger <dir>', 'ledger context directory', join(process.cwd(), 'ledger'))
        .option('--loki', 'Enable Loki Mode: Autonomous, high-velocity execution bypassing human-in-the-loop')
        .option('--debug', 'enable debug mode')
        .action(async (target: string | undefined, options: { task: string; ledger: string; loki?: boolean; debug?: boolean }) => {
            try {
                // [🔱] THE ONE MIND: Ensure the environment is synced
                if (process.env.GEMINI_CLI_ACTIVE !== 'true') {
                    console.warn(chalk.yellow('\n[ALFRED]: "Intelligence Mandate Breach: Agent is offline. Intent generation cannot proceed."'));
                    console.warn(chalk.dim('Please set GEMINI_CLI_ACTIVE="true" in your environment to engage the Oracle.\n'));
                }

                if (!target) {
                    if (options.loki) {
                        console.log(chalk.red.bold('\n ◤ INITIATING LOKI MODE (AUTONOMOUS POLLING) ◢ '));
                        const link = new CortexLink();
                        await link.ensureDaemon();
                        
                        const response = await link.sendCommand('NORN_POLL', []);
                        if (response && response.status === 'success') {
                            console.log(chalk.green(`\n[LOKI]: "Poll complete."`));
                        } else {
                            console.log(chalk.yellow(`\n[LOKI]: "Poll failed or no tasks available."`));
                        }
                        return;
                    }

                    // [Ω] SYSTEM PULSE PROTOCOL
                    console.log(chalk.cyan('\n ◤ INITIATING SYSTEM PULSE (THE AWAKENING) ◢ '));
                    
                    // 1. Wake the Autonomic Nervous System
                    await ANS.wake();
                    
                    // 2. Status Report
                    console.log(chalk.green('\n[ALFRED]: "The system is awake and synchronized, sir. The Gungnir Matrix is active."'));
                    return;
                }

                // [Ω] AGENT LOOP PROTOCOL
                // Instantiate and assure Gungnir -> Cortex link
                const link = new CortexLink();
                await link.ensureDaemon();

                await executeCycle(
                    target,
                    options.ledger,
                    options.task,
                    link,
                    undefined, // use default deployExec
                    options.loki
                );

            } catch (error: any) {
                console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
                console.error(chalk.red(`Critical Failure: ${error.message}`));
                process.exit(1);
            }
        });
}
