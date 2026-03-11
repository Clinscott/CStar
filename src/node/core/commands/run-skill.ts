import { Command } from 'commander';
import chalk from 'chalk';
import { SkillDispatcher } from '../skills/SkillManager.js';
import { SkillBead } from '../skills/types.js';
import { getGungnirOverall } from '../../../types/gungnir.js';

/**
 * [🔱] THE SKILL RUN COMMAND
 * Purpose: Authoritative CLI entrypoint for invoking Woven Skills.
 */
export function registerRunSkillCommand(program: Command) {
    program
        .command('run-skill <id>')
        .description('Directly invoke a Woven Skill by ID')
        .option('-t, --target <path>', 'Target path for the skill')
        .option('-i, --intent <string>', 'Intent override for the execution')
        .option('-p, --params <json>', 'JSON parameters for the skill')
        .action(async (id: string, options: { target?: string, intent?: string, params?: string }) => {
            const dispatcher = SkillDispatcher.getInstance();
            
            const bead: SkillBead = {
                id: `CLI-RUN-${Date.now()}`,
                skill_id: id,
                target_path: options.target || '.',
                intent: options.intent || `Direct CLI invocation of skill ${id}`,
                params: options.params ? JSON.parse(options.params) : {},
                status: 'PENDING',
                priority: 1
            };

            console.log(chalk.cyan(`\n ◤ DISPATCHING SKILL: ${id} ◢ `));
            console.log(chalk.dim('━'.repeat(40)));

            try {
                const result = await dispatcher.dispatch(bead);
                
                if (result.status === 'SUCCESS') {
                    console.log(chalk.green(`\n✔ SKILL EXECUTION SUCCESSFUL`));
                    console.log(`${chalk.bold('OUTPUT:')} ${result.output}`);
                    console.log(
                        `${chalk.bold('GUNGNIR Ω:')} ${getGungnirOverall(result.initial_metrics).toFixed(2)} -> ${getGungnirOverall(result.final_metrics).toFixed(2)}`,
                    );
                } else {
                    console.error(chalk.red(`\n✖ SKILL EXECUTION FAILED`));
                    console.error(`${chalk.bold('ERROR:')} ${result.error}`);
                }
            } catch (err: any) {
                console.error(chalk.red(`\n✖ CRITICAL DISPATCH FAILURE`));
                console.error(`${chalk.bold('ERROR:')} ${err.message}`);
            }

            console.log(chalk.dim('━'.repeat(40) + '\n'));
        });
}
