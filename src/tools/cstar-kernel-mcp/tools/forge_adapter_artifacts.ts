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

function removeStageOrThrow(stage: string): void {
    try {
        fs.unlinkSync(stage);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw new Error('forge_artifact_stage_cleanup_failed');
        }
    }
}

function writePrivateStage(stage: string, content: Buffer | string, mode: number): void {
    const flags = fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0);
    let fd: number | null = null;
    let complete = false;
    try {
        fd = fs.openSync(stage, flags, mode);
        if (typeof content === 'string') fs.writeFileSync(fd, content, 'utf-8');
        else fs.writeFileSync(fd, content);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        complete = true;
    } finally {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* Stage cleanup below is authoritative. */ }
        }
        if (!complete) removeStageOrThrow(stage);
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
    let renamed = false;
    try {
        writePrivateStage(temporary, content, mode);
        fs.renameSync(temporary, destination);
        renamed = true;
        assertSafePrivateArtifact(destination);
        fsyncDirectory(canonicalDirectory);
    } finally {
        if (!renamed) removeStageOrThrow(temporary);
    }
}

export function publishPrivateFileNoClobber(
    directory: string,
    destination: string,
    content: Buffer | string,
    mode = 0o600,
): void {
    const canonicalDirectory = assertSafeOwnedDirectory(directory);
    if (path.dirname(path.resolve(destination)) !== canonicalDirectory) {
        throw new Error(`forge_artifact_target_outside_directory:${destination}`);
    }
    if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
        throw new Error(`forge_artifact_target_already_exists:${destination}`);
    }
    const stage = path.join(
        canonicalDirectory,
        `.${path.basename(destination)}.cstar-publish-${randomBytes(12).toString('hex')}`,
    );
    let published = false;
    let failure: unknown = null;
    try {
        writePrivateStage(stage, content, mode);
        fs.linkSync(stage, destination);
        published = true;
        fs.unlinkSync(stage);
        assertSafePrivateArtifact(destination);
        fsyncDirectory(canonicalDirectory);
    } catch (error) {
        failure = error;
        if (published) {
            try {
                fs.unlinkSync(destination);
                fsyncDirectory(canonicalDirectory);
                published = false;
            } catch {
                throw new Error('forge_artifact_publication_rollback_failed');
            }
        }
        throw failure;
    } finally {
        removeStageOrThrow(stage);
    }
}

export function removePrivateFile(
    directory: string,
    destination: string,
): void {
    const canonicalDirectory = assertSafeOwnedDirectory(directory);
    if (path.dirname(path.resolve(destination)) !== canonicalDirectory) {
        throw new Error(`forge_artifact_target_outside_directory:${destination}`);
    }
    const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (!existing) return;
    assertSafePrivateArtifact(destination);
    fs.unlinkSync(destination);
    fsyncDirectory(canonicalDirectory);
}

export function quarantinePrivateEntryNoFollow(
    directory: string,
    destination: string,
): string | null {
    const canonicalDirectory = assertSafeOwnedDirectory(directory);
    if (path.dirname(path.resolve(destination)) !== canonicalDirectory) {
        throw new Error(`forge_artifact_target_outside_directory:${destination}`);
    }
    if (!fs.lstatSync(destination, { throwIfNoEntry: false })) return null;
    const quarantine = path.join(
        canonicalDirectory,
        `.cstar-quarantine-${randomBytes(12).toString('hex')}`,
    );
    fs.renameSync(destination, quarantine);
    if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
        throw new Error('forge_artifact_quarantine_failed');
    }
    fsyncDirectory(canonicalDirectory);
    return quarantine;
}
