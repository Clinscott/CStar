import fs from 'node:fs';
import { join } from 'node:path';
import { getPythonPath } from  '../../python_utils.js';

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
    void projectRoot;
    return new Map();
}
