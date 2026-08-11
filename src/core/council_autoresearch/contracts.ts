import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export * from './contract_schema.js';
import {
    MAX_JSON_FILE_BYTES,
    MAX_REGULAR_FILE_BYTES,
    fail,
    sha256,
    type Sha256,
} from './contract_schema.js';

function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function immutableTemporaryPattern(target: string): RegExp {
    const escaped = path.basename(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\.tmp-[0-9]+-[a-f0-9-]{36}$`);
}

/**
 * The target link is the commit point for an immutable write. A crash after that
 * link is synced but before the temporary link is removed leaves one exact,
 * runner-shaped alias. Repair only that fully accounted-for two-link state.
 */
export function repairInterruptedImmutableWrite(file: string): void {
    const target = path.resolve(file);
    let targetStat: fs.BigIntStats;
    try {
        targetStat = fs.lstatSync(target, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    if (targetStat.isSymbolicLink() || !targetStat.isFile() || targetStat.nlink === 1n) return;
    if (targetStat.nlink !== 2n) {
        fail(`immutable target has unexplained hard links: ${target}`);
    }

    const directory = path.dirname(target);
    const pattern = immutableTemporaryPattern(target);
    const aliases = fs.readdirSync(directory)
        .filter((name) => pattern.test(name))
        .map((name) => path.join(directory, name))
        .filter((candidate) => {
            const stat = fs.lstatSync(candidate, { bigint: true });
            return !stat.isSymbolicLink() && stat.isFile() && sameInode(stat, targetStat);
        });
    if (aliases.length !== 1) {
        fail(`immutable target has unexplained hard links: ${target}`);
    }

    const alias = aliases[0];
    const currentTarget = fs.lstatSync(target, { bigint: true });
    const currentAlias = fs.lstatSync(alias, { bigint: true });
    if (!sameInode(currentTarget, targetStat) || currentTarget.nlink !== 2n
        || !sameInode(currentAlias, targetStat) || currentAlias.nlink !== 2n) {
        fail(`immutable temporary alias changed during recovery: ${alias}`);
    }
    fs.unlinkSync(alias);
    fsyncDirectory(directory);

    const repaired = fs.lstatSync(target, { bigint: true });
    if (!sameInode(repaired, targetStat) || repaired.nlink !== 1n) {
        fail(`immutable target could not be repaired safely: ${target}`);
    }
}

export function assertCouncilRuntimePlatform(platform: NodeJS.Platform = process.platform): void {
    if (platform === 'win32') fail('council-autoresearch currently requires a POSIX runtime');
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        fail('council-autoresearch requires O_NOFOLLOW support');
    }
}

function assertReadByteLimit(maxBytes: number, ceiling: number, label: string): void {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > ceiling) {
        fail(`${label} must be a safe integer from zero to ${ceiling} bytes`);
    }
}

export function snapshotRegularFileNoFollow(
    file: string,
    label = 'file',
    maxBytes = MAX_REGULAR_FILE_BYTES,
): { content: Buffer; mode: number } {
    assertCouncilRuntimePlatform();
    assertReadByteLimit(maxBytes, MAX_REGULAR_FILE_BYTES, `${label} read limit`);
    const noFollow = fs.constants.O_NOFOLLOW;
    let descriptor: number;
    try {
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
    } catch (error) {
        fail(`${label} could not be opened without following links: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n) fail(`${label} must be a single-link regular file`);
        if (before.size > BigInt(maxBytes)) fail(`${label} exceeds the ${maxBytes}-byte read limit`);
        const expectedBytes = Number(before.size);
        const content = Buffer.allocUnsafe(expectedBytes);
        let offset = 0;
        while (offset < expectedBytes) {
            const bytesRead = fs.readSync(descriptor, content, offset, expectedBytes - offset, offset);
            if (bytesRead === 0) break;
            offset += bytesRead;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (before[key] !== after[key]) fail(`${label} changed while it was being read`);
        }
        if (offset !== expectedBytes) fail(`${label} changed while it was being read`);
        let linked: fs.BigIntStats;
        try {
            linked = fs.lstatSync(file, { bigint: true });
        } catch {
            fail(`${label} path changed while it was being read`);
        }
        if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n
            || !sameInode(linked, after)) {
            fail(`${label} path changed while it was being read`);
        }
        for (const key of ['mode', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (linked[key] !== after[key]) fail(`${label} path changed while it was being read`);
        }
        return { content, mode: Number(before.mode) & 0o777 };
    } finally {
        fs.closeSync(descriptor);
    }
}

export function readRegularFileNoFollow(
    file: string,
    label = 'file',
    maxBytes = MAX_REGULAR_FILE_BYTES,
): Buffer {
    return snapshotRegularFileNoFollow(file, label, maxBytes).content;
}

export function sha256File(file: string, maxBytes = MAX_REGULAR_FILE_BYTES): Sha256 {
    return sha256(readRegularFileNoFollow(file, file, maxBytes));
}

export function readJson<T>(file: string, maxBytes = MAX_JSON_FILE_BYTES): T {
    assertReadByteLimit(maxBytes, MAX_JSON_FILE_BYTES, 'JSON read limit');
    try {
        return JSON.parse(readRegularFileNoFollow(file, file, maxBytes).toString('utf8')) as T;
    } catch (error) {
        fail(`could not read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function resolveContained(root: string, input: string, label = 'path'): string {
    if (!input || input.includes('\0') || path.isAbsolute(input)) fail(`${label} must be a relative path`);
    const base = fs.realpathSync(root);
    const resolved = path.resolve(base, input);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) fail(`${label} escapes its root`);
    return resolved;
}

export function fsyncDirectory(directory: string): void {
    assertCouncilRuntimePlatform();
    const descriptor = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
}

export function canonicalPrivateDirectory(
    directory: string,
    label: string,
    create = false,
): string {
    assertCouncilRuntimePlatform();
    const target = validateDirectoryCreationTarget(directory, label);
    if (create) ensureDirectoryNoFollow(target);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) {
        fail(`${label} must be a private real directory`);
    }
    if (process.getuid && stat.uid !== process.getuid()) fail(`${label} must be owned by the runner user`);
    const real = fs.realpathSync(target);
    if (real !== target) fail(`${label} must not contain symbolic-link segments`);
    return real;
}

export function validateDirectoryCreationTarget(directory: string, label: string): string {
    assertCouncilRuntimePlatform();
    const target = path.resolve(directory);
    let ancestor = target;
    while (true) {
        try {
            const stat = fs.lstatSync(ancestor);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                fail(`${label} nearest existing ancestor must be a real directory`);
            }
            if (fs.realpathSync(ancestor) !== ancestor) {
                fail(`${label} nearest existing ancestor must not contain symbolic-link segments`);
            }
            return target;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const parent = path.dirname(ancestor);
            if (parent === ancestor) fail(`${label} has no existing directory ancestor`);
            ancestor = parent;
        }
    }
}

export function ensureDirectoryNoFollow(directory: string): string {
    const target = path.resolve(directory);
    const parent = path.dirname(target);
    if (parent !== target) ensureDirectoryNoFollow(parent);
    let created = false;
    try {
        fs.mkdirSync(target, { mode: 0o700 });
        created = true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`receipt directory is not a real directory: ${target}`);
    if (created && parent !== target) {
        fsyncDirectory(parent);
        fsyncDirectory(target);
    }
    return fs.realpathSync(target);
}

function existingImmutableState(target: string): { digest: Sha256; mode: number } | undefined {
    try {
        repairInterruptedImmutableWrite(target);
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
            fail(`immutable receipt target is not a single-link regular file: ${target}`);
        }
        const snapshot = snapshotRegularFileNoFollow(target, target);
        return { digest: sha256(snapshot.content), mode: snapshot.mode };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

export function writeImmutableFile(
    file: string,
    content: Buffer,
    mode = 0o600,
): { sha256: Sha256; created: boolean } {
    const target = path.resolve(file);
    const directory = path.dirname(target);
    ensureDirectoryNoFollow(directory);
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
        fail('immutable file mode is invalid');
    }
    const digest = sha256(content);
    const existing = existingImmutableState(target);
    if (existing !== undefined) {
        if (existing.digest !== digest || existing.mode !== mode) {
            fail(`immutable receipt conflicts at ${target}`);
        }
        return { sha256: digest, created: false };
    }
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    let temporaryIdentity: fs.BigIntStats | undefined;
    let committed = false;
    let created = true;
    try {
        fs.writeFileSync(descriptor, content);
        fs.fchmodSync(descriptor, mode);
        fs.fsyncSync(descriptor);
        temporaryIdentity = fs.fstatSync(descriptor, { bigint: true });
        if (!temporaryIdentity.isFile() || temporaryIdentity.nlink !== 1n
            || temporaryIdentity.size !== BigInt(content.length)
            || (Number(temporaryIdentity.mode) & 0o777) !== mode) {
            fail(`immutable temporary file changed before commit: ${temporary}`);
        }
        fs.linkSync(temporary, target);
        fsyncDirectory(directory);
        const linkedTarget = fs.lstatSync(target, { bigint: true });
        const linkedTemporary = fs.fstatSync(descriptor, { bigint: true });
        if (linkedTarget.isSymbolicLink() || !linkedTarget.isFile()
            || !sameInode(linkedTarget, temporaryIdentity)
            || !sameInode(linkedTemporary, temporaryIdentity)
            || linkedTarget.nlink !== 2n || linkedTemporary.nlink !== 2n
            || linkedTarget.size !== BigInt(content.length)
            || (Number(linkedTarget.mode) & 0o777) !== mode) {
            fail(`immutable receipt target changed during commit: ${target}`);
        }
        committed = true;
    } catch (error) {
        const winner = (error as NodeJS.ErrnoException).code === 'EEXIST'
            ? existingImmutableState(target)
            : undefined;
        if (!winner || winner.digest !== digest || winner.mode !== mode) throw error;
        committed = true;
        created = false;
    } finally {
        fs.closeSync(descriptor);
        try {
            const currentTemporary = fs.lstatSync(temporary, { bigint: true });
            if (!temporaryIdentity || currentTemporary.isSymbolicLink()
                || !currentTemporary.isFile()
                || !sameInode(currentTemporary, temporaryIdentity)) {
                fail(`immutable temporary path changed during cleanup: ${temporary}`);
            }
            fs.unlinkSync(temporary);
            fsyncDirectory(directory);
        } catch (error) {
            if (!committed || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            // The target link is the commit point. A later immutable replay repairs
            // the one exact same-inode temporary alias left by an interrupted cleanup.
        }
    }
    if (created) {
        const finalTarget = fs.lstatSync(target, { bigint: true });
        if (!temporaryIdentity || finalTarget.isSymbolicLink() || !finalTarget.isFile()
            || !sameInode(finalTarget, temporaryIdentity) || finalTarget.nlink !== 1n) {
            fail(`immutable receipt target changed after commit: ${target}`);
        }
    }
    return { sha256: digest, created };
}

export function writeImmutableJson(file: string, value: unknown): { sha256: Sha256; created: boolean } {
    return writeImmutableFile(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}
