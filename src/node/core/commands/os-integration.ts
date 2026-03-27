import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

function getHomeDir() {
    return os.homedir();
}

/**
 * [GUNGNIR] OS Integration Commands
 * Purpose: Natively manage the installation of CStar OS hooks into the Host user space.
 */
export function registerOsCommands(program: Command) {
    const osCmd = program
        .command('os')
        .description('Manage CStar OS host integration (Ring 0 Hooks)');

    osCmd
        .command('install')
        .description('Install CStar OS global mandates and git hooks into the host user space')
        .action(() => {
            console.log(chalk.cyan('◤ INITIATING CSTAR OS INSTALLATION (RING 0) ◢'));
            const userHome = getHomeDir();

            console.log(chalk.dim('  ↳ Syncing global OS Mandates to host user space...'));

            // 1. Claude OS Hook
            const claudeSrc = path.join(PROJECT_ROOT, 'CLAUDE.md');
            const claudeDest = path.join(userHome, 'CLAUDE.md');
            if (fs.existsSync(claudeSrc)) {
                fs.copyFileSync(claudeSrc, claudeDest);
                console.log(chalk.green('    ◈ CLAUDE: Sovereign.'));
            }

            // 2. Cursor OS Hook
            const cursorSrc = path.join(PROJECT_ROOT, '.cursorrules');
            const cursorDest = path.join(userHome, '.cursorrules');
            if (fs.existsSync(cursorSrc)) {
                fs.copyFileSync(cursorSrc, cursorDest);
                console.log(chalk.green('    ◈ CURSOR: Sovereign.'));
            }

            // 3. Gemini OS Hook
            const geminiDir = path.join(userHome, '.gemini');
            if (!fs.existsSync(geminiDir)) {
                fs.mkdirSync(geminiDir, { recursive: true });
            }
            const geminiSrc = path.join(PROJECT_ROOT, '.gemini', 'GEMINI.md');
            const geminiDest = path.join(geminiDir, 'GEMINI.md');
            if (fs.existsSync(geminiSrc)) {
                fs.copyFileSync(geminiSrc, geminiDest);
                console.log(chalk.green('    ◈ GEMINI: Sovereign.'));
            }

            console.log(chalk.dim('  ↳ Engaging Kernel Gatekeeper (Hardware Lock)...'));
            // 4. Git Hooks
            const hookDir = path.join(PROJECT_ROOT, '.git', 'hooks');
            if (fs.existsSync(hookDir)) {
                // Pre-commit: Gatekeeper
                const gatekeeperSrc = path.join(PROJECT_ROOT, 'scripts', 'gatekeeper.py');
                const gatekeeperDest = path.join(hookDir, 'pre-commit');
                if (fs.existsSync(gatekeeperSrc)) {
                    fs.copyFileSync(gatekeeperSrc, gatekeeperDest);
                    fs.chmodSync(gatekeeperDest, '755');
                    console.log(chalk.green('    ◈ GATEKEEPER: Armed (pre-commit).'));
                }

                // Post-commit: Muninn Daemon
                const postCommitDest = path.join(hookDir, 'post-commit');
                const postCommitContent = `#!/bin/bash\n# [Ω] CStar Muninn Daemon\nnode ${path.join(PROJECT_ROOT, 'bin/cstar.js')} ravens --action cycle > /dev/null 2>&1 &\n`;
                fs.writeFileSync(postCommitDest, postCommitContent);
                fs.chmodSync(postCommitDest, '755');
                console.log(chalk.green('    ◈ MUNINN: Daemonized (post-commit).'));
            } else {
                console.log(chalk.yellow('    [WARN] No .git directory found. Gatekeeper bypassed.'));
            }

            // 5. Bash Aliases
            const bashrcPath = path.join(userHome, '.bashrc');
            if (fs.existsSync(bashrcPath)) {
                const bashrcContent = fs.readFileSync(bashrcPath, 'utf8');
                if (!bashrcContent.includes('alias cstar=')) {
                    fs.appendFileSync(bashrcPath, `\nalias cstar='node ${path.join(PROJECT_ROOT, 'bin', 'cstar.js')}'\n`);
                    console.log(chalk.green("    ◈ SYS-ALIAS: 'cstar' registered."));
                }
            }

            console.log(chalk.cyan('◤ THE KERNEL IS ABSOLUTE. CSTAR OS IS NOW ACTIVE. ◢'));
        });

    osCmd
        .command('uninstall')
        .description('Disengage CStar OS hooks and restore standard user space')
        .action(() => {
            console.log(chalk.cyan('◤ INITIATING CSTAR OS UNINSTALLATION ◢'));
            const userHome = getHomeDir();

            console.log(chalk.dim('  ↳ Removing global OS Mandates from host user space...'));

            // 1. Claude
            const claudeDest = path.join(userHome, 'CLAUDE.md');
            if (fs.existsSync(claudeDest)) {
                fs.unlinkSync(claudeDest);
                console.log(chalk.yellow('    ◈ CLAUDE: Mandate removed.'));
            }

            // 2. Cursor
            const cursorDest = path.join(userHome, '.cursorrules');
            if (fs.existsSync(cursorDest)) {
                fs.unlinkSync(cursorDest);
                console.log(chalk.yellow('    ◈ CURSOR: Mandate removed.'));
            }

            // 3. Gemini
            const geminiDest = path.join(userHome, '.gemini', 'GEMINI.md');
            if (fs.existsSync(geminiDest)) {
                fs.unlinkSync(geminiDest);
                console.log(chalk.yellow('    ◈ GEMINI: Mandate removed.'));
            }

            console.log(chalk.dim('  ↳ Disengaging Kernel Gatekeeper...'));
            // 4. Git Hooks
            const gatekeeperDest = path.join(PROJECT_ROOT, '.git', 'hooks', 'pre-commit');
            if (fs.existsSync(gatekeeperDest)) {
                fs.unlinkSync(gatekeeperDest);
                console.log(chalk.yellow('    ◈ GATEKEEPER: Disarmed.'));
            }

            // 5. Bash Aliases
            const bashrcPath = path.join(userHome, '.bashrc');
            if (fs.existsSync(bashrcPath)) {
                let bashrcContent = fs.readFileSync(bashrcPath, 'utf8');
                if (bashrcContent.includes('alias cstar=')) {
                    const lines = bashrcContent.split('\n').filter(line => !line.startsWith('alias cstar='));
                    fs.writeFileSync(bashrcPath, lines.join('\n'));
                    console.log(chalk.yellow("    ◈ SYS-ALIAS: 'cstar' removed from ~/.bashrc."));
                }
            }

            console.log(chalk.cyan('◤ THE KERNEL IS DORMANT. USER SPACE RESTORED. ◢'));
        });
}
