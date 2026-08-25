import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
export const HUB_KERNEL_VERSION = '1.0.0';
export const MCP_ERROR_MESSAGE_MAX = 512;
export const MCP_PROPOSAL_MAX_BYTES = 512 * 1024;
export const MCP_SAFE_PROPOSAL_ID = /^[a-zA-Z0-9._-]+$/;
export const MCP_LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'mcp');
export const MCP_LOG_PATH = path.join(MCP_LOG_DIR, 'mcp_bootstrap_error.log');

export function isPathInside(child: string, parent: string): boolean {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) {
        return true;
    }
    const rel = path.relative(resolvedParent, resolvedChild);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function relativeInside(candidate: string, root: string): string | null {
    const relative = path.relative(root, candidate);
    if (relative === '') return '';
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return relative;
}

function rejectSymlinkSegments(root: string, relative: string): void {
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
            throw new Error(`path_symlink_forbidden:${current}`);
        }
    }
}

export function resolveExistingPathInside(
    root: string,
    candidate: string,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    const lexicalRoot = path.resolve(root);
    const lexicalCandidate = path.resolve(candidate);
    const relative = relativeInside(lexicalCandidate, lexicalRoot);
    if (relative === null) throw new Error(`path_outside_root:${candidate}`);
    const canonicalRoot = fs.realpathSync(lexicalRoot);
    const rootedCandidate = path.join(canonicalRoot, relative);
    rejectSymlinkSegments(canonicalRoot, relative);
    const canonicalCandidate = fs.realpathSync(rootedCandidate);
    if (relativeInside(canonicalCandidate, canonicalRoot) === null) {
        throw new Error(`path_outside_root:${candidate}`);
    }
    const stat = fs.lstatSync(canonicalCandidate);
    if (stat.isSymbolicLink()) throw new Error(`path_symlink_forbidden:${candidate}`);
    if (kind === 'file' && !stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
    if (kind === 'directory' && !stat.isDirectory()) throw new Error(`path_not_directory:${candidate}`);
    return canonicalCandidate;
}

export function resolveExistingRelativePathInside(
    root: string,
    relativePath: string,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    return resolveProspectiveRelativePathInside(root, relativePath, true, kind);
}

export function resolveProspectiveRelativePathInside(
    root: string,
    relativePath: string,
    mustExist = false,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    if (!relativePath || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
        throw new Error(`path_must_be_safe_relative:${relativePath}`);
    }
    const normalized = path.normalize(relativePath);
    if (normalized === '.' || relativeInside(path.resolve(root, normalized), path.resolve(root)) === null) {
        throw new Error(`path_must_be_safe_relative:${relativePath}`);
    }
    const canonicalRoot = fs.realpathSync(path.resolve(root));
    const segments = normalized.split(path.sep).filter(Boolean);
    let current = canonicalRoot;
    let missing = false;
    for (const segment of segments) {
        current = path.join(current, segment);
        if (missing || !fs.existsSync(current)) {
            missing = true;
            continue;
        }
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`path_symlink_forbidden:${relativePath}`);
    }
    if (mustExist && missing) throw new Error(`path_not_found:${relativePath}`);
    if (mustExist) return resolveExistingPathInside(canonicalRoot, current, kind);
    if (relativeInside(current, canonicalRoot) === null) throw new Error(`path_outside_root:${relativePath}`);
    return current;
}

export function readBoundedUtf8FileInside(
    root: string,
    candidate: string,
    maxBytes: number,
): { path: string; content: string; size: number; mtimeMs: number } {
    const resolved = resolveExistingPathInside(root, candidate, 'file');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(resolved, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
        if (stat.nlink !== 1) throw new Error(`path_hardlink_forbidden:${candidate}`);
        if (stat.size > maxBytes) throw new Error(`path_size_limit_exceeded:${stat.size}:${maxBytes}`);
        return {
            path: resolved,
            content: fs.readFileSync(fd, 'utf-8'),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
        };
    } finally {
        fs.closeSync(fd);
    }
}

export function readBoundedFileInside(
    root: string,
    candidate: string,
    maxBytes: number,
): { path: string; content: Buffer; size: number; mtimeMs: number } {
    const resolved = resolveExistingPathInside(root, candidate, 'file');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(resolved, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
        if (stat.nlink !== 1) throw new Error(`path_hardlink_forbidden:${candidate}`);
        if (stat.size > maxBytes) throw new Error(`path_size_limit_exceeded:${stat.size}:${maxBytes}`);
        return {
            path: resolved,
            content: fs.readFileSync(fd),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
        };
    } finally {
        fs.closeSync(fd);
    }
}

export function logBootstrapError(error: unknown): void {
    try {
        fs.mkdirSync(MCP_LOG_DIR, { recursive: true });
        const stack = error instanceof Error ? error.stack ?? error.message : String(error);
        fs.appendFileSync(MCP_LOG_PATH, `[${new Date().toISOString()}] ${stack}\n`, 'utf-8');
    } catch {
        // Diagnostics must never break the MCP surface.
    }
}
