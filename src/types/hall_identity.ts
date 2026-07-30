export function normalizeHallPath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function buildHallCoordinationThreadId(scope: {
    repoId?: string;
    beadId?: string;
    sessionId?: string;
    traceId?: string;
    targetPath?: string;
}): string {
    if (scope.beadId?.trim()) return `bead:${scope.beadId.trim()}`;
    if (scope.sessionId?.trim()) return `session:${scope.sessionId.trim()}`;
    if (scope.traceId?.trim()) return `trace:${scope.traceId.trim()}`;
    if (scope.targetPath?.trim()) return `target:${normalizeHallPath(scope.targetPath.trim())}`;
    if (scope.repoId?.trim()) return `repo:${scope.repoId.trim()}:coordination`;
    return 'repo:unknown:coordination';
}

export function buildHallRepositoryId(rootPath: string): string {
    return `repo:${normalizeHallPath(rootPath)}`;
}
