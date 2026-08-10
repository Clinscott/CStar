import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COUNCIL_AUTORESEARCH_SCHEMA = '2.1.0' as const;
export const COUNCIL_AUTORESEARCH_RUNNER = '2.1.0' as const;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const CANONICAL_COUNCIL = Object.freeze([
    'torvalds', 'karpathy', 'hamilton', 'shannon', 'dean', 'carmack',
    'sakaguchi', 'nomura', 'miyazaki', 'adams', 'wright', 'heineman',
    'sweeney', 'miyamoto', 'kojima', 'meier', 'linscott', 'brooks', 'parnas',
] as const);
export const COUNCIL_EXECUTION_INPUT_CHANNELS = Object.freeze([
    'packet', 'protocol', 'variant_a', 'variant_b', 'rubric', 'evidence', 'quarantine_policy',
] as const);
export const MAX_REGULAR_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_JSON_FILE_BYTES = 8 * 1024 * 1024;

export type Sha256 = string;
export type JsonObject = Record<string, unknown>;

export interface TokenPathQuarantine {
    status: 'quarantined';
    actionable: false;
    steering_allowed: false;
    observation_writes_allowed: false;
    independent_promotion_required: true;
}

export const TOKEN_PATH_QUARANTINE: TokenPathQuarantine = Object.freeze({
    status: 'quarantined',
    actionable: false,
    steering_allowed: false,
    observation_writes_allowed: false,
    independent_promotion_required: true,
});

export interface ArtifactEntry {
    path: string;
    mode: number;
    bytes: number;
    sha256: Sha256;
}

export interface ArtifactManifest {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    root_label: string;
    included_paths: string[];
    entries: ArtifactEntry[];
    manifest_sha256: Sha256;
}

export interface ManifestReference {
    path: string;
    sha256: Sha256;
}

export interface RunnerPublicationCheckpoint {
    repository: string;
    repository_url: string;
    branch: string;
    commit: string;
    required_files: Record<string, Sha256>;
    verified_remote_ref: string;
    checkpoint_sha256: Sha256;
}

export interface RunnerPublicationBinding {
    manifest: ManifestReference;
    checkpoint: RunnerPublicationCheckpoint;
}

export interface BlindMappingReveal {
    A: 'baseline' | 'candidate';
    B: 'baseline' | 'candidate';
    nonce: string;
}

export interface CouncilRatingPolicy {
    axes: string[];
    protected_axes: string[];
    rationale_minimum_characters: number;
    minimum_effective_ratings: number;
    p0: number;
    p1: number;
    nominal_alpha: number;
    nominal_beta: number;
}

export interface FrozenCouncilPacket {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    source_head: string;
    source_manifest_sha256: Sha256;
    governed_paths: string[];
    contract_manifest: ManifestReference;
    experiment_sha256: Sha256;
    council_order: string[];
    protocol_manifest: ManifestReference;
    protocol_path_by_expert: Record<string, string>;
    protocol_sha256_by_expert: Record<string, Sha256>;
    variants: { A: ManifestReference; B: ManifestReference };
    rubric_manifest: ManifestReference;
    evidence_manifest: ManifestReference;
    runner_publication: RunnerPublicationBinding;
    seed: string;
    derived_order: string[];
    blind_mapping_commitment_sha256: Sha256;
    execution_authority: {
        scheme: 'ed25519';
        public_key_pem: string;
        key_id_sha256: Sha256;
    };
    rating_policy: CouncilRatingPolicy;
    publication_subject: {
        repository: string;
        repository_url: string;
        branch: string;
        required_paths: string[];
        receipt_paths: {
            packet: string;
            ratings: string;
            reveal: string;
            decision: string;
        };
    };
    token_path: TokenPathQuarantine;
    packet_sha256: Sha256;
}

export function fail(message: string): never {
    throw new Error(message);
}

export function assertSha256(value: unknown, label: string): asserts value is Sha256 {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        fail(`${label} must be a lowercase SHA-256 digest`);
    }
}

export function assertRunId(value: unknown, label = 'run_id'): asserts value is string {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{7,127}$/.test(value)) {
        fail(`${label} must be a bounded lowercase identifier`);
    }
}

export function assertTokenPath(value: unknown, label = 'token_path'): asserts value is TokenPathQuarantine {
    if (!value || typeof value !== 'object') fail(`${label} is required`);
    assertExactObjectKeys(value, Object.keys(TOKEN_PATH_QUARANTINE), label);
    for (const [key, expected] of Object.entries(TOKEN_PATH_QUARANTINE)) {
        if ((value as Record<string, unknown>)[key] !== expected) {
            fail(`${label}.${key} must be ${JSON.stringify(expected)}`);
        }
    }
}

export function assertExactObjectKeys(value: unknown, keys: readonly string[], label: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
    const actual = Object.keys(value as Record<string, unknown>).sort();
    const expected = [...keys].sort();
    if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${label} contains unexpected or missing fields`);
}

export function assertCanonicalCouncil(value: unknown, label = 'council_order'): asserts value is string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        fail(`${label} must be the canonical 19-member Council`);
    }
    if (value.length !== CANONICAL_COUNCIL.length
        || new Set(value).size !== CANONICAL_COUNCIL.length
        || canonicalJson([...value].sort()) !== canonicalJson([...CANONICAL_COUNCIL].sort())) {
        fail(`${label} must cover the canonical 19-member Council exactly once`);
    }
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
        );
    }
    return value;
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Buffer): Sha256 {
    return createHash('sha256').update(value).digest('hex');
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

export function readRegularFileNoFollow(
    file: string,
    label = 'file',
    maxBytes = MAX_REGULAR_FILE_BYTES,
): Buffer {
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
        return content;
    } finally {
        fs.closeSync(descriptor);
    }
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

function existingImmutableDigest(target: string): Sha256 | undefined {
    try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
            fail(`immutable receipt target is not a single-link regular file: ${target}`);
        }
        return sha256File(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

export function writeImmutableJson(file: string, value: unknown): { sha256: Sha256; created: boolean } {
    const target = path.resolve(file);
    const directory = path.dirname(target);
    ensureDirectoryNoFollow(directory);
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const digest = sha256(serialized);
    const existing = existingImmutableDigest(target);
    if (existing !== undefined) {
        if (existing !== digest) fail(`immutable receipt conflicts at ${target}`);
        return { sha256: digest, created: false };
    }
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, serialized);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    let created = true;
    try {
        fs.linkSync(temporary, target);
        fsyncDirectory(directory);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || existingImmutableDigest(target) !== digest) throw error;
        created = false;
    } finally {
        fs.unlinkSync(temporary);
        fsyncDirectory(directory);
    }
    return { sha256: digest, created };
}

export function deterministicCouncilOrder(order: readonly string[], seed: string): string[] {
    if (seed.length < 8 || seed.length > 256) fail('seed must contain 8 to 256 characters');
    const result = [...order];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const limit = 0x1_0000_0000 - (0x1_0000_0000 % (index + 1));
        let attempt = 0;
        let value: number;
        do {
            value = createHash('sha256')
                .update(`${seed}\0${index}\0${attempt++}`)
                .digest()
                .readUInt32BE(0);
        } while (value >= limit);
        const swap = value % (index + 1);
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}
