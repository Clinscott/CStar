import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { assertSafeOwnedDirectory, ensureSafeDirectoryTree } from './forge_adapter_artifacts.js';

const TARGET_FILE_MAX_BYTES = 64 * 1024;
const TARGET_TOTAL_MAX_BYTES = 512 * 1024;
export const FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const FORGE_WORKSPACE_OUTPUT_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
const TARGET_COUNT_MAX = 512;
const OUTPUT_COUNT_MAX = 256;
const PACKAGE_LOCK_COUNT_MAX = 16;
const PACKAGE_LOCK_TOTAL_MAX_BYTES = 128 * 1024 * 1024;

interface PathIdentity {
    path: string;
    dev: number;
    ino: number;
    uid: number;
    mode: number;
}

export interface FileSnapshot {
    path: string;
    kind: 'missing' | 'file' | 'directory';
    exists: boolean;
    sha256: string | null;
    bytes: number;
    max_bytes: number;
    mode: number;
    ctime_ms: number | null;
    mtime_ms: number | null;
    dev: number | null;
    ino: number | null;
    ancestors: PathIdentity[];
}

export interface ForgeProjectedOutput {
    source_path: string;
    projected_path: string;
    relative_path: string;
    initial: FileSnapshot;
}

interface ForgeProjectedPackageLock {
    source_path: string;
    projected_path: string;
    expected_sha256: string;
    initial: FileSnapshot;
}

export interface ForgeWorkspaceProjection {
    schema: 'cstar.forge_workspace_projection.v1';
    source_project_root: string;
    source_control_root: string;
    workspace_root: string;
    control_root: string;
    target_paths: string[];
    required_output_paths: string[];
    package_locks: Array<{ path: string; sha256: string }>;
    package_lock_preimages: ForgeProjectedPackageLock[];
    source_preimages: FileSnapshot[];
    outputs: ForgeProjectedOutput[];
    source_project_root_identity: PathIdentity;
    source_control_root_identity: PathIdentity;
}

function currentUid(): number {
    if (typeof process.getuid !== 'function') throw new Error('forge_workspace_owner_check_unavailable');
    return process.getuid();
}

function sha256(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
    );
}

function canonicalOwnedRoot(candidate: string, code: string): string {
    const lexical = path.resolve(candidate);
    const stat = fs.lstatSync(lexical);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== currentUid() || (stat.mode & 0o022) !== 0) {
        throw new Error(code);
    }
    const canonical = fs.realpathSync(lexical);
    if (canonical !== lexical) throw new Error(code);
    return canonical;
}

function pathIdentity(candidate: string): PathIdentity {
    const stat = fs.lstatSync(candidate);
    return {
        path: candidate,
        dev: stat.dev,
        ino: stat.ino,
        uid: stat.uid,
        mode: stat.mode & 0o777,
    };
}

function assertRootIdentity(expected: PathIdentity): void {
    const stat = fs.lstatSync(expected.path, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()
        || stat.dev !== expected.dev || stat.ino !== expected.ino
        || stat.uid !== expected.uid || (stat.mode & 0o777) !== expected.mode) {
        throw new Error('forge_workspace_root_drift');
    }
}

function ancestorIdentities(root: string, candidate: string): PathIdentity[] {
    if (!isInside(candidate, root) || candidate === root) throw new Error('forge_workspace_path_outside_root');
    const identities: PathIdentity[] = [];
    let current = root;
    for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!stat) break;
        if (stat.isSymbolicLink()) throw new Error('forge_workspace_symlink_forbidden');
        if (current !== candidate && !stat.isDirectory()) throw new Error('forge_workspace_parent_not_directory');
        if (stat.uid !== currentUid() || (stat.mode & 0o022) !== 0) {
            throw new Error('forge_workspace_parent_unsafe');
        }
        identities.push({
            path: current,
            dev: stat.dev,
            ino: stat.ino,
            uid: stat.uid,
            mode: stat.mode & 0o777,
        });
    }
    return identities;
}

function readExactFile(fd: number, bytes: number, maxBytes: number): Buffer {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes) {
        throw new Error('forge_workspace_source_file_unsafe');
    }
    const content = Buffer.alloc(bytes);
    let offset = 0;
    while (offset < bytes) {
        const count = fs.readSync(fd, content, offset, bytes - offset, offset);
        if (count === 0) throw new Error('forge_workspace_source_changed_during_read');
        offset += count;
    }
    const extra = Buffer.alloc(1);
    if (fs.readSync(fd, extra, 0, 1, bytes) !== 0) {
        throw new Error('forge_workspace_source_changed_during_read');
    }
    return content;
}

export function readSnapshot(root: string, candidate: string, maxBytes: number): { snapshot: FileSnapshot; content: Buffer | null; directory: boolean } {
    const absolute = path.resolve(candidate);
    const ancestors = ancestorIdentities(root, absolute);
    const lexical = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!lexical) {
        return {
            snapshot: { path: absolute, kind: 'missing', exists: false, sha256: null, bytes: 0, max_bytes: maxBytes, mode: 0o600, ctime_ms: null, mtime_ms: null, dev: null, ino: null, ancestors },
            content: null,
            directory: false,
        };
    }
    if (lexical.isDirectory()) {
        return {
            snapshot: { path: absolute, kind: 'directory', exists: true, sha256: null, bytes: 0, max_bytes: maxBytes, mode: lexical.mode & 0o777, ctime_ms: lexical.ctimeMs, mtime_ms: lexical.mtimeMs, dev: lexical.dev, ino: lexical.ino, ancestors },
            content: null,
            directory: true,
        };
    }
    if (!lexical.isFile() || lexical.nlink !== 1 || lexical.uid !== currentUid()
        || (lexical.mode & 0o022) !== 0) {
        throw new Error('forge_workspace_source_file_unsafe');
    }
    const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const before = fs.fstatSync(fd);
        if (!before.isFile() || before.nlink !== 1 || before.uid !== currentUid()
            || (before.mode & 0o022) !== 0 || before.size > maxBytes) {
            throw new Error('forge_workspace_source_file_unsafe');
        }
        const content = readExactFile(fd, before.size, maxBytes);
        const after = fs.fstatSync(fd);
        if (!after.isFile() || after.nlink !== 1 || after.uid !== currentUid()
            || (after.mode & 0o777) !== (before.mode & 0o777)
            || before.dev !== after.dev || before.ino !== after.ino
            || before.size !== after.size || before.ctimeMs !== after.ctimeMs
            || before.mtimeMs !== after.mtimeMs) {
            throw new Error('forge_workspace_source_changed_during_read');
        }
        return {
            snapshot: {
                path: absolute,
                kind: 'file',
                exists: true,
                sha256: sha256(content),
                bytes: content.byteLength,
                max_bytes: maxBytes,
                mode: after.mode & 0o777,
                ctime_ms: after.ctimeMs,
                mtime_ms: after.mtimeMs,
                dev: after.dev,
                ino: after.ino,
                ancestors,
            },
            content,
            directory: false,
        };
    } finally {
        fs.closeSync(fd);
    }
}

function writeProjectedFile(root: string, destination: string, content: Buffer, mode: number): void {
    const directory = ensureSafeDirectoryTree(root, path.dirname(destination));
    const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT
        | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), mode & 0o777);
    try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.chmodSync(destination, mode & 0o777);
    assertSafeOwnedDirectory(directory);
}

function projectedPath(projectedRoot: string, sourceRoot: string, source: string): { path: string; relative: string } {
    const relative = path.relative(sourceRoot, source);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('forge_workspace_path_outside_root');
    }
    return { path: path.join(projectedRoot, relative), relative };
}

export function prepareForgeWorkspaceProjection(
    args: ForgeExecutionArgs,
    controlRoot: string,
    projectRoot: string,
    temporaryDirectory: string,
): ForgeWorkspaceProjection {
    const sourceControlRoot = canonicalOwnedRoot(controlRoot, 'forge_workspace_control_root_unsafe');
    const sourceProjectRoot = canonicalOwnedRoot(projectRoot, 'forge_workspace_project_root_unsafe');
    const sourceControlRootIdentity = pathIdentity(sourceControlRoot);
    const sourceProjectRootIdentity = pathIdentity(sourceProjectRoot);
    const temporaryRoot = assertSafeOwnedDirectory(temporaryDirectory);
    const workspaceRoot = ensureSafeDirectoryTree(temporaryRoot, path.join(temporaryRoot, 'shadow-workspace'));
    const projectedControlRoot = ensureSafeDirectoryTree(temporaryRoot, path.join(temporaryRoot, 'shadow-control'));
    const requestedOutputs = [...new Set((args.required_output_paths ?? []).map((item) => path.resolve(item)))].sort();
    if (requestedOutputs.length > OUTPUT_COUNT_MAX) {
        throw new Error('forge_workspace_output_count_exceeded');
    }
    const outputSet = new Set(requestedOutputs);
    const sources = new Set<string>(requestedOutputs);
    for (const target of args.target_paths ?? []) sources.add(path.resolve(target));
    if (sources.size > TARGET_COUNT_MAX) throw new Error('forge_workspace_target_count_exceeded');
    if ((args.package_locks ?? []).length > PACKAGE_LOCK_COUNT_MAX) {
        throw new Error('forge_workspace_package_lock_count_exceeded');
    }
    const projectedTargets: string[] = [];
    let targetBytes = 0;
    let outputBytes = 0;
    const snapshots = new Map<string, FileSnapshot>();

    for (const source of [...sources].sort()) {
        if (!isInside(source, sourceProjectRoot)) {
            throw new Error('forge_workspace_target_outside_project');
        }
        if (source === sourceProjectRoot) {
            if (outputSet.has(source)) throw new Error('forge_workspace_output_must_be_file');
            projectedTargets.push(workspaceRoot);
            continue;
        }
        const maxBytes = outputSet.has(source) ? FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES : TARGET_FILE_MAX_BYTES;
        const { snapshot, content, directory } = readSnapshot(sourceProjectRoot, source, maxBytes);
        snapshots.set(source, snapshot);
        if (directory) {
            if (outputSet.has(source)) throw new Error('forge_workspace_output_must_be_file');
            const projected = projectedPath(workspaceRoot, sourceProjectRoot, source);
            ensureSafeDirectoryTree(workspaceRoot, projected.path);
            projectedTargets.push(projected.path);
            continue;
        }
        const projected = projectedPath(workspaceRoot, sourceProjectRoot, source);
        ensureSafeDirectoryTree(workspaceRoot, path.dirname(projected.path));
        if (content) {
            if (outputSet.has(source)) {
                outputBytes += content.byteLength;
                if (outputBytes > FORGE_WORKSPACE_OUTPUT_TOTAL_MAX_BYTES) {
                    throw new Error('forge_workspace_output_material_too_large');
                }
            } else {
                targetBytes += content.byteLength;
                if (targetBytes > TARGET_TOTAL_MAX_BYTES) {
                    throw new Error('forge_workspace_target_material_too_large');
                }
            }
            writeProjectedFile(workspaceRoot, projected.path, content, snapshot.mode);
        }
        projectedTargets.push(projected.path);
    }

    const outputs = requestedOutputs.map((source) => {
        const projected = projectedPath(workspaceRoot, sourceProjectRoot, source);
        return {
            source_path: source,
            projected_path: projected.path,
            relative_path: projected.relative.split(path.sep).join('/'),
            initial: snapshots.get(source) ?? readSnapshot(sourceProjectRoot, source, FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES).snapshot,
        };
    });
    if (outputs.length > 0) {
        for (const output of outputs) if (!projectedTargets.includes(output.projected_path)) projectedTargets.push(output.projected_path);
    }
    if (projectedTargets.length === 0) throw new Error('forge_workspace_exact_file_targets_required');

    let packageLockBytes = 0;
    const packageLockPreimages = (args.package_locks ?? []).map((lock) => {
        const source = path.isAbsolute(lock.path)
            ? path.resolve(lock.path) : path.resolve(sourceControlRoot, lock.path);
        const projected = projectedPath(projectedControlRoot, sourceControlRoot, source);
        const { snapshot, content, directory } = readSnapshot(sourceControlRoot, source, 64 * 1024 * 1024);
        if (directory || !content || snapshot.sha256 !== lock.sha256.trim().toLowerCase()) {
            throw new Error('forge_workspace_package_lock_drift');
        }
        packageLockBytes += content.byteLength;
        if (packageLockBytes > PACKAGE_LOCK_TOTAL_MAX_BYTES) {
            throw new Error('forge_workspace_package_lock_material_too_large');
        }
        writeProjectedFile(projectedControlRoot, projected.path, content, 0o400);
        return {
            source_path: source,
            projected_path: projected.path,
            expected_sha256: snapshot.sha256,
            initial: snapshot,
        } as ForgeProjectedPackageLock;
    });
    const packageLocks = packageLockPreimages.map((lock) => ({
        path: lock.projected_path,
        sha256: lock.expected_sha256,
    }));

    assertRootIdentity(sourceProjectRootIdentity);
    assertRootIdentity(sourceControlRootIdentity);
    return {
        schema: 'cstar.forge_workspace_projection.v1',
        source_project_root: sourceProjectRoot,
        source_control_root: sourceControlRoot,
        workspace_root: workspaceRoot,
        control_root: projectedControlRoot,
        target_paths: projectedTargets.sort(),
        required_output_paths: outputs.map((output) => output.projected_path).sort(),
        package_locks: packageLocks,
        package_lock_preimages: packageLockPreimages,
        source_preimages: [...snapshots.values()],
        outputs,
        source_project_root_identity: sourceProjectRootIdentity,
        source_control_root_identity: sourceControlRootIdentity,
    };
}

export function projectForgeAdapterIntent(
    intent: Record<string, unknown>,
    projection: ForgeWorkspaceProjection,
): Record<string, unknown> {
    return {
        ...intent,
        control_root: projection.control_root,
        project_root: projection.workspace_root,
        target_paths: projection.target_paths,
        required_output_paths: projection.required_output_paths,
        package_locks: projection.package_locks,
        workspace_projection: {
            schema: projection.schema,
            target_count: projection.target_paths.length,
            required_output_count: projection.required_output_paths.length,
            package_lock_count: projection.package_locks.length,
        },
    };
}

export function readSnapshotUnchanged(root: string, snapshot: FileSnapshot): Buffer | null {
    for (const expected of snapshot.ancestors) {
        const stat = fs.lstatSync(expected.path, { throwIfNoEntry: false });
        if (!stat || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino
            || stat.uid !== expected.uid || (stat.mode & 0o777) !== expected.mode) {
            throw new Error('forge_workspace_source_drift_before_commit');
        }
    }
    const current = fs.lstatSync(snapshot.path, { throwIfNoEntry: false });
    if (snapshot.kind === 'missing') {
        if (current) throw new Error('forge_workspace_source_drift_before_commit');
        return null;
    }
    if (snapshot.kind === 'directory') {
        if (!current || current.isSymbolicLink() || !current.isDirectory()
            || current.uid !== currentUid() || (current.mode & 0o777) !== snapshot.mode
            || current.dev !== snapshot.dev || current.ino !== snapshot.ino) {
            throw new Error('forge_workspace_source_drift_before_commit');
        }
        return null;
    }
    if (!current || !current.isFile() || current.isSymbolicLink() || current.nlink !== 1
        || current.uid !== currentUid() || (current.mode & 0o777) !== snapshot.mode
        || current.dev !== snapshot.dev || current.ino !== snapshot.ino) {
        throw new Error('forge_workspace_source_drift_before_commit');
    }
    const fd = fs.openSync(snapshot.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const before = fs.fstatSync(fd);
        if (!before.isFile() || before.nlink !== 1 || before.uid !== currentUid()
            || (before.mode & 0o777) !== snapshot.mode || before.dev !== snapshot.dev
            || before.ino !== snapshot.ino || before.size !== snapshot.bytes
            || before.ctimeMs !== snapshot.ctime_ms || before.mtimeMs !== snapshot.mtime_ms
            || before.size > snapshot.max_bytes) {
            throw new Error('forge_workspace_source_drift_before_commit');
        }
        const content = readExactFile(fd, before.size, snapshot.max_bytes);
        const after = fs.fstatSync(fd);
        if (!after.isFile() || after.nlink !== 1 || after.uid !== currentUid()
            || (after.mode & 0o777) !== snapshot.mode
            || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
            || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs
            || sha256(content) !== snapshot.sha256) {
            throw new Error('forge_workspace_source_drift_before_commit');
        }
        return content;
    } finally {
        fs.closeSync(fd);
    }
}

export function assertSnapshotUnchanged(root: string, snapshot: FileSnapshot): void {
    readSnapshotUnchanged(root, snapshot);
}

export function assertForgeWorkspaceProjectionCurrent(
    projection: ForgeWorkspaceProjection,
    ignoredSourcePaths: ReadonlySet<string> = new Set(),
): void {
    assertRootIdentity(projection.source_project_root_identity);
    assertRootIdentity(projection.source_control_root_identity);
    for (const snapshot of projection.source_preimages) {
        if (!ignoredSourcePaths.has(snapshot.path)) {
            assertSnapshotUnchanged(projection.source_project_root, snapshot);
        }
    }
    for (const lock of projection.package_lock_preimages) {
        try {
            assertSnapshotUnchanged(projection.source_control_root, lock.initial);
        } catch {
            throw new Error('forge_workspace_package_lock_drift');
        }
        if (lock.initial.sha256 !== lock.expected_sha256) {
            throw new Error('forge_workspace_package_lock_drift');
        }
    }
}
