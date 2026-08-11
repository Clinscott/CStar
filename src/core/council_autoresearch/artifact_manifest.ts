import fs from 'node:fs';
import path from 'node:path';

import {
    ArtifactEntry,
    ArtifactManifest,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    MAX_BUFFERED_FILE_BYTES,
    canonicalJson,
    fail,
    resolveContained,
    sha256,
    sha256File,
} from './contracts.js';

function canonicalRelativePath(value: string): string {
    return value.split(path.sep).join('/');
}

function compareUtf8(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

const MAX_ARTIFACT_FILES = 4096;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

function assertNoSymlinkSegments(root: string, relativePath: string): void {
    let current = fs.realpathSync(root);
    for (const segment of relativePath.split(/[\\/]/).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) fail(`artifact path contains a symbolic link: ${relativePath}`);
    }
}

function walk(
    root: string,
    relativePath: string,
    entries: ArtifactEntry[],
    caseKeys: Set<string>,
    total: { bytes: number },
): void {
    assertNoSymlinkSegments(root, relativePath);
    const absolute = resolveContained(root, relativePath, 'artifact path');
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`artifact path is a symbolic link: ${relativePath}`);
    if (stat.isDirectory()) {
        const children = fs.readdirSync(absolute).sort(compareUtf8);
        for (const child of children) walk(root, path.join(relativePath, child), entries, caseKeys, total);
        return;
    }
    if (!stat.isFile()) fail(`artifact path is not a regular file: ${relativePath}`);
    if (stat.nlink !== 1) fail(`artifact file has an unexpected hard-link count: ${relativePath}`);
    const canonicalPath = canonicalRelativePath(relativePath);
    const caseKey = canonicalPath.normalize('NFC').toLocaleLowerCase('en-US');
    if (caseKeys.has(caseKey)) fail(`artifact manifest contains a path or case collision: ${canonicalPath}`);
    caseKeys.add(caseKey);
    if (stat.size > MAX_BUFFERED_FILE_BYTES
        || entries.length >= MAX_ARTIFACT_FILES
        || total.bytes + stat.size > MAX_ARTIFACT_BYTES) {
        fail(
            `artifact manifest exceeds ${MAX_ARTIFACT_FILES} files, ${MAX_ARTIFACT_BYTES} total bytes,`
            + ` or ${MAX_BUFFERED_FILE_BYTES} bytes per file`,
        );
    }
    const digest = sha256File(absolute);
    assertNoSymlinkSegments(root, relativePath);
    const after = fs.lstatSync(absolute);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
        || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
        || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
        fail(`artifact path changed while it was being hashed: ${relativePath}`);
    }
    entries.push({
        path: canonicalPath,
        mode: stat.mode & 0o777,
        bytes: stat.size,
        sha256: digest,
    });
    total.bytes += stat.size;
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
    const entries: ArtifactEntry[] = [];
    const caseKeys = new Set<string>();
    const total = { bytes: 0 };
    for (const relativePath of includedPaths) walk(root, relativePath, entries, caseKeys, total);
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
