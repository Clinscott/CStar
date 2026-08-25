import fs from 'node:fs';
import path from 'node:path';

import type { CodexHostPathIdentity } from '../../../types/worker_job.js';

const DRIFT = 'forge_codex_host_path_identity_drift';
const HARDLINK = 'forge_host_path_identity_hardlink_forbidden';

function absoluteCanonical(value: string): string {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) {
        throw new Error('forge_host_path_identity_not_canonical');
    }
    return value;
}

function statFields(stat: fs.Stats): { device: string; inode: string } {
    return { device: String(stat.dev), inode: String(stat.ino) };
}

function parentBinding(candidate: string): {
    parent_path: string;
    parent_resolved_path: string;
    parent_device: string;
    parent_inode: string;
} {
    const parent_path = path.dirname(candidate);
    const stat = fs.lstatSync(parent_path, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('forge_host_path_identity_parent_invalid');
    }
    const parent_resolved_path = fs.realpathSync(parent_path);
    if (parent_resolved_path !== parent_path) {
        throw new Error('forge_host_path_identity_parent_noncanonical');
    }
    const { device, inode } = statFields(stat);
    return { parent_path, parent_resolved_path, parent_device: device, parent_inode: inode };
}

function walkToCandidate(candidate: string): {
    stat: fs.Stats | null;
    existingParent: string;
    missingSuffix: string[];
} {
    const parsed = path.parse(candidate);
    let current = parsed.root;
    const segments = candidate.slice(parsed.root.length).split(path.sep).filter(Boolean);
    for (const [index, segment] of segments.entries()) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!stat) {
            return {
                stat: null,
                existingParent: path.dirname(current),
                missingSuffix: segments.slice(index),
            };
        }
        if (stat.isSymbolicLink()) throw new Error('forge_host_path_identity_symlink_forbidden');
        if (index < segments.length - 1 && !stat.isDirectory()) {
            throw new Error('forge_host_path_identity_parent_invalid');
        }
    }
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false }) ?? null;
    return { stat, existingParent: path.dirname(candidate), missingSuffix: [] };
}

function captureOne(candidateInput: string): CodexHostPathIdentity {
    const candidate = absoluteCanonical(candidateInput);
    const walked = walkToCandidate(candidate);
    if (!walked.stat) {
        const parent = parentBinding(walked.existingParent);
        return {
            path: candidate,
            state: 'missing',
            resolved_path: null,
            device: null,
            inode: null,
            nlink: null,
            ...parent,
            missing_suffix: walked.missingSuffix,
        };
    }
    const stat = walked.stat;
    const parent = parentBinding(path.dirname(candidate));
    const resolved_path = fs.realpathSync(candidate);
    if (resolved_path !== candidate) throw new Error('forge_host_path_identity_noncanonical');
    const { device, inode } = statFields(stat);
    if (stat.isFile() && stat.nlink !== 1) throw new Error(HARDLINK);
    return {
        path: candidate,
        state: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : (() => {
            throw new Error('forge_host_path_identity_type_invalid');
        })(),
        resolved_path,
        device,
        inode,
        nlink: stat.isFile() ? stat.nlink : null,
        ...parent,
        missing_suffix: [],
    };
}

export function captureForgeHostPathIdentities(
    targetPaths: string[],
    outputPaths: string[],
): CodexHostPathIdentity[] {
    return [...new Set([...targetPaths, ...outputPaths])]
        .sort()
        .map(captureOne);
}

function compareParent(binding: CodexHostPathIdentity): void {
    const stat = fs.lstatSync(binding.parent_path, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(DRIFT);
    const resolved = fs.realpathSync(binding.parent_path);
    const fields = statFields(stat);
    if (resolved !== binding.parent_resolved_path
        || fields.device !== binding.parent_device
        || fields.inode !== binding.parent_inode) throw new Error(DRIFT);
}

function assertMissing(binding: CodexHostPathIdentity): void {
    compareParent(binding);
    let current = binding.parent_path;
    for (const segment of binding.missing_suffix) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (stat) throw new Error(DRIFT);
    }
}

function assertExisting(binding: CodexHostPathIdentity, stat: fs.Stats): void {
    if (stat.isSymbolicLink() || (binding.state === 'file' && !stat.isFile())
        || (binding.state === 'directory' && !stat.isDirectory())) throw new Error(DRIFT);
    if (fs.realpathSync(binding.path) !== binding.resolved_path) throw new Error(DRIFT);
    const fields = statFields(stat);
    if (fields.device !== binding.device || fields.inode !== binding.inode
        || (binding.nlink !== null && stat.nlink !== binding.nlink)) throw new Error(DRIFT);
    compareParent(binding);
}

export function assertForgeHostPathIdentityBindings(
    bindings: CodexHostPathIdentity[],
): void {
    const seen = new Set<string>();
    for (const binding of bindings) {
        if (seen.has(binding.path)) throw new Error(DRIFT);
        seen.add(binding.path);
        absoluteCanonical(binding.path);
        const stat = fs.lstatSync(binding.path, { throwIfNoEntry: false });
        if (binding.state === 'missing') {
            if (stat) throw new Error(DRIFT);
            assertMissing(binding);
        } else {
            if (!stat) throw new Error(DRIFT);
            assertExisting(binding, stat);
        }
    }
}
