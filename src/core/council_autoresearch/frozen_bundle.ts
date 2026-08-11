import fs from 'node:fs';
import path from 'node:path';
import {
    ARTIFACT_MANIFEST_MAX_ENTRIES,
    ARTIFACT_MANIFEST_MAX_FILE_BYTES,
    ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
    verifyArtifactManifest,
} from './artifact_manifest.js';
import type { ArtifactManifest, FrozenCouncilPacket, ManifestReference } from './contracts.js';
import {
    MAX_JSON_FILE_BYTES,
    assertExactObjectKeys,
    assertSha256,
    canonicalJson,
    fail,
    repairInterruptedImmutableWrite,
    sha256,
    writeImmutableFile,
} from './contracts.js';
import {
    assertFrozenDirectoriesUnchanged,
    assertPrivateExistingFrozenChain,
    boundedFrozenDirectoryNames,
    canonicalFrozenDirectory,
    canonicalFrozenPath,
    capturePrivateFrozenDirectory,
    compareFrozenPaths,
    createPrivateFrozenDestination,
    ensurePrivateFrozenChain,
    frozenDestinationTarget,
    frozenTarget,
    assertTrustedFrozenDestination,
    snapshotContainedFrozenFile,
    type ContainedFrozenSnapshot,
    type FrozenDirectoryIdentity,
} from './frozen_bundle_fs.js';
import { verifyFrozenPacketStructure } from './packet.js';
import { REQUIRED_RUNNER_PUBLICATION_PATHS } from './publication.js';
export interface FrozenFileExpectation {
    sha256: string;
    bytes: number;
    mode: 0o644 | 0o755;
}
interface FrozenPlanEntry extends FrozenFileExpectation {
    path: string;
    role: string;
}
interface FrozenBundlePlan {
    root: string;
    entries: FrozenPlanEntry[];
    files: Map<string, FrozenPlanEntry>;
    directories: Set<string>;
    maximumPhysicalNodes: number;
}
interface ClassifiedAlias {
    alias: string;
    targetStat: fs.BigIntStats;
    aliasStat: fs.BigIntStats;
    parent: FrozenDirectoryIdentity;
}
function validateExpectation(expected: FrozenFileExpectation, label: string): void {
    assertSha256(expected?.sha256, `${label}.sha256`);
    if (!Number.isSafeInteger(expected?.bytes) || expected.bytes < 0
        || expected.bytes > ARTIFACT_MANIFEST_MAX_FILE_BYTES) {
        fail(`${label}.bytes is invalid`);
    }
    if (expected.mode !== 0o644 && expected.mode !== 0o755) {
        fail(`${label}.mode must be canonical 0644 or 0755`);
    }
}

function loadFrozenManifest(
    root: string,
    reference: ManifestReference,
    label: string,
): { manifest: ArtifactManifest; snapshot: ContainedFrozenSnapshot } {
    assertExactObjectKeys(reference, ['path', 'sha256'], label);
    assertSha256(reference?.sha256, `${label}.sha256`);
    const relative = canonicalFrozenPath(reference.path, `${label}.path`);
    const snapshot = snapshotContainedFrozenFile(
        root, relative, `${label} manifest`, MAX_JSON_FILE_BYTES,
    );
    if (snapshot.rawMode !== 0o644) fail(`${label} manifest must use canonical mode 0644`);
    if (sha256(snapshot.content) !== reference.sha256) fail(`${label} file hash mismatch`);
    let manifest: ArtifactManifest;
    try {
        manifest = JSON.parse(snapshot.content.toString('utf8')) as ArtifactManifest;
        verifyArtifactManifest(manifest, root);
        for (const included of manifest.included_paths) {
            if (!manifest.entries.some((entry) => entry.path === included
                || entry.path.startsWith(`${included}/`))) {
                fail(`${label} manifest contains an empty included path`);
            }
        }
    } catch (error) {
        fail(`${label} manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { manifest, snapshot };
}

function packetReferences(packet: FrozenCouncilPacket): Array<{
    role: string;
    reference: ManifestReference;
}> {
    return [
        { role: 'contract_manifest', reference: packet.contract_manifest },
        { role: 'protocol_manifest', reference: packet.protocol_manifest },
        { role: 'variant_A', reference: packet.variants.A },
        { role: 'variant_B', reference: packet.variants.B },
        { role: 'rubric_manifest', reference: packet.rubric_manifest },
        { role: 'evidence_manifest', reference: packet.evidence_manifest },
        { role: 'runner_publication', reference: packet.runner_publication.manifest },
    ];
}

function assertProtocolBinding(packet: FrozenCouncilPacket, manifest: ArtifactManifest): void {
    const entries = new Map(manifest.entries.map((entry) => [entry.path, entry.sha256]));
    for (const expert of packet.council_order) {
        const protocolPath = packet.protocol_path_by_expert[expert];
        if (entries.get(protocolPath) !== packet.protocol_sha256_by_expert[expert]) {
            fail(`${expert} protocol path/digest is absent from the frozen protocol manifest`);
        }
    }
    if (entries.size !== packet.council_order.length) {
        fail('frozen protocol manifest contains unbound files');
    }
}

function assertRunnerBinding(packet: FrozenCouncilPacket, manifest: ArtifactManifest): void {
    const expectedPaths = [...REQUIRED_RUNNER_PUBLICATION_PATHS].sort(compareFrozenPaths);
    if (manifest.root_label !== 'runner-publication'
        || canonicalJson(manifest.included_paths) !== canonicalJson(expectedPaths)) {
        fail('frozen runner manifest must contain the exact canonical runner path set');
    }
    const files: Record<string, string> = {};
    for (const entry of manifest.entries) {
        if (entry.mode !== 0o644 || files[entry.path] !== undefined) {
            fail('frozen runner manifest must contain unique regular 0644 files');
        }
        files[entry.path] = entry.sha256;
    }
    if (canonicalJson(files) !== canonicalJson(packet.runner_publication.checkpoint.required_files)) {
        fail('frozen runner manifest does not match the publication checkpoint');
    }
}

function addPlanEntry(
    files: Map<string, FrozenPlanEntry>,
    nodes: Map<string, { path: string; kind: 'file' | 'directory' }>,
    candidate: FrozenPlanEntry,
    budget: { bytes: number },
): void {
    candidate.path = canonicalFrozenPath(candidate.path, `${candidate.role}.path`);
    validateExpectation(candidate, candidate.role);
    const segments = candidate.path.split('/');
    for (let index = 0; index < segments.length; index += 1) {
        const prefix = segments.slice(0, index + 1).join('/');
        const kind = index === segments.length - 1 ? 'file' : 'directory';
        const key = prefix.normalize('NFC').toLocaleLowerCase('en-US');
        const existing = nodes.get(key);
        if (existing && existing.path !== prefix) {
            fail(`frozen bundle contains a path or case collision: ${candidate.path}`);
        }
        if (existing && existing.kind !== kind) {
            fail(`frozen bundle contains a path/ancestor conflict: ${candidate.path}`);
        }
        if (existing && kind === 'file') {
            fail(`frozen bundle semantic roles overlap at ${candidate.path}`);
        }
        if (!existing && nodes.size >= ARTIFACT_MANIFEST_MAX_ENTRIES) {
            fail(`frozen bundle exceeds ${ARTIFACT_MANIFEST_MAX_ENTRIES} path nodes`);
        }
        nodes.set(key, { path: prefix, kind });
    }
    if (files.size >= ARTIFACT_MANIFEST_MAX_ENTRIES) {
        fail(`frozen bundle exceeds ${ARTIFACT_MANIFEST_MAX_ENTRIES} files`);
    }
    if (budget.bytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES - candidate.bytes) {
        fail(`frozen bundle exceeds ${ARTIFACT_MANIFEST_MAX_TOTAL_BYTES} total bytes`);
    }
    budget.bytes += candidate.bytes;
    files.set(candidate.path, candidate);
}

function planFrozenPacketBundle(packet: FrozenCouncilPacket, rootInput: string): FrozenBundlePlan {
    verifyFrozenPacketStructure(packet);
    const root = canonicalFrozenDirectory(rootInput, 'frozen bundle source');
    const files = new Map<string, FrozenPlanEntry>();
    const nodes = new Map<string, { path: string; kind: 'file' | 'directory' }>();
    const directories = new Set<string>();
    const loaded = new Map<string, ArtifactManifest>();
    const budget = { bytes: 0 };
    for (const { role, reference } of packetReferences(packet)) {
        const { manifest, snapshot } = loadFrozenManifest(root, reference, role);
        loaded.set(role, manifest);
        addPlanEntry(files, nodes, {
            path: reference.path,
            sha256: reference.sha256,
            bytes: snapshot.content.length,
            mode: 0o644,
            role: `${role} reference`,
        }, budget);
        for (const entry of manifest.entries) {
            addPlanEntry(files, nodes, {
                path: entry.path,
                sha256: entry.sha256,
                bytes: entry.bytes,
                mode: entry.mode as 0o644 | 0o755,
                role: `${role} entry`,
            }, budget);
        }
    }
    assertProtocolBinding(packet, loaded.get('protocol_manifest')!);
    assertRunnerBinding(packet, loaded.get('runner_publication')!);
    for (const file of files.keys()) {
        const segments = file.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            directories.add(segments.slice(0, index).join('/'));
        }
    }
    const entries = [...files.values()].sort((left, right) => compareFrozenPaths(left.path, right.path));
    return {
        root,
        entries,
        files,
        directories,
        maximumPhysicalNodes: directories.size + (files.size * 2),
    };
}

export function frozenPacketBundleEntries(
    packet: FrozenCouncilPacket,
    rootInput: string,
): ReadonlyArray<Readonly<FrozenFileExpectation & { path: string }>> {
    return Object.freeze(planFrozenPacketBundle(packet, rootInput).entries.map(
        ({ path: entryPath, sha256: digest, bytes, mode }) =>
            Object.freeze({ path: entryPath, sha256: digest, bytes, mode }),
    ));
}

function assertSnapshotMatches(
    snapshot: ContainedFrozenSnapshot,
    expected: FrozenFileExpectation,
    label: string,
    exactMode = false,
): void {
    const observedMode = exactMode ? snapshot.rawMode : snapshot.mode;
    if (snapshot.content.length !== expected.bytes || observedMode !== expected.mode
        || sha256(snapshot.content) !== expected.sha256) {
        fail(`${label} does not match the frozen expectation`);
    }
}

function sameFileStat(expected: fs.BigIntStats, actual: fs.BigIntStats): boolean {
    return (['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'] as const).every(
        (key) => expected[key] === actual[key],
    );
}

function classifyInterruptedAliases(plan: FrozenBundlePlan): Map<string, ClassifiedAlias> {
    const aliases = new Map<string, ClassifiedAlias>();
    const directoryNames = new Map<string, string[]>();
    const budget = { nodes: 0 };
    for (const entry of plan.entries) {
        const target = frozenTarget(plan.root, entry.path, 'frozen bundle destination path');
        let targetStat: fs.BigIntStats;
        try {
            targetStat = fs.lstatSync(target, { bigint: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
        }
        if (!targetStat.isFile() || targetStat.isSymbolicLink() || targetStat.nlink !== 2n) continue;
        const directory = path.dirname(target);
        let names = directoryNames.get(directory);
        if (!names) {
            names = boundedFrozenDirectoryNames(directory, budget, plan.maximumPhysicalNodes);
            directoryNames.set(directory, names);
        }
        const escaped = path.basename(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^${escaped}\\.tmp-[0-9]+-[a-f0-9-]{36}$`);
        const matches = names.filter((name) => pattern.test(name));
        if (matches.length !== 1) fail(`frozen bundle target has unexplained hard links: ${entry.path}`);
        const aliasPath = path.join(directory, matches[0]);
        const aliasStat = fs.lstatSync(aliasPath, { bigint: true });
        if (!aliasStat.isFile() || aliasStat.isSymbolicLink() || aliasStat.nlink !== 2n
            || aliasStat.dev !== targetStat.dev || aliasStat.ino !== targetStat.ino) {
            fail(`frozen bundle target has unexplained hard links: ${entry.path}`);
        }
        const aliasRelative = path.relative(plan.root, aliasPath).split(path.sep).join('/');
        if (plan.files.has(aliasRelative)) fail(`frozen bundle alias conflicts at ${aliasRelative}`);
        const snapshot = snapshotContainedFrozenFile(
            plan.root, entry.path, `frozen bundle interrupted target ${entry.path}`,
            ARTIFACT_MANIFEST_MAX_FILE_BYTES, 2,
        );
        assertSnapshotMatches(snapshot, entry, `frozen bundle interrupted target ${entry.path}`, true);
        const finalTarget = fs.lstatSync(target, { bigint: true });
        const finalAlias = fs.lstatSync(aliasPath, { bigint: true });
        if (!sameFileStat(targetStat, finalTarget) || !sameFileStat(aliasStat, finalAlias)) {
            fail(`frozen bundle target changed during alias classification: ${entry.path}`);
        }
        aliases.set(entry.path, {
            alias: aliasRelative,
            targetStat: finalTarget,
            aliasStat: finalAlias,
            parent: capturePrivateFrozenDirectory(directory, 'frozen bundle alias directory'),
        });
    }
    return aliases;
}

function repairClassifiedAlias(
    root: string,
    relative: string,
    classified: ClassifiedAlias,
    expected: FrozenFileExpectation,
): void {
    const target = frozenTarget(root, relative, 'frozen bundle destination path');
    const alias = frozenTarget(root, classified.alias, 'frozen bundle alias path');
    ensurePrivateFrozenChain(root, target);
    assertFrozenDirectoriesUnchanged(
        [classified.parent],
        [capturePrivateFrozenDirectory(path.dirname(target), 'frozen bundle alias directory')],
        'frozen bundle alias directory',
    );
    if (!sameFileStat(classified.targetStat, fs.lstatSync(target, { bigint: true }))
        || !sameFileStat(classified.aliasStat, fs.lstatSync(alias, { bigint: true }))) {
        fail(`frozen bundle alias changed before repair: ${relative}`);
    }
    repairInterruptedImmutableWrite(target, {
        digest: expected.sha256,
        mode: expected.mode,
    });
}

function assertDestinationInventory(
    plan: FrozenBundlePlan,
    requireComplete: boolean,
    repairAliases = new Map<string, ClassifiedAlias>(),
): void {
    const seen = new Set<string>();
    const aliasPaths = new Set([...repairAliases.values()].map(({ alias }) => alias));
    const budget = { nodes: 0 };
    const visited: Array<{ path: string; identity: FrozenDirectoryIdentity }> = [];
    const walk = (directory: string, relative: string): void => {
        const before = capturePrivateFrozenDirectory(directory, 'frozen bundle directory');
        visited.push({ path: directory, identity: before });
        const names = boundedFrozenDirectoryNames(
            directory, budget, plan.maximumPhysicalNodes,
        );
        for (const name of names) {
            const childRelative = relative ? `${relative}/${name}` : name;
            canonicalFrozenPath(childRelative, 'frozen bundle inventory path');
            const child = path.join(directory, name);
            const stat = fs.lstatSync(child);
            if (aliasPaths.has(childRelative)) continue;
            if (stat.isSymbolicLink()) {
                fail(`frozen bundle inventory contains a symbolic link: ${childRelative}`);
            }
            if (stat.isDirectory()) {
                if (!plan.directories.has(childRelative)) {
                    fail(`frozen bundle inventory contains an unexpected directory: ${childRelative}`);
                }
                walk(child, childRelative);
                continue;
            }
            if (!stat.isFile()) {
                fail(`frozen bundle inventory contains a special file: ${childRelative}`);
            }
            const expected = plan.files.get(childRelative);
            if (!expected) fail(`frozen bundle inventory contains an unexpected file: ${childRelative}`);
            const snapshot = snapshotContainedFrozenFile(
                plan.root,
                childRelative,
                `frozen bundle inventory ${childRelative}`,
                ARTIFACT_MANIFEST_MAX_FILE_BYTES,
                repairAliases.has(childRelative) ? 2 : 1,
            );
            assertSnapshotMatches(snapshot, expected, `frozen bundle inventory ${childRelative}`, true);
            seen.add(childRelative);
        }
        assertFrozenDirectoriesUnchanged(
            [before],
            [capturePrivateFrozenDirectory(directory, 'frozen bundle directory')],
            'frozen bundle directory',
        );
    };
    walk(plan.root, '');
    for (const directory of visited) {
        assertFrozenDirectoriesUnchanged(
            [directory.identity],
            [capturePrivateFrozenDirectory(directory.path, 'frozen bundle directory')],
            'frozen bundle directory',
        );
    }
    if (requireComplete && seen.size !== plan.entries.length) {
        fail('frozen bundle inventory is incomplete');
    }
}

function stagePlannedFile(
    sourceRoot: string,
    destinationRoot: string,
    entry: FrozenPlanEntry,
): { sha256: string; created: boolean } {
    const snapshot = snapshotContainedFrozenFile(
        sourceRoot,
        entry.path,
        `frozen bundle source ${entry.path}`,
    );
    assertSnapshotMatches(snapshot, entry, `frozen bundle source ${entry.path}`, true);
    const target = frozenTarget(destinationRoot, entry.path, 'frozen bundle destination path');
    return writeImmutableFile(target, snapshot.content, entry.mode);
}

export function stageFrozenFile(input: {
    sourceRoot: string;
    destinationRoot: string;
    relativePath: string;
    expected: FrozenFileExpectation;
}): { sha256: string; created: boolean } {
    const sourceRoot = canonicalFrozenDirectory(input.sourceRoot, 'frozen file source');
    const destination = frozenDestinationTarget(sourceRoot, input.destinationRoot);
    const relativePath = canonicalFrozenPath(input.relativePath, 'frozen file path');
    validateExpectation(input.expected, 'frozen file expectation');
    const snapshot = snapshotContainedFrozenFile(sourceRoot, relativePath, 'frozen file source');
    assertSnapshotMatches(snapshot, input.expected, 'frozen file source', true);
    const destinationRoot = createPrivateFrozenDestination(
        destination, 'frozen file destination', sourceRoot,
    );
    const target = frozenTarget(destinationRoot, relativePath, 'frozen file destination path');
    assertPrivateExistingFrozenChain(destinationRoot, target);
    const entry = { ...input.expected, path: relativePath, role: 'frozen file' };
    const aliases = classifyInterruptedAliases({
        root: destinationRoot,
        entries: [entry],
        files: new Map([[relativePath, entry]]),
        directories: new Set(),
        maximumPhysicalNodes: ARTIFACT_MANIFEST_MAX_ENTRIES * 2,
    });
    const classified = aliases.get(relativePath);
    if (classified) {
        repairClassifiedAlias(destinationRoot, relativePath, classified, input.expected);
    }
    ensurePrivateFrozenChain(destinationRoot, target);
    const result = writeImmutableFile(target, snapshot.content, input.expected.mode);
    const staged = snapshotContainedFrozenFile(
        destinationRoot, relativePath, 'frozen file destination',
    );
    assertSnapshotMatches(staged, input.expected, 'frozen file destination', true);
    return result;
}

export function stageFrozenPacketBundle(input: {
    packet: FrozenCouncilPacket;
    sourceRoot: string;
    destinationRoot: string;
}): void {
    const sourceRoot = canonicalFrozenDirectory(input.sourceRoot, 'frozen bundle source');
    const destination = frozenDestinationTarget(sourceRoot, input.destinationRoot);
    const plan = planFrozenPacketBundle(input.packet, sourceRoot);
    const destinationRoot = createPrivateFrozenDestination(
        destination, 'frozen bundle destination', sourceRoot,
    );
    for (const entry of plan.entries) {
        assertPrivateExistingFrozenChain(destinationRoot, frozenTarget(
            destinationRoot,
            entry.path,
            'frozen bundle destination path',
        ));
    }
    const destinationPlan = { ...plan, root: destinationRoot };
    const aliases = classifyInterruptedAliases(destinationPlan);
    assertDestinationInventory(destinationPlan, false, aliases);
    for (const entry of plan.entries) {
        const classified = aliases.get(entry.path);
        if (classified) repairClassifiedAlias(destinationRoot, entry.path, classified, entry);
    }
    for (const entry of plan.entries) {
        ensurePrivateFrozenChain(destinationRoot, frozenTarget(
            destinationRoot,
            entry.path,
            'frozen bundle destination path',
        ));
    }
    assertDestinationInventory(destinationPlan, false);
    for (const entry of plan.entries) stagePlannedFile(sourceRoot, destinationRoot, entry);
    verifyFrozenPacketBundle({ packet: input.packet, bundleRoot: destinationRoot });
}

export function verifyFrozenPacketBundle(input: {
    packet: FrozenCouncilPacket;
    bundleRoot: string;
}): void {
    assertTrustedFrozenDestination(input.bundleRoot);
    const bundleRoot = canonicalFrozenDirectory(input.bundleRoot, 'frozen bundle root');
    capturePrivateFrozenDirectory(bundleRoot, 'frozen bundle root');
    const plan = planFrozenPacketBundle(input.packet, bundleRoot);
    assertDestinationInventory(plan, true);
}
