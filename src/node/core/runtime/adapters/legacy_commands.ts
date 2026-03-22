import fs from 'node:fs';
import { join, parse } from 'node:path';
import { getPythonPath } from '../../python_utils.ts';

export const deps = {
    fs,
    getPythonPath,
};

export function resolvePythonPath(projectRoot: string): string {
    const winPath = join(projectRoot, '.venv', 'Scripts', 'python.exe');
    if (deps.fs.existsSync(winPath)) {
        return winPath;
    }

    const unixPath = join(projectRoot, '.venv', 'bin', 'python');
    if (deps.fs.existsSync(unixPath)) {
        return unixPath;
    }

    return deps.getPythonPath();
}

export function loadSkillRegistryManifest(projectRoot: string): Map<string, string> {
    const manifestPath = join(projectRoot, '.agents', 'skill_registry.json');
    if (!deps.fs.existsSync(manifestPath)) {
        return new Map();
    }

    try {
        const manifest = JSON.parse(deps.fs.readFileSync(manifestPath, 'utf-8')) as {
            skills?: Record<string, { entrypoint_path?: string }>;
        };
        const commands = new Map<string, string>();
        for (const [trigger, entry] of Object.entries(manifest.skills ?? {})) {
            if (!entry.entrypoint_path) {
                continue;
            }
            commands.set(trigger.toLowerCase(), join(projectRoot, entry.entrypoint_path));
        }
        return commands;
    } catch {
        return new Map();
    }
}

export function discoverLegacyCommands(projectRoot: string): Map<string, string> {
    const commands = loadSkillRegistryManifest(projectRoot);
    const scriptDirs = [
        join(projectRoot, '.agents', 'skills'),
        join(projectRoot, 'src', 'tools'),
        join(projectRoot, 'src', 'skills', 'local'),
        join(projectRoot, 'skills_db'),
        join(projectRoot, 'src', 'sentinel'),
        join(projectRoot, 'scripts'),
    ];

    for (const dir of scriptDirs) {
        if (!deps.fs.existsSync(dir)) {
            continue;
        }

        const entries = deps.fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.py') && !entry.name.startsWith('_')) {
                const key = parse(entry.name).name.toLowerCase();
                if (!commands.has(key)) {
                    commands.set(key, join(dir, entry.name));
                }
                continue;
            }

            if (!entry.isDirectory() || entry.name.startsWith('.')) {
                continue;
            }

            const scriptsDir = join(dir, entry.name, 'scripts');
            const mainScript = join(scriptsDir, `${entry.name}.py`);
            const altScript = join(dir, entry.name, `${entry.name}.py`);

            if (deps.fs.existsSync(mainScript)) {
                if (!commands.has(entry.name.toLowerCase())) {
                    commands.set(entry.name.toLowerCase(), mainScript);
                }
            } else if (deps.fs.existsSync(altScript)) {
                if (!commands.has(entry.name.toLowerCase())) {
                    commands.set(entry.name.toLowerCase(), altScript);
                }
            }
        }
    }

    const workflowDir = join(projectRoot, '.agents', 'workflows');
    if (deps.fs.existsSync(workflowDir)) {
        for (const file of deps.fs.readdirSync(workflowDir) as string[]) {
            if ((file.endsWith('.md') || file.endsWith('.qmd')) && !file.startsWith('_')) {
                const key = parse(file).name.toLowerCase();
                if (!commands.has(key)) {
                    commands.set(key, join(workflowDir, file));
                }
            }
        }
    }

    return commands;
}
