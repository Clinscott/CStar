import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function forgeExecutionPathSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'forge-execution';
}

export function assertSafeOwnedDirectory(directory: string): string {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`forge_artifact_directory_unsafe_type:${directory}`);
    }
    if (typeof process.getuid !== 'function' || stat.uid !== process.getuid()) {
        throw new Error(`forge_artifact_directory_wrong_owner:${directory}`);
    }
    if ((stat.mode & 0o022) !== 0) {
        throw new Error(`forge_artifact_directory_group_or_world_writable:${directory}`);
    }
    return fs.realpathSync(directory);
}

export function ensureSafeDirectoryTree(base: string, target: string): string {
    const canonicalBase = assertSafeOwnedDirectory(base);
    const lexicalTarget = path.resolve(target);
    const relative = path.relative(canonicalBase, lexicalTarget);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`forge_artifact_directory_outside_root:${target}`);
    }
    let current = canonicalBase;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        try {
            fs.mkdirSync(current, { mode: 0o700 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        current = assertSafeOwnedDirectory(current);
    }
    return current;
}

function fsyncDirectory(directory: string): void {
    const fd = fs.openSync(directory, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

export function assertSafePrivateArtifact(pathname: string): void {
    const stat = fs.lstatSync(pathname);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
        throw new Error(`forge_artifact_target_unsafe_type:${pathname}`);
    }
    if (typeof process.getuid !== 'function' || stat.uid !== process.getuid()) {
        throw new Error(`forge_artifact_target_wrong_owner:${pathname}`);
    }
    if ((stat.mode & 0o022) !== 0) {
        throw new Error(`forge_artifact_target_group_or_world_writable:${pathname}`);
    }
}

export function atomicWritePrivateFile(
    directory: string,
    destination: string,
    content: Buffer | string,
    allowReplace: boolean,
    mode = 0o600,
): void {
    const canonicalDirectory = assertSafeOwnedDirectory(directory);
    if (path.dirname(path.resolve(destination)) !== canonicalDirectory) {
        throw new Error(`forge_artifact_target_outside_directory:${destination}`);
    }
    if (fs.existsSync(destination) || fs.lstatSync(destination, { throwIfNoEntry: false })) {
        if (!allowReplace) throw new Error(`forge_artifact_target_already_exists:${destination}`);
        assertSafePrivateArtifact(destination);
    }
    const temporary = path.join(
        canonicalDirectory,
        `.${path.basename(destination)}.cstar-${randomBytes(12).toString('hex')}`,
    );
    const flags = fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(temporary, flags, mode);
    try {
        if (typeof content === 'string') fs.writeFileSync(fd, content, 'utf-8');
        else fs.writeFileSync(fd, content);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    try {
        fs.renameSync(temporary, destination);
        assertSafePrivateArtifact(destination);
        fsyncDirectory(canonicalDirectory);
    } finally {
        try { fs.unlinkSync(temporary); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
}
