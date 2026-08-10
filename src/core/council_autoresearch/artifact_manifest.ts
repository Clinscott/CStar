import fs from 'node:fs';
import path from 'node:path';

import {
    ArtifactEntry,
    ArtifactManifest,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    canonicalJson,
    fail,
    resolveContained,
    sha256,
    sha256File,
} from './contracts.js';

export const ARTIFACT_MANIFEST_MAX_DEPTH = 32;
export const ARTIFACT_MANIFEST_MAX_ENTRIES = 4096;
export const ARTIFACT_MANIFEST_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const ARTIFACT_MANIFEST_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface PendingArtifactFile {
    absolute: string;
    canonicalPath: string;
    relativePath: string;
    stat: fs.BigIntStats;
}

interface ManifestBudget {
    entriesVisited: number;
    totalBytes: number;
    pending: PendingArtifactFile[];
    caseKeys: Set<string>;
}

function canonicalRelativePath(value: string): string {
    return value.split(path.sep).join('/');
}

function compareUtf8(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function assertNoSymlinkSegments(root: string, relativePath: string): void {
    let current = fs.realpathSync(root);
    for (const segment of relativePath.split(/[\\/]/).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) fail(`artifact path contains a symbolic link: ${relativePath}`);
    }
}

function relativeDepth(relativePath: string): number {
    return relativePath.split(/[\\/]/).filter((segment) => segment !== '' && segment !== '.').length;
}

function preflight(root: string, relativePath: string, budget: ManifestBudget): void {
    if (relativeDepth(relativePath) > ARTIFACT_MANIFEST_MAX_DEPTH) {
        fail(`artifact path exceeds the maximum depth of ${ARTIFACT_MANIFEST_MAX_DEPTH}: ${relativePath}`);
    }
    budget.entriesVisited += 1;
    if (budget.entriesVisited > ARTIFACT_MANIFEST_MAX_ENTRIES) {
        fail(`artifact manifest exceeds ${ARTIFACT_MANIFEST_MAX_ENTRIES} filesystem entries`);
    }
    assertNoSymlinkSegments(root, relativePath);
    const absolute = resolveContained(root, relativePath, 'artifact path');
    const stat = fs.lstatSync(absolute, { bigint: true });
    if (stat.isSymbolicLink()) fail(`artifact path is a symbolic link: ${relativePath}`);
    if (stat.isDirectory()) {
        const directory = fs.opendirSync(absolute);
        try {
            let child = directory.readSync();
            while (child !== null) {
                preflight(root, path.join(relativePath, child.name), budget);
                child = directory.readSync();
            }
        } finally {
            directory.closeSync();
        }
        return;
    }
    if (!stat.isFile()) fail(`artifact path is not a regular file: ${relativePath}`);
    if (stat.nlink !== 1n) fail(`artifact file has an unexpected hard-link count: ${relativePath}`);
    if (stat.size > BigInt(ARTIFACT_MANIFEST_MAX_FILE_BYTES)) {
        fail(`artifact file exceeds ${ARTIFACT_MANIFEST_MAX_FILE_BYTES} bytes: ${relativePath}`);
    }
    const fileBytes = Number(stat.size);
    if (budget.totalBytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES - fileBytes) {
        fail(`artifact manifest exceeds ${ARTIFACT_MANIFEST_MAX_TOTAL_BYTES} total bytes`);
    }
    budget.totalBytes += fileBytes;
    const canonicalPath = canonicalRelativePath(relativePath);
    const caseKey = canonicalPath.normalize('NFC').toLocaleLowerCase('en-US');
    if (budget.caseKeys.has(caseKey)) fail(`artifact manifest contains a path or case collision: ${canonicalPath}`);
    budget.caseKeys.add(caseKey);
    budget.pending.push({ absolute, canonicalPath, relativePath, stat });
}

function assertSameFile(
    expected: fs.BigIntStats,
    actual: fs.BigIntStats,
    relativePath: string,
): void {
    if (!actual.isFile() || actual.isSymbolicLink() || actual.nlink !== 1n) {
        fail(`artifact path changed while it was being hashed: ${relativePath}`);
    }
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const) {
        if (expected[key] !== actual[key]) fail(`artifact path changed while it was being hashed: ${relativePath}`);
    }
}

function hashPending(root: string, pending: PendingArtifactFile): ArtifactEntry {
    assertNoSymlinkSegments(root, pending.relativePath);
    const before = fs.lstatSync(pending.absolute, { bigint: true });
    assertSameFile(pending.stat, before, pending.relativePath);
    const digest = sha256File(pending.absolute, ARTIFACT_MANIFEST_MAX_FILE_BYTES);
    assertNoSymlinkSegments(root, pending.relativePath);
    const after = fs.lstatSync(pending.absolute, { bigint: true });
    assertSameFile(before, after, pending.relativePath);
    return {
        path: pending.canonicalPath,
        mode: (before.mode & 0o111n) === 0n ? 0o644 : 0o755,
        bytes: Number(before.size),
        sha256: digest,
    };
}

function manifestDigest(manifest: Omit<ArtifactManifest, 'manifest_sha256'>): string {
    return sha256(canonicalJson(manifest));
}

export function buildArtifactManifest(input: {
    root: string;
    rootLabel: string;
    includedPaths: string[];
}): ArtifactManifest {
    if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(input.rootLabel)) fail('root label is invalid');
    if (input.includedPaths.length < 1 || input.includedPaths.length > 256) {
        fail('artifact manifest requires one to 256 included paths');
    }
    const root = fs.realpathSync(input.root);
    const includedPaths = [...new Set(input.includedPaths.map(canonicalRelativePath))].sort(compareUtf8);
    const budget: ManifestBudget = {
        entriesVisited: 0,
        totalBytes: 0,
        pending: [],
        caseKeys: new Set<string>(),
    };
    for (const relativePath of includedPaths) preflight(root, relativePath, budget);
    const entries = budget.pending.map((pending) => hashPending(root, pending));
    entries.sort((left, right) => compareUtf8(left.path, right.path));
    if (entries.length === 0) fail('artifact manifest must bind at least one regular file');
    const base = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        root_label: input.rootLabel,
        included_paths: includedPaths,
        entries,
    };
    return { ...base, manifest_sha256: manifestDigest(base) };
}

export function verifyArtifactManifest(manifest: ArtifactManifest, root: string): void {
    const rebuilt = buildArtifactManifest({
        root,
        rootLabel: manifest.root_label,
        includedPaths: manifest.included_paths,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(manifest)) fail('artifact manifest content mismatch');
}
