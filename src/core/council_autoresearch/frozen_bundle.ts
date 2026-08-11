import fs from 'node:fs';
import path from 'node:path';

import {
    ArtifactManifest,
    FrozenCouncilPacket,
    MAX_BUFFERED_FILE_BYTES,
    assertSha256,
    ensureDirectoryNoFollow,
    fail,
    sha256,
    writeImmutableFile,
} from './contracts.js';
import { verifyFrozenPacket } from './packet.js';
import { FrozenRatings } from './rating.js';

interface DirectoryIdentity {
    path: string;
    dev: bigint;
    ino: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
}

export interface FrozenFileExpectation {
    sha256: string;
    bytes?: number;
    mode?: number;
}

function containedTarget(root: string, relative: string, label: string): { base: string; target: string } {
    if (!relative || relative.includes('\0') || relative.includes('\\') || path.isAbsolute(relative)) {
        fail(`${label} must be a canonical relative path`);
    }
    const segments = relative.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(`${label} must be a canonical relative path`);
    }
    const base = fs.realpathSync(root);
    const target = path.resolve(base, ...segments);
    if (!target.startsWith(`${base}${path.sep}`)) fail(`${label} escapes its root`);
    return { base, target };
}

function directoryChain(base: string, target: string, label: string): DirectoryIdentity[] {
    const parent = path.dirname(target);
    const relativeParent = path.relative(base, parent);
    if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) fail(`${label} escapes its root`);
    const directories = [base];
    let current = base;
    for (const segment of relativeParent ? relativeParent.split(path.sep) : []) {
        current = path.join(current, segment);
        directories.push(current);
    }
    return directories.map((directory) => {
        const stat = fs.lstatSync(directory, { bigint: true });
        if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} parent is not a real directory`);
        return {
            path: directory,
            dev: stat.dev,
            ino: stat.ino,
            mtimeNs: stat.mtimeNs,
            ctimeNs: stat.ctimeNs,
        };
    });
}

function assertSameDirectoryChain(before: DirectoryIdentity[], after: DirectoryIdentity[], label: string): void {
    if (before.length !== after.length) fail(`${label} parent chain changed while it was being read`);
    for (let index = 0; index < before.length; index += 1) {
        for (const key of ['path', 'dev', 'ino', 'mtimeNs', 'ctimeNs'] as const) {
            if (before[index][key] !== after[index][key]) {
                fail(`${label} parent chain changed while it was being read`);
            }
        }
    }
}

export function snapshotContainedRegularFile(
    root: string,
    relative: string,
    label = 'contained file',
): { content: Buffer; mode: number } {
    const { base, target } = containedTarget(root, relative, label);
    const parents = directoryChain(base, target, label);
    if (fs.realpathSync(target) !== target) fail(`${label} traverses a symbolic link`);
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    let descriptor: number;
    try {
        descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollow);
    } catch (error) {
        fail(`${label} could not be opened without following links: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n) fail(`${label} must be a single-link regular file`);
        if (before.size > BigInt(MAX_BUFFERED_FILE_BYTES)) {
            fail(`${label} exceeds the ${MAX_BUFFERED_FILE_BYTES}-byte read limit`);
        }
        const content = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor, { bigint: true });
        const linked = fs.lstatSync(target, { bigint: true });
        for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (before[key] !== after[key]) fail(`${label} changed while it was being read`);
        }
        if (fs.realpathSync(target) !== target
            || linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n
            || linked.dev !== after.dev || linked.ino !== after.ino) {
            fail(`${label} path changed while it was being read`);
        }
        assertSameDirectoryChain(parents, directoryChain(base, target, label), label);
        return { content, mode: Number(before.mode) & 0o777 };
    } finally {
        fs.closeSync(descriptor);
    }
}

function readContainedJson<T>(root: string, relative: string, expectedSha256: string, label: string): T {
    const snapshot = snapshotContainedRegularFile(root, relative, label);
    if (sha256(snapshot.content) !== expectedSha256) fail(`${label} hash changed before staging`);
    try {
        return JSON.parse(snapshot.content.toString('utf8')) as T;
    } catch (error) {
        fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function stageFrozenFile(
    sourceRoot: string,
    destinationRoot: string,
    relative: string,
    expected: FrozenFileExpectation,
): void {
    assertSha256(expected.sha256, 'frozen file expectation');
    if (expected.bytes !== undefined && (!Number.isSafeInteger(expected.bytes) || expected.bytes < 0)) {
        fail('frozen file expected byte count is invalid');
    }
    if (expected.mode !== undefined
        && (!Number.isInteger(expected.mode) || expected.mode < 0 || expected.mode > 0o777)) {
        fail('frozen file expected mode is invalid');
    }
    const snapshot = snapshotContainedRegularFile(sourceRoot, relative, 'frozen bundle path');
    if (sha256(snapshot.content) !== expected.sha256
        || (expected.bytes !== undefined && snapshot.content.length !== expected.bytes)
        || (expected.mode !== undefined && snapshot.mode !== expected.mode)) {
        fail(`frozen bundle path changed before immutable staging: ${relative}`);
    }
    const durableRoot = ensureDirectoryNoFollow(path.resolve(destinationRoot));
    const { target } = containedTarget(durableRoot, relative, 'frozen bundle path');
    writeImmutableFile(target, snapshot.content, snapshot.mode);
}

function addExpectation(
    expected: Map<string, FrozenFileExpectation>,
    file: string,
    candidate: FrozenFileExpectation,
): void {
    const existing = expected.get(file);
    if (existing && (existing.sha256 !== candidate.sha256
        || (existing.bytes !== undefined && candidate.bytes !== undefined && existing.bytes !== candidate.bytes)
        || (existing.mode !== undefined && candidate.mode !== undefined && existing.mode !== candidate.mode))) {
        fail(`frozen bundle manifests disagree about ${file}`);
    }
    expected.set(file, {
        sha256: candidate.sha256,
        bytes: existing?.bytes ?? candidate.bytes,
        mode: existing?.mode ?? candidate.mode,
    });
}

export function stagePacketBundle(
    packet: FrozenCouncilPacket,
    sourceRoot: string,
    destination: string,
): void {
    const references = [
        packet.protocol_manifest,
        packet.variants.A,
        packet.variants.B,
        packet.rubric_manifest,
        packet.evidence_manifest,
        packet.runner_publication.manifest,
    ];
    const expected = new Map<string, FrozenFileExpectation>();
    for (const reference of references) {
        addExpectation(expected, reference.path, { sha256: reference.sha256 });
        const manifest = readContainedJson<ArtifactManifest>(
            sourceRoot, reference.path, reference.sha256, 'manifest path',
        );
        for (const entry of manifest.entries) {
            addExpectation(expected, entry.path, {
                sha256: entry.sha256,
                bytes: entry.bytes,
                mode: entry.mode,
            });
        }
    }
    for (const [file, binding] of [...expected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        stageFrozenFile(sourceRoot, destination, file, binding);
    }
    verifyFrozenPacket(packet, destination);
}

export function stageRatingOutputs(ratings: FrozenRatings, sourceRoot: string, destinationRoot: string): void {
    for (const record of ratings.ratings) {
        stageFrozenFile(sourceRoot, destinationRoot, record.execution_receipt.output_path, {
            sha256: record.execution_receipt.output_sha256,
        });
    }
}
