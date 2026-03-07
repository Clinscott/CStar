import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import { execa } from 'execa';

/**
 * [GUNGNIR] PennyOne Command Spoke
 * Purpose: Repository intelligence, 3D visualization, and intent search.
 * @param program
 * @param PROJECT_ROOT
 */
export function registerPennyOneCommand(program: Command, PROJECT_ROOT: string) {
    program
        .command('pennyone')
        .alias('p1')
        .description('Operation PennyOne: 3D Neural Matrix & Repository Stats')
        .option('-s, --scan [path]', 'Scan the repository for stats and Gungnir scores', '.')
        .option('-v, --view', 'Spin up the 3D Gungnir Matrix visualization bridge')
        .option('-c, --clean', 'Purge the .stats/ directory and all archived sessions')
        .option('--stats', 'View long-term agent activity and logic loop analytics')
        .option('--search <query>', 'Search the Hall of Records by intent, path, or API endpoint')
        .action(async (options: { scan?: string | boolean; view?: boolean; clean?: boolean; stats?: boolean; search?: string }) => {
            try {
                const pennyoneBin = join(PROJECT_ROOT, 'bin', 'pennyone.js');
                const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

                if (options.search) {
                    const searchScript = join(PROJECT_ROOT, 'src/tools/pennyone/live/search.js');
                    await execa(npxCmd, ['tsx', searchScript, options.search], { stdio: 'inherit' });
                    return;
                }

                if (options.stats) {
                    const analyticsScript = join(PROJECT_ROOT, 'scripts', 'p1_analytics.js');
                    await execa(npxCmd, ['tsx', analyticsScript], { stdio: 'inherit' });
                    return;
                }

                if (options.view) {
                    await execa(npxCmd, ['tsx', pennyoneBin, 'view'], { stdio: 'inherit' });
                    return;
                }

                if (options.scan) {
                    const scanPath = typeof options.scan === 'string' ? options.scan : '.';
                    const cstarPath = join(PROJECT_ROOT, 'bin', 'cstar.js');
                    await execa('node', [cstarPath, 'scan', '--path', scanPath], { stdio: 'inherit' });
                    return;
                }

            } catch (err) {
                console.error(chalk.red('[ALFRED]: "Operation PennyOne interrupted or failed."'));
                process.exit(1);
            }
        });
}

