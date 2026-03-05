import { Command } from 'commander';
import { parse, join } from 'node:path';
import fs from 'node:fs';
import { execa } from 'execa';

/**
 * [GUNGNIR] Dispatcher Spoke
 * Purpose: Handle dynamic workflow and skill discovery via Python Dispatcher.
 * @param program
 * @param PROJECT_ROOT
 */
export function registerDispatcher(program: Command, PROJECT_ROOT: string) {
    const discoverAll = (): Map<string, string> => {
        const commands = new Map<string, string>();
        
        // 1. Python Skills (.py)
        const scriptDirs = [
            join(PROJECT_ROOT, '.agent', 'skills'),
            join(PROJECT_ROOT, 'src', 'tools'),
            join(PROJECT_ROOT, 'src', 'skills', 'local'),
            join(PROJECT_ROOT, 'skills_db'),
            join(PROJECT_ROOT, 'src', 'sentinel'),
            join(PROJECT_ROOT, 'scripts'),
        ];

        scriptDirs.forEach(d => {
            if (fs.existsSync(d)) {
                fs.readdirSync(d).forEach(f => {
                    if (f.endsWith('.py') && !f.startsWith('_')) {
                        const name = parse(f).name;
                        commands.set(name.toLowerCase(), join(d, f));
                    }
                });
            }
        });

        // 2. Workflows (.md / .qmd)
        const workflowDir = join(PROJECT_ROOT, '.agent', 'workflows');
        if (fs.existsSync(workflowDir)) {
            fs.readdirSync(workflowDir).forEach(f => {
                if ((f.endsWith('.md') || f.endsWith('.qmd')) && !f.startsWith('_')) {
                    const name = parse(f).name;
                    commands.set(name.toLowerCase(), join(workflowDir, f));
                }
            });
        }

        return commands;
    };

    program.on('command:*', async (operands: string[]) => {
        const cmd = operands[0].toLowerCase();
        const allCmds = discoverAll();

        if (allCmds.has(cmd)) {
            try {
                const pythonPath = join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
                const dispatcherPath = join(PROJECT_ROOT, 'src', 'core', 'cstar_dispatcher.py');
                await execa(pythonPath, [dispatcherPath, ...process.argv.slice(2)], {
                    stdio: 'inherit',
                    env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
                });
            } catch (err) { }
        } else {
            console.error(`Unknown command '${cmd}'`);
            process.exit(1);
        }
    });
}
