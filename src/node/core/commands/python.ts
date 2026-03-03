import { Command } from 'commander';
import { join } from 'node:path';
import { execa } from 'execa';

/**
 * [GUNGNIR] Domain & Protocol Command Spokes
 * Purpose: Dispatch to Python components (UI, Protocol, Dormancy, Learning).
 * @param program
 * @param PROJECT_ROOT
 */
export function registerPythonSpokes(program: Command, PROJECT_ROOT: string) {
    program
        .command('dominion')
        .description('The UI')
        .action(async () => {
            try {
                await execa('python', [join(PROJECT_ROOT, 'src/cstar/core/tui.py')], { stdio: 'inherit' });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('odin')
        .description('The Protocol')
        .action(async () => {
            try {
                await execa('python', [join(PROJECT_ROOT, 'src/games/odin_protocol/main.py')], { stdio: 'inherit' });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('dormancy')
        .alias('sleep')
        .description('Initiate Dormancy Protocol (Sleep)')
        .action(async () => {
            try {
                const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
                const dormancyScript = join(PROJECT_ROOT, 'src/skills/local/dormancy.py');
                await execa(pythonPath, [dormancyScript], {
                    stdio: 'inherit',
                    env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('skill')
        .description('Skill Management & Acquisition')
        .option('-l, --learn', 'Initiate proactive learning (ALFRED Mandate)')
        .action(async (options: { learn?: boolean }) => {
            if (options.learn) {
                try {
                    const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
                    const learnScript = join(PROJECT_ROOT, 'src/skills/local/SkillLearning/learn.py');
                    await execa(pythonPath, [learnScript], {
                        stdio: 'inherit',
                        env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                    });
                } catch (err) {
                    process.exit(1);
                }
            } else {
                program.help();
            }
        });
}
