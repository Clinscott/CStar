import fs from 'node:fs';
import path from 'node:path';

import type { ForgeExecutionArgs } from './forge_execute.js';

function commonAncestor(paths: string[]): string | null {
    if (paths.length === 0) return null;
    const splitPaths = paths.map((item) => path.resolve(item).split(path.sep));
    const common: string[] = [];
    for (let index = 0; index < splitPaths[0].length; index += 1) {
        if (!splitPaths.every((parts) => parts[index] === splitPaths[0][index])) break;
        common.push(splitPaths[0][index]);
    }
    return common.join(path.sep) || path.parse(paths[0]).root || null;
}

function findNearestGitRoot(start: string): string | null {
    let current = path.resolve(start);
    while (true) {
        if (fs.existsSync(path.join(current, '.git'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
    }
}

function isSharedTempGitRoot(candidate: string): boolean {
    const tempRoots = [process.env.TMPDIR, process.env.TEMP, process.env.TMP, '/tmp']
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => path.resolve(value));
    return tempRoots.includes(path.resolve(candidate));
}

function targetBaseDirectory(root: string, target: string): { base: string; gitRoot: string | null } {
    const absolute = path.isAbsolute(target) ? target : path.resolve(root, target);
    try {
        const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
        const base = stat?.isFile() ? path.dirname(absolute) : absolute;
        return { base, gitRoot: findNearestGitRoot(base) };
    } catch {
        const base = path.dirname(absolute);
        return { base, gitRoot: findNearestGitRoot(base) };
    }
}

export function inferForgeAdapterProjectRoot(args: ForgeExecutionArgs, root: string): string {
    const bases: string[] = [];
    const gitRoots = new Set<string>();
    for (const target of args.target_paths ?? []) {
        const { base, gitRoot } = targetBaseDirectory(root, target);
        bases.push(base);
        if (gitRoot && !isSharedTempGitRoot(gitRoot)) gitRoots.add(gitRoot);
    }
    if (gitRoots.size === 1) {
        const gitRoot = [...gitRoots][0];
        const allTargetsInsideGitRoot = bases.every((base) => {
            const relative = path.relative(gitRoot, base);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        });
        if (allTargetsInsideGitRoot) return gitRoot;
    }

    const commonBase = commonAncestor(bases);
    if (commonBase) return commonBase;

    for (const target of args.target_paths ?? []) {
        const absolute = path.isAbsolute(target) ? target : path.resolve(root, target);
        try {
            const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
            const gitRoot = findNearestGitRoot(stat?.isFile() ? path.dirname(absolute) : absolute);
            if (gitRoot && !isSharedTempGitRoot(gitRoot)) return gitRoot;
            if (stat?.isDirectory()) return absolute;
            if (stat?.isFile()) return path.dirname(absolute);
        } catch {
            // Continue to the next bounded target.
        }
    }
    return root;
}
