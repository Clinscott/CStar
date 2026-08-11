import fs from 'node:fs';
import path from 'node:path';

import {
    ARTIFACT_MANIFEST_MAX_FILE_BYTES,
    buildArtifactManifest,
} from './artifact_manifest.js';
import {
    ArtifactManifest,
    canonicalJson,
    fail,
    readRegularFileNoFollow,
    sha256,
} from './contracts.js';
import {
    gitCommonDirectory,
    repositoryRoot,
    runTrustedGit,
    sourceHead,
} from './git_trust.js';

interface GitFileEntry {
    mode: number;
    oid: string;
}

interface FileIdentity {
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

interface IndexSnapshot {
    path: string;
    identity: FileIdentity;
}

interface WorktreeSnapshot {
    path: string;
    identity: FileIdentity;
}

function assertCanonicalRepositoryPath(file: string): void {
    const segments = file.split('/');
    if (!file || path.isAbsolute(file) || /[\\\r\n\0]/.test(file)
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(`governed source path is invalid: ${file}`);
    }
}

export function assertGovernedPaths(governedPaths: string[]): void {
    if (governedPaths.length < 1 || governedPaths.length > 256) {
        fail('one to 256 governed paths are required');
    }
    for (const entry of governedPaths) assertCanonicalRepositoryPath(entry);
}

function resolvedGitPath(repoRoot: string, name: 'index' | 'objects'): string {
    const output = String(runTrustedGit(repoRoot, ['rev-parse', '--git-path', name])).trim();
    const requested = path.resolve(repoRoot, output);
    const resolved = fs.realpathSync(requested);
    if (requested !== resolved) fail(`Git ${name} path is not canonical`);
    return resolved;
}

function assertAbsent(file: string, message: string): void {
    try {
        fs.lstatSync(file);
        fail(message);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

function regularFileIdentity(file: string, label: string): FileIdentity {
    const stat = fs.lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n) {
        fail(`${label} is not a single-link regular file`);
    }
    return {
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

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
    return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
        && left.nlink === right.nlink && left.uid === right.uid && left.gid === right.gid
        && left.size === right.size && left.mtimeNs === right.mtimeNs
        && left.ctimeNs === right.ctimeNs;
}

function repositoryIndexSnapshot(repoRoot: string): IndexSnapshot {
    const indexPath = resolvedGitPath(repoRoot, 'index');
    return {
        path: indexPath,
        identity: regularFileIdentity(indexPath, 'Git index'),
    };
}

function assertSameIndexSnapshot(before: IndexSnapshot, after: IndexSnapshot): void {
    if (before.path !== after.path || !sameFileIdentity(before.identity, after.identity)) {
        fail('Git index changed during source attestation');
    }
}

export function assertRepositoryObjectTopology(repoRootInput: string): void {
    const repoRoot = repositoryRoot(repoRootInput);
    const common = gitCommonDirectory(repoRoot);
    const objects = resolvedGitPath(repoRoot, 'objects');
    if (objects !== path.join(common, 'objects')) fail('Git object directory is not canonical');
    const objectStat = fs.lstatSync(objects);
    if (objectStat.isSymbolicLink() || !objectStat.isDirectory()) fail('Git object directory is invalid');
    assertAbsent(path.join(objects, 'info', 'alternates'), 'alternate Git object databases are forbidden');
    assertAbsent(path.join(common, 'info', 'grafts'), 'Git grafts are forbidden');

    const replacements = String(runTrustedGit(repoRoot, [
        'for-each-ref', '--format=%(refname)', 'refs/replace/',
    ])).trim();
    if (replacements !== '') fail('Git replacement refs are forbidden');

    const sharedIndex = String(runTrustedGit(repoRoot, ['rev-parse', '--shared-index-path'])).trim();
    if (sharedIndex !== '') fail('Git split indexes are forbidden');

    const index = resolvedGitPath(repoRoot, 'index');
    regularFileIdentity(index, 'Git index');
}

function headEntries(repoRoot: string, commit: string, governedPaths: string[]): Map<string, GitFileEntry> {
    const output = String(runTrustedGit(repoRoot, [
        '--literal-pathspecs', 'ls-tree', '-r', '-z', '--full-tree', commit, '--', ...governedPaths,
    ]));
    const entries = new Map<string, GitFileEntry>();
    for (const record of output.split('\0').filter(Boolean)) {
        const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(record);
        if (!match || entries.has(match[3])) fail('governed Git tree contains an unsupported or duplicate entry');
        assertCanonicalRepositoryPath(match[3]);
        entries.set(match[3], { mode: match[1] === '100755' ? 0o755 : 0o644, oid: match[2] });
    }
    return entries;
}

function indexEntries(repoRoot: string, governedPaths: string[]): Map<string, GitFileEntry> {
    const output = String(runTrustedGit(repoRoot, [
        '--literal-pathspecs', 'ls-files', '--stage', '-z', '--', ...governedPaths,
    ]));
    const entries = new Map<string, GitFileEntry>();
    for (const record of output.split('\0').filter(Boolean)) {
        const match = /^(100644|100755) ([a-f0-9]{40,64}) 0\t([\s\S]+)$/.exec(record);
        if (!match || entries.has(match[3])) fail('governed Git index contains an unsupported or duplicate entry');
        assertCanonicalRepositoryPath(match[3]);
        entries.set(match[3], { mode: match[1] === '100755' ? 0o755 : 0o644, oid: match[2] });
    }
    return entries;
}

function ordinaryIndexPaths(repoRoot: string, governedPaths: string[]): string[] {
    const output = String(runTrustedGit(repoRoot, [
        '--literal-pathspecs', 'ls-files', '-v', '-z', '--', ...governedPaths,
    ]));
    const paths: string[] = [];
    for (const record of output.split('\0').filter(Boolean)) {
        const match = /^([A-Za-z?]) ([\s\S]+)$/.exec(record);
        if (!match || match[1] !== 'H') fail('governed Git index contains hidden or unsupported flags');
        assertCanonicalRepositoryPath(match[2]);
        paths.push(match[2]);
    }
    if (new Set(paths).size !== paths.length) fail('governed Git index flags contain duplicate paths');
    return paths;
}

function assertSamePathSet(label: string, left: string[], right: string[]): void {
    const compare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
    if (canonicalJson([...left].sort(compare)) !== canonicalJson([...right].sort(compare))) {
        fail(`${label} path set differs from HEAD`);
    }
}

function assertManifestMatchesHead(
    repoRoot: string,
    commit: string,
    governedPaths: string[],
    manifest: ArtifactManifest,
): { index: Map<string, GitFileEntry>; flags: string[]; worktree: WorktreeSnapshot[] } {
    const tree = headEntries(repoRoot, commit, governedPaths);
    const index = indexEntries(repoRoot, governedPaths);
    const flags = ordinaryIndexPaths(repoRoot, governedPaths);
    const manifestPaths = manifest.entries.map((entry) => entry.path);
    assertSamePathSet('governed source manifest', manifestPaths, [...tree.keys()]);
    assertSamePathSet('governed Git index', [...index.keys()], [...tree.keys()]);
    assertSamePathSet('governed Git index flags', flags, [...tree.keys()]);

    const worktree: WorktreeSnapshot[] = [];
    for (const entry of manifest.entries) {
        const committed = tree.get(entry.path)!;
        const staged = index.get(entry.path)!;
        if (committed.mode !== entry.mode || staged.mode !== committed.mode
            || staged.oid !== committed.oid) {
            fail(`governed file index or mode differs from HEAD: ${entry.path}`);
        }
        const absolute = path.join(repoRoot, ...entry.path.split('/'));
        const before = regularFileIdentity(absolute, `governed worktree file ${entry.path}`);
        const worktreeBytes = readRegularFileNoFollow(
            absolute,
            `governed worktree file ${entry.path}`,
            ARTIFACT_MANIFEST_MAX_FILE_BYTES,
        );
        const after = regularFileIdentity(absolute, `governed worktree file ${entry.path}`);
        if (!sameFileIdentity(before, after)) {
            fail(`governed worktree file changed while it was measured: ${entry.path}`);
        }
        if (worktreeBytes.length !== entry.bytes || sha256(worktreeBytes) !== entry.sha256) {
            fail(`governed worktree manifest changed during attestation: ${entry.path}`);
        }
        const committedBytes = runTrustedGit(repoRoot, ['cat-file', 'blob', committed.oid], {
            encoding: 'buffer',
            maxBuffer: ARTIFACT_MANIFEST_MAX_FILE_BYTES + 1024,
        }) as Buffer;
        if (committedBytes.length > ARTIFACT_MANIFEST_MAX_FILE_BYTES
            || !committedBytes.equals(worktreeBytes)) {
            fail(`governed raw worktree bytes differ from HEAD: ${entry.path}`);
        }
        worktree.push({ path: absolute, identity: after });
    }
    return { index, flags, worktree };
}

function assertSameIndexView(
    beforeEntries: Map<string, GitFileEntry>,
    beforeFlags: string[],
    afterEntries: Map<string, GitFileEntry>,
    afterFlags: string[],
): void {
    const entries = (value: Map<string, GitFileEntry>) => [...value.entries()]
        .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    if (canonicalJson(entries(beforeEntries)) !== canonicalJson(entries(afterEntries))
        || canonicalJson(beforeFlags) !== canonicalJson(afterFlags)) {
        fail('Git index view changed during source attestation');
    }
}

function assertWorktreeSnapshotsUnchanged(snapshots: WorktreeSnapshot[]): void {
    for (const snapshot of snapshots) {
        const after = regularFileIdentity(snapshot.path, 'governed worktree file');
        if (!sameFileIdentity(snapshot.identity, after)) {
            fail('governed worktree changed during source attestation');
        }
    }
}

export function attestSource(repoRootInput: string, governedPaths: string[], rootLabel: string): {
    head: string;
    manifest: ArtifactManifest;
} {
    const repoRoot = repositoryRoot(repoRootInput);
    assertGovernedPaths(governedPaths);
    assertRepositoryObjectTopology(repoRoot);
    const before = sourceHead(repoRoot);
    const indexBefore = repositoryIndexSnapshot(repoRoot);
    const manifest = buildArtifactManifest({ root: repoRoot, rootLabel, includedPaths: governedPaths });
    const verified = assertManifestMatchesHead(repoRoot, before, governedPaths, manifest);
    const rebuilt = buildArtifactManifest({ root: repoRoot, rootLabel, includedPaths: governedPaths });
    if (canonicalJson(manifest) !== canonicalJson(rebuilt)) {
        fail('governed worktree manifest changed during source attestation');
    }
    const finalIndex = indexEntries(repoRoot, governedPaths);
    const finalFlags = ordinaryIndexPaths(repoRoot, governedPaths);
    assertSameIndexView(verified.index, verified.flags, finalIndex, finalFlags);
    assertWorktreeSnapshotsUnchanged(verified.worktree);
    assertSameIndexSnapshot(indexBefore, repositoryIndexSnapshot(repoRoot));
    assertRepositoryObjectTopology(repoRoot);
    const after = sourceHead(repoRoot);
    if (before !== after) fail('repository HEAD changed during source attestation');
    assertWorktreeSnapshotsUnchanged(verified.worktree);
    assertSameIndexSnapshot(indexBefore, repositoryIndexSnapshot(repoRoot));
    return { head: before, manifest };
}
