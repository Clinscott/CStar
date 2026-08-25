import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CORVUS_ESTATE_ROOT = path.resolve('/home/morderith/Corvus');
export const CORVUS_CSTAR_ROOT = path.resolve('/home/morderith/Corvus/CStar');
export const SPOKE_ATTACHMENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const ROOT_BINDING_SCHEMA = 'cstar.spoke_attachment_root_binding.v1';
const MAX_POLICY_BYTES = 1024 * 1024;

export interface SpokeAttachmentRootProof {
    canonical_root_path: string;
    canonical_slug: string;
    root_path_sha256: string;
    root_sha256: string;
    root_identity_sha256: string;
    root_device: string;
    root_inode: string;
    root_size: string;
    root_mode: string;
    policy_sha256: string;
    policy_path_sha256: string;
    nearest_agents_path: string;
    git_marker_path: string;
}

interface PolicyProof {
    path: string;
    pathSha256: string;
    sha256: string;
}

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

export function hashSpokeAttachmentRootPath(rootPath: string): string {
    return sha256(Buffer.from(rootPath, 'utf-8'));
}

function isInside(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative !== ''
        && relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative);
}

function sameObject(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.size === right.size
        && left.mode === right.mode;
}

function rootIdentity(stat: fs.BigIntStats): Omit<SpokeAttachmentRootProof,
    'canonical_root_path' | 'canonical_slug' | 'root_path_sha256' | 'root_sha256'
    | 'root_identity_sha256' | 'policy_sha256' | 'policy_path_sha256'
    | 'nearest_agents_path' | 'git_marker_path'> {
    return {
        root_device: stat.dev.toString(),
        root_inode: stat.ino.toString(),
        root_size: stat.size.toString(),
        root_mode: stat.mode.toString(),
    };
}

function rejectSymlinkSegments(root: string, candidate: string): void {
    const relative = path.relative(root, candidate);
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error('spoke_attachment_root_symlink_forbidden');
    }
}

function readPolicyFile(policyPath: string): PolicyProof {
    let before: fs.BigIntStats;
    try {
        before = fs.lstatSync(policyPath, { bigint: true });
    } catch {
        throw new Error('spoke_attachment_agents_invalid');
    }
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n
        || before.size < 1n || before.size > BigInt(MAX_POLICY_BYTES)) {
        throw new Error('spoke_attachment_agents_invalid');
    }
    let descriptor: number;
    try {
        descriptor = fs.openSync(
            policyPath,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
    } catch {
        throw new Error('spoke_attachment_agents_invalid');
    }
    try {
        const opened = fs.fstatSync(descriptor, { bigint: true });
        if (!sameObject(before, opened) || opened.nlink !== 1n || !opened.isFile()) {
            throw new Error('spoke_attachment_agents_changed_during_proof');
        }
        const bytes = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor, { bigint: true });
        if (!sameObject(opened, after) || BigInt(bytes.length) !== after.size) {
            throw new Error('spoke_attachment_agents_changed_during_proof');
        }
        return {
            path: policyPath,
            pathSha256: sha256(Buffer.from(policyPath, 'utf-8')),
            sha256: sha256(bytes),
        };
    } finally {
        fs.closeSync(descriptor);
    }
}

function findNearestAgents(root: string): PolicyProof {
    let current = root;
    while (isInside(current, CORVUS_ESTATE_ROOT) || current === CORVUS_ESTATE_ROOT) {
        const candidate = path.join(current, 'AGENTS.md');
        try {
            fs.accessSync(candidate, fs.constants.F_OK);
            return readPolicyFile(candidate);
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('spoke_attachment_')) throw error;
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') throw new Error('spoke_attachment_agents_invalid');
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    throw new Error('spoke_attachment_agents_missing');
}

function requireGitMarker(root: string): string {
    const marker = path.join(root, '.git');
    try {
        const stat = fs.lstatSync(marker);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
            throw new Error('spoke_attachment_git_marker_invalid');
        }
        if (stat.isFile() && stat.nlink !== 1) {
            throw new Error('spoke_attachment_git_marker_hardlink_forbidden');
        }
        return marker;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('spoke_attachment_git_marker_')) {
            throw error;
        }
        throw new Error('spoke_attachment_git_marker_missing');
    }
}

/** Prove one canonical repository root without reading or writing its source. */
export function proveSpokeAttachmentRoot(rootPath: string): SpokeAttachmentRootProof {
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        throw new Error('spoke_attachment_root_path_required');
    }
    if (rootPath !== rootPath.trim()) {
        throw new Error('spoke_attachment_root_path_not_canonical');
    }
    const raw = rootPath;
    if (!path.isAbsolute(raw)) throw new Error('spoke_attachment_root_not_absolute');
    const lexical = path.resolve(raw);
    if (raw !== lexical) throw new Error('spoke_attachment_root_path_not_canonical');
    if (!isInside(lexical, CORVUS_ESTATE_ROOT)) {
        throw new Error('spoke_attachment_root_outside_corvus');
    }
    if (lexical === CORVUS_CSTAR_ROOT || isInside(lexical, CORVUS_CSTAR_ROOT)) {
        throw new Error('spoke_attachment_root_is_cstar');
    }

    let before: fs.BigIntStats;
    let canonical: string;
    try {
        before = fs.lstatSync(lexical, { bigint: true });
        if (before.isSymbolicLink()) throw new Error('spoke_attachment_root_symlink_forbidden');
        if (!before.isDirectory()) throw new Error('spoke_attachment_root_not_directory');
        canonical = fs.realpathSync(lexical);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('spoke_attachment_root_')) throw error;
        throw new Error('spoke_attachment_root_missing');
    }
    if (canonical !== lexical) throw new Error('spoke_attachment_root_path_not_canonical');
    if (canonical === CORVUS_ESTATE_ROOT) throw new Error('spoke_attachment_root_is_hub');
    rejectSymlinkSegments(CORVUS_ESTATE_ROOT, canonical);

    const policy = findNearestAgents(canonical);
    const gitMarkerPath = requireGitMarker(canonical);
    const after = fs.lstatSync(canonical, { bigint: true });
    if (!sameObject(before, after) || !after.isDirectory()) {
        throw new Error('spoke_attachment_root_changed_during_proof');
    }
    const canonicalSlug = path.basename(canonical).toLocaleLowerCase('en-US');
    if (!SPOKE_ATTACHMENT_SLUG_PATTERN.test(canonicalSlug)) {
        throw new Error('spoke_attachment_canonical_slug_invalid');
    }
    const identity = rootIdentity(after);
    const rootIdentitySha256 = sha256(JSON.stringify(identity));
    const rootPathSha256 = hashSpokeAttachmentRootPath(canonical);
    const rootSha256 = sha256(JSON.stringify({
        schema: ROOT_BINDING_SCHEMA,
        root_path_sha256: rootPathSha256,
        root_identity_sha256: rootIdentitySha256,
        policy_path_sha256: policy.pathSha256,
        policy_sha256: policy.sha256,
    }));
    return {
        canonical_root_path: canonical,
        canonical_slug: canonicalSlug,
        root_path_sha256: rootPathSha256,
        root_sha256: rootSha256,
        root_identity_sha256: rootIdentitySha256,
        ...identity,
        policy_sha256: policy.sha256,
        policy_path_sha256: policy.pathSha256,
        nearest_agents_path: policy.path,
        git_marker_path: gitMarkerPath,
    };
}

export function assertSpokeAttachmentRootProofStable(proof: SpokeAttachmentRootProof): void {
    let current: SpokeAttachmentRootProof;
    try {
        current = proveSpokeAttachmentRoot(proof.canonical_root_path);
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code.startsWith('spoke_attachment_agents_')) {
            throw new Error('spoke_attachment_policy_bytes_drift');
        }
        if (code.startsWith('spoke_attachment_root_')) {
            throw new Error('spoke_attachment_root_object_replaced');
        }
        throw new Error('spoke_attachment_root_moved_or_drift');
    }
    if (current.policy_sha256 !== proof.policy_sha256
        || current.policy_path_sha256 !== proof.policy_path_sha256) {
        throw new Error('spoke_attachment_policy_bytes_drift');
    }
    if (current.root_identity_sha256 !== proof.root_identity_sha256
        || current.root_device !== proof.root_device
        || current.root_inode !== proof.root_inode
        || current.root_size !== proof.root_size
        || current.root_mode !== proof.root_mode) {
        throw new Error('spoke_attachment_root_object_replaced');
    }
    if (current.root_path_sha256 !== proof.root_path_sha256
        || current.root_sha256 !== proof.root_sha256
        || current.canonical_slug !== proof.canonical_slug) {
        throw new Error('spoke_attachment_root_moved_or_drift');
    }
}

export function assertExactSpokeAttachmentSlug(
    suppliedSlug: string,
    proof: SpokeAttachmentRootProof,
): void {
    if (typeof suppliedSlug !== 'string' || suppliedSlug !== proof.canonical_slug) {
        throw new Error('spoke_attachment_slug_root_mismatch');
    }
}

export function pathsOverlap(left: string, right: string): boolean {
    return left === right || isInside(left, right) || isInside(right, left);
}
