import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { buildArtifactManifest } from './artifact_manifest.js';
import { ArtifactManifest, canonicalJson, fail } from './contracts.js';

export function runGit(repoRoot: string, args: string[], maxBuffer = 1024 * 1024): string {
    const result = spawnSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer,
    });
    if (result.error || result.status !== 0) fail(`git ${args.join(' ')} failed`);
    return result.stdout;
}

export function locateRepositoryRoot(input: string): string {
    const supplied = fs.realpathSync(input);
    return fs.realpathSync(runGit(supplied, ['rev-parse', '--show-toplevel']).trim());
}

export function repositoryRoot(input: string): string {
    const supplied = fs.realpathSync(input);
    const top = locateRepositoryRoot(supplied);
    if (supplied !== top) fail('repository root must be the Git worktree top-level');
    return top;
}

export function gitCommonDirectory(repoRoot: string): string {
    const value = runGit(repoRoot, ['rev-parse', '--git-common-dir']).trim();
    return fs.realpathSync(path.resolve(repoRoot, value));
}

export function sourceHead(repoRoot: string): string {
    const head = runGit(repoRoot, ['rev-parse', 'HEAD']).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) fail('repository HEAD is not a full Git SHA');
    return head;
}

export function assertSourceClean(repoRoot: string, governedPaths?: string[]): void {
    const args = ['status', '--porcelain=v1', '--untracked-files=all'];
    if (governedPaths) args.push('--', ...governedPaths);
    const status = runGit(repoRoot, ['--literal-pathspecs', ...args], 16 * 1024 * 1024).trim();
    if (status !== '') fail(governedPaths
        ? 'governed source paths contain uncommitted changes'
        : 'runner checkout contains uncommitted changes');
}

function assertManifestMatchesHead(
    repoRoot: string,
    governedPaths: string[],
    manifest: ArtifactManifest,
): void {
    const output = runGit(repoRoot, [
        '--literal-pathspecs', 'ls-tree', '-r', '-z', '--full-tree', 'HEAD', '--', ...governedPaths,
    ], 16 * 1024 * 1024);
    const tree = new Map<string, boolean>();
    for (const record of output.split('\0').filter(Boolean)) {
        const match = /^(\d+) (\w+) [a-f0-9]+\t([\s\S]+)$/.exec(record);
        if (!match || match[2] !== 'blob') fail('governed source contains a non-file Git entry');
        const executable = match[1] === '100755' ? true : match[1] === '100644' ? false : undefined;
        if (executable === undefined || tree.has(match[3])) {
            fail('governed Git tree contains an unsupported or duplicate entry');
        }
        tree.set(match[3], executable);
    }
    const manifestPaths = manifest.entries.map((entry) => entry.path).sort();
    const treePaths = [...tree.keys()].sort();
    if (canonicalJson(manifestPaths) !== canonicalJson(treePaths)) {
        fail('governed source manifest contains ignored, untracked, or missing files');
    }
    for (const entry of manifest.entries) {
        if (tree.get(entry.path) !== ((entry.mode & 0o111) !== 0)) {
            fail(`governed file executable mode differs from HEAD: ${entry.path}`);
        }
    }
}

export function attestSource(repoRoot: string, governedPaths: string[], rootLabel: string): {
    head: string;
    manifest: ArtifactManifest;
} {
    const before = sourceHead(repoRoot);
    assertSourceClean(repoRoot, governedPaths);
    const manifest = buildArtifactManifest({ root: repoRoot, rootLabel, includedPaths: governedPaths });
    assertManifestMatchesHead(repoRoot, governedPaths, manifest);
    assertSourceClean(repoRoot, governedPaths);
    const after = sourceHead(repoRoot);
    if (before !== after) fail('repository HEAD changed during source attestation');
    return { head: before, manifest };
}
