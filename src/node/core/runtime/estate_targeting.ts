import { database } from '../../../tools/pennyone/intel/database.ts';
import { registry } from '../../../tools/pennyone/pathRegistry.ts';
import type { TargetDomain, WorkspaceTarget } from './contracts.ts';

export interface ResolvedEstateTarget {
    workspaceRoot: string;
    targetDomain: TargetDomain;
    requestedRoot?: string;
    spokeName?: string;
    spokeRoot?: string;
}

export function resolveEstateTarget(target?: WorkspaceTarget): ResolvedEstateTarget {
    const requestedWorkspace = target?.workspace_root ? registry.normalize(target.workspace_root) : registry.getRoot();
    const targetDomain = target?.domain ?? 'brain';

    if (!target || targetDomain === 'brain' || targetDomain === 'estate' || targetDomain === 'external') {
        return {
            workspaceRoot: requestedWorkspace,
            targetDomain,
            requestedRoot: target?.requested_path,
        };
    }

    if (target.spoke) {
        if (target.workspace_root && !(target.requested_path && registry.isSpokeUri(target.requested_path))) {
            return {
                workspaceRoot: registry.normalize(target.workspace_root),
                targetDomain,
                requestedRoot: target.requested_path,
                spokeName: target.spoke,
                spokeRoot: registry.normalize(target.workspace_root),
            };
        }

        const mounted = database.getHallMountedSpoke(target.spoke, registry.getRoot());
        if (!mounted) {
            throw new Error(`Mounted spoke '${target.spoke}' is not registered in the Hall estate.`);
        }

        return {
            workspaceRoot: mounted.root_path,
            targetDomain,
            requestedRoot: target.requested_path ?? `spoke://${mounted.slug}/`,
            spokeName: mounted.slug,
            spokeRoot: mounted.root_path,
        };
    }

    if (target.requested_path && registry.isSpokeUri(target.requested_path)) {
        const mountedSpokes = database.listHallMountedSpokes(registry.getRoot());
        const { slug } = registry.parseSpokeUri(target.requested_path);
        const mounted = mountedSpokes.find((entry) => entry.slug.toLowerCase() === slug);
        if (!mounted) {
            throw new Error(`Mounted spoke '${slug}' is not registered in the Hall estate.`);
        }

        registry.resolveEstatePath(target.requested_path, mountedSpokes);
        return {
            workspaceRoot: mounted.root_path,
            targetDomain,
            requestedRoot: target.requested_path,
            spokeName: mounted.slug,
            spokeRoot: mounted.root_path,
        };
    }

    return {
        workspaceRoot: requestedWorkspace,
        targetDomain,
        requestedRoot: target.requested_path,
        spokeName: target.spoke,
        spokeRoot: target.workspace_root ? registry.normalize(target.workspace_root) : undefined,
    };
}
