import fs from 'node:fs';
import path from 'node:path';

type FileIdentity = Pick<fs.Stats, 'dev' | 'ino' | 'size' | 'mtimeMs'>;

function relativeInside(candidate: string, root: string): string | null {
    const relative = path.relative(root, candidate);
    if (relative === '') return '';
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return null;
    }
    return relative;
}

function existingStat(candidate: string): fs.Stats | null {
    return fs.lstatSync(candidate, { throwIfNoEntry: false }) ?? null;
}

function resolveCanonicalDirectory(root: string): string {
    const lexicalRoot = path.resolve(root);
    const stat = existingStat(lexicalRoot);
    if (!stat) throw new Error('bounded_file_root_missing');
    if (stat.isSymbolicLink()) throw new Error('bounded_file_root_symlink_forbidden');
    if (!stat.isDirectory()) throw new Error('bounded_file_root_not_directory');
    const canonicalRoot = fs.realpathSync(lexicalRoot);
    if (canonicalRoot !== lexicalRoot) {
        throw new Error('bounded_file_root_not_canonical');
    }
    return canonicalRoot;
}

export function resolveSafeRelativeFileInside(
    root: string,
    relativePath: string,
): string | null {
    if (!relativePath || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
        throw new Error('bounded_file_path_must_be_relative');
    }
    const canonicalRoot = resolveCanonicalDirectory(root);
    const normalized = path.normalize(relativePath);
    const candidate = path.resolve(canonicalRoot, normalized);
    const relative = relativeInside(candidate, canonicalRoot);
    if (relative === null || relative === '') {
        throw new Error('bounded_file_path_outside_root');
    }

    let current = canonicalRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = existingStat(current);
        if (!stat) return null;
        if (stat.isSymbolicLink()) throw new Error('bounded_file_symlink_forbidden');
    }

    const stat = existingStat(candidate);
    if (!stat) return null;
    if (!stat.isFile()) throw new Error('bounded_file_not_regular_file');
    if (stat.nlink !== 1) throw new Error('bounded_file_hardlink_forbidden');
    if (fs.realpathSync(candidate) !== candidate) {
        throw new Error('bounded_file_path_not_canonical');
    }
    return candidate;
}

export function readBoundedUtf8RelativeFile(
    root: string,
    relativePath: string,
    maxBytes: number,
): { path: string; content: string; identity: FileIdentity } | null {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new Error('bounded_file_invalid_size_limit');
    }
    const candidate = resolveSafeRelativeFileInside(root, relativePath);
    if (!candidate) return null;

    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(candidate, flags);
    try {
        const before = fs.fstatSync(fd);
        if (!before.isFile()) throw new Error('bounded_file_not_regular_file');
        if (before.nlink !== 1) throw new Error('bounded_file_hardlink_forbidden');
        if (before.size > maxBytes) {
            throw new Error(`bounded_file_size_limit_exceeded:${before.size}:${maxBytes}`);
        }
        const content = fs.readFileSync(fd, 'utf8');
        const after = fs.fstatSync(fd);
        if (
            before.dev !== after.dev
            || before.ino !== after.ino
            || before.size !== after.size
            || before.mtimeMs !== after.mtimeMs
        ) {
            throw new Error('bounded_file_identity_changed');
        }
        return {
            path: candidate,
            content,
            identity: {
                dev: after.dev,
                ino: after.ino,
                size: after.size,
                mtimeMs: after.mtimeMs,
            },
        };
    } finally {
        fs.closeSync(fd);
    }
}

export function readBoundedJsonObject<T extends object>(
    root: string,
    relativePath: string,
    maxBytes: number,
): T | null {
    const file = readBoundedUtf8RelativeFile(root, relativePath, maxBytes);
    if (!file) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(file.content);
    } catch {
        throw new Error('bounded_json_invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('bounded_json_root_must_be_object');
    }
    return parsed as T;
}
