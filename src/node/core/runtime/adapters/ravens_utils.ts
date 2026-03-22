import { isAbsolute, resolve } from 'node:path';
import { listHallMountedSpokes } from  '../../../../tools/pennyone/intel/database.js';
import { registry } from  '../../../../tools/pennyone/pathRegistry.js';

export const deps = {
    listHallMountedSpokes,
    registry,
};

export interface RavensSweepTarget {
    slug: string;
    domain: 'brain' | 'spoke';
    repo_root: string;
    requested_path: string;
}

export function normalizeRepoRoot(repoRoot: string): string {
    return resolve(repoRoot).replace(/\\/g, '/');
}

export function loadRavensSweepTargets(projectRoot: string, requestedSpoke?: string): RavensSweepTarget[] {
    const brainRoot = normalizeRepoRoot(projectRoot);
    const brainTarget: RavensSweepTarget = {
        slug: 'brain',
        domain: 'brain',
        repo_root: brainRoot,
        requested_path: brainRoot,
    };

    const mountedTargets = deps.listHallMountedSpokes(projectRoot)
        .filter((entry) => entry.mount_status === 'active')
        .map((entry) => ({
            slug: entry.slug,
            domain: 'spoke' as const,
            repo_root: normalizeRepoRoot(entry.root_path),
            requested_path: `spoke://${entry.slug}/`,
        }));

    const targets = [brainTarget, ...mountedTargets];
    if (!requestedSpoke) {
        return targets;
    }

    const requested = requestedSpoke.toLowerCase();
    return targets.filter((entry) => entry.slug === requested);
}

export function resolveTargetPath(projectRoot: string, targetPath: string | undefined): string {
    if (!targetPath || targetPath === '.') {
        return projectRoot;
    }

    if (deps.registry.isSpokeUri(targetPath)) {
        return deps.registry.resolveEstatePath(targetPath, deps.listHallMountedSpokes(deps.registry.getRoot()));
    }

    return isAbsolute(targetPath) ? targetPath : resolve(projectRoot, targetPath);
}
