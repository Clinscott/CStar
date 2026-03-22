import type { OperatorSession, WeaveInvocation, WorkspaceTarget } from  './contracts.js';

export type WorkspaceRootSource = string | (() => string);

export function resolveWorkspaceRoot(source: WorkspaceRootSource): string {
    return typeof source === 'function' ? source() : source;
}

export function buildCliSession(): OperatorSession {
    return {
        mode: 'cli',
        interactive: true,
    };
}

export function buildBrainTarget(workspaceRoot: string, requestedPath: string = workspaceRoot): WorkspaceTarget {
    return {
        domain: 'brain',
        workspace_root: workspaceRoot,
        requested_path: requestedPath,
    };
}

export function buildSpokeTarget(
    workspaceRoot: string,
    spoke: string,
    requestedPath: string = `spoke://${spoke}/`,
): WorkspaceTarget {
    return {
        domain: 'spoke',
        workspace_root: workspaceRoot,
        requested_path: requestedPath,
        spoke,
    };
}

export function withCliWorkspaceTarget<T>(
    invocation: WeaveInvocation<T>,
    workspaceRoot: string,
    requestedPath: string = workspaceRoot,
): WeaveInvocation<T> {
    return {
        ...invocation,
        target: buildBrainTarget(workspaceRoot, requestedPath),
        session: buildCliSession(),
    };
}
