import { Command } from 'commander';
import { join } from 'node:path';
import { execa } from 'execa';
import { ANS } from '../ans.js';

import { getPythonPath } from '../python_utils.js';

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
                await execa(getPythonPath(), [join(PROJECT_ROOT, 'src/cstar/core/tui.py')], { stdio: 'inherit' });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('odin')
        .description('The Protocol')
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
        .description('Initiate Dormancy Protocol (Sleep)')
        .action(async () => {
            await ANS.sleep();
        });

    program
        .command('skill')
        .description('Skill Management & Acquisition')
        .option('-l, --learn', 'Initiate proactive learning (ALFRED Mandate)')
        .action(async (options: { learn?: boolean }) => {
            if (options.learn) {
                try {
                    const pythonPath = getPythonPath();
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

    program
        .command('lore')
        .description('TALIESIN: Social Lore & Style Engine')
        .option('-i, --ingest', 'Scan .lore/ for writing samples and analyze style')
        .option('-m, --mode <mode>', 'Article or Story mode', 'article')
        .option('-c, --character <character>', 'Character voice for story mode')
        .option('-p, --post', 'Generate post and enter staging gate')
        .action(async (options: { ingest?: boolean; mode?: string; character?: string; post?: boolean }) => {
            try {
                const pythonPath = getPythonPath();
                const taliesinScript = join(PROJECT_ROOT, 'docs/legacy_archive/src_sentinel/taliesin.py');
                const args = [];
                if (options.ingest) args.push('--ingest');
                if (options.mode) args.push('--mode', options.mode);
                if (options.character) args.push('--character', options.character);
                if (options.post) args.push('--post');

                await execa(pythonPath, [taliesinScript, ...args], {
                    stdio: 'inherit',
                    env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                });
            } catch (err) {
                process.exit(1);
            }
        });

    program
        .command('recreate')
        .description('TALIESIN: Autonomic Narrative Engine (Fallows Hallow)')
        .requiredOption('-s, --scenario <scenario>', 'Opening scenario overview')
        .requiredOption('-d, --details <details>', 'Narrative details to hit')
        .requiredOption('-c, --conclusion <conclusion>', 'Required conclusion')
        .requiredOption('-x, --chars <chars>', 'Comma separated characters involved (e.g. Roan,John)')
        .action(async (options: { scenario: string; details: string; conclusion: string; chars: string }) => {
            try {
                const pythonPath = getPythonPath();
                const recreateScript = join(PROJECT_ROOT, 'src/core/engine/ravens/recreate_chapter.py');
                await execa(pythonPath, [
                    recreateScript,
                    '--scenario', options.scenario,
                    '--details', options.details,
                    '--conclusion', options.conclusion,
                    '--chars', options.chars
                ], {
                    stdio: 'inherit',
                    env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                });
            } catch (err) {
                process.exit(1);
            }
        });
}

