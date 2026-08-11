import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COUNCIL_AUTORESEARCH_SCHEMA = '2.2.0' as const;
export const COUNCIL_AUTORESEARCH_RUNNER = '2.2.0' as const;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const MAX_BUFFERED_FILE_BYTES = 16 * 1024 * 1024;
export const CANONICAL_COUNCIL = Object.freeze([
    'torvalds', 'karpathy', 'hamilton', 'shannon', 'dean', 'carmack',
    'sakaguchi', 'nomura', 'miyazaki', 'adams', 'wright', 'heineman',
    'sweeney', 'miyamoto', 'kojima', 'meier', 'linscott', 'brooks', 'parnas',
] as const);

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
    remote_url_sha256: Sha256;
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
    contract_sha256: Sha256;
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
        branch: string;
        receipt_paths: {
            packet: string;
            ratings: string;
            mapping_reveal: string;
            decision: string;
        };
        required_paths: string[];
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

function sameInode(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function immutableTemporaryPattern(target: string): RegExp {
    const escaped = path.basename(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\.tmp-[0-9]+-[a-f0-9-]{36}$`);
}

/**
 * A no-replace immutable write commits when target is linked and its directory is
 * synced. A kill before the temporary alias is removed leaves the committed inode
 * with two links. Repair only that fully-accounted-for state; unexplained links
 * remain a fail-closed error.
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
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) return;
    if (targetStat.nlink === 1n) return;

    const directory = path.dirname(target);
    const pattern = immutableTemporaryPattern(target);
    const aliases = fs.readdirSync(directory)
        .filter((name) => pattern.test(name))
        .map((name) => path.join(directory, name))
        .filter((candidate) => {
            const stat = fs.lstatSync(candidate, { bigint: true });
            return !stat.isSymbolicLink() && stat.isFile() && sameInode(stat, targetStat);
        });
    if (BigInt(aliases.length) !== targetStat.nlink - 1n) {
        fail(`immutable target has unexplained hard links: ${target}`);
    }
    for (const alias of aliases) {
        const currentTarget = fs.lstatSync(target, { bigint: true });
        const currentAlias = fs.lstatSync(alias, { bigint: true });
        if (!sameInode(currentTarget, targetStat) || !sameInode(currentAlias, targetStat)) {
            fail(`immutable temporary alias changed during recovery: ${alias}`);
        }
        fs.unlinkSync(alias);
    }
    fsyncDirectory(directory);
    const repaired = fs.lstatSync(target, { bigint: true });
    if (!sameInode(repaired, targetStat) || repaired.nlink !== 1n) {
        fail(`immutable target could not be repaired safely: ${target}`);
    }
}

export function snapshotRegularFileNoFollow(file: string, label = 'file'): { content: Buffer; mode: number } {
    repairInterruptedImmutableWrite(file);
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    let descriptor: number;
    try {
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
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
        const linked = fs.lstatSync(file, { bigint: true });
        for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (before[key] !== after[key]) fail(`${label} changed while it was being read`);
        }
        if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n
            || linked.dev !== after.dev || linked.ino !== after.ino) {
            fail(`${label} path changed while it was being read`);
        }
        return { content, mode: Number(before.mode) & 0o777 };
    } finally {
        fs.closeSync(descriptor);
    }
}

export function readRegularFileNoFollow(file: string, label = 'file'): Buffer {
    return snapshotRegularFileNoFollow(file, label).content;
}

export function sha256File(file: string): Sha256 {
    repairInterruptedImmutableWrite(file);
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    let descriptor: number;
    try {
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
    } catch (error) {
        fail(`file could not be opened without following links: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n) fail(`${file} must be a single-link regular file`);
        const hash = createHash('sha256');
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        while (position < Number(before.size)) {
            const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, position);
            if (bytesRead === 0) fail(`${file} ended while it was being hashed`);
            hash.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const) {
            if (before[key] !== after[key]) fail(`${file} changed while it was being hashed`);
        }
        return hash.digest('hex');
    } finally {
        fs.closeSync(descriptor);
    }
}

export function readJson<T>(file: string): T {
    try {
        return JSON.parse(readRegularFileNoFollow(file, file).toString('utf8')) as T;
    } catch (error) {
        fail(`could not read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function resolveContained(root: string, input: string, label = 'path'): string {
    if (!input || input.includes('\0') || path.isAbsolute(input)) fail(`${label} must be a relative path`);
    const base = fs.realpathSync(root);
    const resolved = path.resolve(base, input);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) fail(`${label} escapes its root`);
    let canonical: string;
    try {
        canonical = fs.realpathSync(resolved);
    } catch (error) {
        fail(`${label} could not be resolved without links: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (canonical !== resolved) fail(`${label} traverses a symbolic link`);
    return resolved;
}

export function fsyncDirectory(directory: string): void {
    const descriptor = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
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

export function writeImmutableFile(file: string, content: Buffer, mode = 0o600): { sha256: Sha256; created: boolean } {
    const target = path.resolve(file);
    const directory = path.dirname(target);
    ensureDirectoryNoFollow(directory);
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) fail('immutable file mode is invalid');
    const digest = sha256(content);
    const existing = existingImmutableState(target);
    if (existing !== undefined) {
        if (existing.digest !== digest || existing.mode !== mode) fail(`immutable receipt conflicts at ${target}`);
        return { sha256: digest, created: false };
    }
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    let created = true;
    let committed = false;
    try {
        fs.writeFileSync(descriptor, content);
        fs.fchmodSync(descriptor, mode);
        fs.fsyncSync(descriptor);
        const temporaryStat = fs.fstatSync(descriptor, { bigint: true });
        fs.linkSync(temporary, target);
        fsyncDirectory(directory);
        const targetStat = fs.lstatSync(target, { bigint: true });
        if (targetStat.isSymbolicLink() || !targetStat.isFile()
            || targetStat.dev !== temporaryStat.dev || targetStat.ino !== temporaryStat.ino
            || (Number(targetStat.mode) & 0o777) !== mode) {
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
            fs.unlinkSync(temporary);
            fsyncDirectory(directory);
        } catch (error) {
            if (!committed && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            // The target link is the commit point. A later read repairs an exact
            // same-inode temporary alias if cleanup was interrupted or failed.
        }
    }
    return { sha256: digest, created };
}

export function writeImmutableJson(file: string, value: unknown): { sha256: Sha256; created: boolean } {
    return writeImmutableFile(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
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
