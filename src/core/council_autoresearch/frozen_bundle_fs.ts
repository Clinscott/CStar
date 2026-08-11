import fs from 'node:fs';
import path from 'node:path';

import {
    ARTIFACT_MANIFEST_MAX_DEPTH,
    ARTIFACT_MANIFEST_MAX_FILE_BYTES,
} from './artifact_manifest.js';
import {
    canonicalPrivateDirectory,
    fail,
    validateDirectoryCreationTarget,
} from './contracts.js';

export interface ContainedFrozenSnapshot {
    content: Buffer;
    mode: 0o644 | 0o755;
    rawMode: number;
}

export interface FrozenDirectoryIdentity {
    path: string;
    dev: bigint;
    ino: bigint;
    mode: bigint;
    nlink: bigint;
    uid: bigint;
    gid: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
}

export function compareFrozenPaths(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function canonicalFrozenPath(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value || value.includes('\0')
        || value.includes('\\') || path.posix.isAbsolute(value)
        || Buffer.byteLength(value, 'utf8') > 4096) {
        fail(`${label} must be a bounded canonical relative path`);
    }
    const segments = value.split('/');
    if (segments.length > ARTIFACT_MANIFEST_MAX_DEPTH
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(`${label} must be a bounded canonical relative path`);
    }
    return value;
}

export function canonicalFrozenDirectory(input: string, label: string): string {
    const target = path.resolve(input);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(target) !== target) {
        fail(`${label} must be a real canonical directory`);
    }
    return target;
}

export function frozenTarget(root: string, relative: string, label: string): string {
    const canonical = canonicalFrozenPath(relative, label);
    const target = path.resolve(root, ...canonical.split('/'));
    if (!target.startsWith(`${root}${path.sep}`)) fail(`${label} escapes its root`);
    return target;
}

function captureDirectory(
    directory: string,
    label: string,
    requirePrivate: boolean,
): FrozenDirectoryIdentity {
    const stat = fs.lstatSync(directory, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory
        || (requirePrivate && ((stat.mode & 0o077n) !== 0n
            || (process.getuid && stat.uid !== BigInt(process.getuid()))))) {
        fail(`${label} must be a ${requirePrivate ? 'private runner-owned ' : ''}real directory`);
    }
    return {
        path: directory,
        dev: stat.dev,
        ino: stat.ino,
        mode: stat.mode,
        nlink: stat.nlink,
        uid: stat.uid,
        gid: stat.gid,
        size: stat.size,
        mtimeNs: stat.mtimeNs,
        ctimeNs: stat.ctimeNs,
    };
}

function directoryChain(root: string, target: string, label: string): FrozenDirectoryIdentity[] {
    const parent = path.dirname(target);
    const relative = path.relative(root, parent);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${label} escapes its root`);
    const directories = [root];
    let current = root;
    for (const segment of relative ? relative.split(path.sep) : []) {
        current = path.join(current, segment);
        directories.push(current);
    }
    return directories.map((directory) => captureDirectory(directory, `${label} parent`, false));
}

export function assertFrozenDirectoriesUnchanged(
    before: FrozenDirectoryIdentity[],
    after: FrozenDirectoryIdentity[],
    label: string,
): void {
    if (before.length !== after.length) fail(`${label} changed while it was read`);
    for (let index = 0; index < before.length; index += 1) {
        for (const key of [
            'path', 'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
        ] as const) {
            if (before[index][key] !== after[index][key]) fail(`${label} changed while it was read`);
        }
    }
}

export function snapshotContainedFrozenFile(
    rootInput: string,
    relative: string,
    label: string,
    maxBytes = ARTIFACT_MANIFEST_MAX_FILE_BYTES,
    expectedLinks: 1 | 2 = 1,
): ContainedFrozenSnapshot {
    const root = canonicalFrozenDirectory(rootInput, `${label} root`);
    const target = frozenTarget(root, relative, label);
    const before = directoryChain(root, target, label);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0
        || maxBytes > ARTIFACT_MANIFEST_MAX_FILE_BYTES) {
        fail(`${label} read limit is invalid`);
    }
    if (typeof fs.constants.O_NOFOLLOW !== 'number'
        || typeof fs.constants.O_NONBLOCK !== 'number') {
        fail('frozen bundle staging requires O_NOFOLLOW and O_NONBLOCK support');
    }
    let descriptor: number;
    try {
        descriptor = fs.openSync(
            target,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
        );
    } catch (error) {
        fail(`${label} could not be opened safely: ${error instanceof Error ? error.message : String(error)}`);
    }
    let content: Buffer;
    let rawMode: number;
    try {
        const initial = fs.fstatSync(descriptor, { bigint: true });
        if (!initial.isFile() || initial.nlink !== BigInt(expectedLinks)) {
            fail(`${label} must be an exact ${expectedLinks}-link regular file`);
        }
        if (initial.size > BigInt(maxBytes)) fail(`${label} exceeds the ${maxBytes}-byte read limit`);
        content = Buffer.allocUnsafe(Number(initial.size));
        let offset = 0;
        while (offset < content.length) {
            const count = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (count === 0) break;
            offset += count;
        }
        const final = fs.fstatSync(descriptor, { bigint: true });
        const linked = fs.lstatSync(target, { bigint: true });
        for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (initial[key] !== final[key] || final[key] !== linked[key]) {
                fail(`${label} changed while it was read`);
            }
        }
        if (offset !== content.length || linked.isSymbolicLink() || !linked.isFile()
            || linked.nlink !== BigInt(expectedLinks)) {
            fail(`${label} changed while it was read`);
        }
        rawMode = Number(initial.mode) & 0o7777;
    } finally {
        fs.closeSync(descriptor);
    }
    const after = directoryChain(root, target, label);
    assertFrozenDirectoriesUnchanged(before, after, `${label} parent chain`);
    return {
        content,
        mode: (rawMode & 0o111) === 0 ? 0o644 : 0o755,
        rawMode,
    };
}

export function frozenDestinationTarget(sourceRoot: string, input: string): string {
    const target = validateDirectoryCreationTarget(input, 'frozen bundle destination');
    if (target === sourceRoot || target.startsWith(`${sourceRoot}${path.sep}`)
        || sourceRoot.startsWith(`${target}${path.sep}`)) {
        fail('frozen bundle source and destination roots must not overlap');
    }
    assertTrustedFrozenDestination(target, sourceRoot);
    return target;
}

export function assertTrustedFrozenDestination(targetInput: string, sourceRoot?: string): void {
    const target = path.resolve(targetInput);
    const sourceStat = sourceRoot ? fs.lstatSync(sourceRoot, { bigint: true }) : undefined;
    let ancestor = target;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    if (!process.getuid) fail('frozen bundle staging requires numeric runner ownership');
    const runnerUid = BigInt(process.getuid());
    while (true) {
        const stat = fs.lstatSync(ancestor, { bigint: true });
        if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(ancestor) !== ancestor) {
            fail('frozen bundle destination ancestor must be a real canonical directory');
        }
        if (sourceStat && sourceStat.dev === stat.dev && sourceStat.ino === stat.ino) {
            fail('frozen bundle destination aliases the source root');
        }
        const privateOwner = stat.uid === runnerUid && (stat.mode & 0o077n) === 0n;
        const protectedRoot = stat.uid === 0n && ((stat.mode & 0o022n) === 0n
            || (stat.mode & 0o1000n) !== 0n);
        if (!privateOwner && !protectedRoot) {
            fail('frozen bundle destination ancestor is renameable by another user');
        }
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
    }
}

export function createPrivateFrozenDestination(
    target: string,
    label: string,
    sourceRoot: string,
): string {
    assertTrustedFrozenDestination(target, sourceRoot);
    let ancestor = target;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const relative = path.relative(ancestor, target);
    let current = ancestor;
    for (const segment of relative ? relative.split(path.sep) : []) {
        current = path.join(current, segment);
        canonicalPrivateDirectory(current, label, true);
        assertTrustedFrozenDestination(current, sourceRoot);
    }
    const canonical = canonicalPrivateDirectory(target, label);
    assertTrustedFrozenDestination(canonical, sourceRoot);
    return canonical;
}

export function assertPrivateExistingFrozenChain(root: string, target: string): void {
    const relativeParent = path.relative(root, path.dirname(target));
    if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) {
        fail('frozen bundle destination path escapes its root');
    }
    let current = root;
    for (const segment of relativeParent ? relativeParent.split(path.sep) : []) {
        current = path.join(current, segment);
        try {
            capturePrivateFrozenDirectory(current, 'frozen bundle directory');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
    }
}

export function ensurePrivateFrozenChain(root: string, target: string): void {
    const relativeParent = path.relative(root, path.dirname(target));
    if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) {
        fail('frozen bundle destination path escapes its root');
    }
    let current = root;
    for (const segment of relativeParent ? relativeParent.split(path.sep) : []) {
        current = path.join(current, segment);
        const canonical = canonicalPrivateDirectory(current, 'frozen bundle directory', true);
        if (canonical !== current) fail('frozen bundle destination parent is not canonical');
    }
}

export function capturePrivateFrozenDirectory(
    directory: string,
    label: string,
): FrozenDirectoryIdentity {
    return captureDirectory(directory, label, true);
}

export function boundedFrozenDirectoryNames(
    directory: string,
    budget: { nodes: number },
    maximum: number,
): string[] {
    const names: string[] = [];
    const handle = fs.opendirSync(directory);
    try {
        let child = handle.readSync();
        while (child !== null) {
            budget.nodes += 1;
            if (budget.nodes > maximum) fail(`frozen bundle inventory exceeds ${maximum} path nodes`);
            names.push(child.name);
            child = handle.readSync();
        }
    } finally {
        handle.closeSync();
    }
    return names.sort(compareFrozenPaths);
}
