import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readBoundedUtf8FileInside } from '../../../tools/cstar-kernel-mcp/contracts/runtime.js';
import { SPOKE_PROFILE_DIR } from './spoke_projector.js';

export const SPOKE_CONTRACT_VERSION = 'retired';
export const IDENTITY_FILE = 'IDENTITY.json';
export const CSTAR_CONTRACT_FILE = 'CSTAR_CONTRACT.md';
export const CAPABILITIES_FILE = 'CAPABILITIES.md';
export const INTAKE_FILE = 'INTAKE.md';
export const HUB_ACK_FILE = 'HUB_ACK.json';
export const SPOKE_AUTHORITY_WRITE_RETIRED = 'spoke_authority_write_requires_verified_operator_attestation';

export type SpokeTrustLevel = 'trusted' | 'observe' | 'quarantined';
export type SpokeWritePolicy = 'read_write' | 'read_only';

export interface EstablishAuthorityOptions {
    slug: string;
    rootPath: string;
    hubRepoId: string;
    hubRoot: string;
    hubKernelVersion: string;
    trustLevel: SpokeTrustLevel;
    writePolicy: SpokeWritePolicy;
    existingHallToken?: string;
    rotateToken?: boolean;
    now?: Date;
}

export interface EstablishAuthorityResult {
    status: 'retired';
    rotated: false;
    metadataPatch: Record<string, never>;
    files: Record<string, never>;
}

export type MountTokenVerdict =
    | 'ok'
    | 'unproven'
    | 'mismatch'
    | 'identity_missing'
    | 'hall_missing'
    | 'unsafe_root'
    | 'identity_invalid';

export interface VerifyMountTokenResult {
    verdict: MountTokenVerdict;
    root_sha256: string;
    identity_present: boolean;
    reason: string;
}

function rootFingerprint(rootPath: string): string {
    return createHash('sha256').update(path.resolve(rootPath), 'utf-8').digest('hex');
}

function isPrivateHomePath(candidate: string): boolean {
    const home = path.resolve(os.homedir());
    const resolved = path.resolve(candidate);
    const relative = path.relative(home, resolved);
    if (relative === '') return true;
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return false;
    }
    return relative.split(path.sep)[0]?.startsWith('.') === true;
}

function safeRoot(rootPath: string): string | null {
    try {
        const lexical = path.resolve(rootPath);
        if (isPrivateHomePath(lexical)) return null;
        const stat = fs.lstatSync(lexical);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
        const canonical = fs.realpathSync(lexical);
        return canonical === lexical ? canonical : null;
    } catch {
        return null;
    }
}

/**
 * Verify the legacy token binding without exposing tokens or absolute paths.
 * The file read is bounded, no-follow, single-link, and contained by the
 * Hall-provided spoke root.
 */
export function verifyMountToken(
    spokeRootPath: string,
    hallToken: string | null | undefined,
): VerifyMountTokenResult {
    const fingerprint = rootFingerprint(spokeRootPath);
    const root = safeRoot(spokeRootPath);
    if (!root) {
        return { verdict: 'unsafe_root', root_sha256: fingerprint, identity_present: false, reason: 'spoke_root_not_canonical_directory' };
    }
    const normalizedHallToken = typeof hallToken === 'string' && hallToken.trim() ? hallToken.trim() : null;
    const identityPath = path.join(root, SPOKE_PROFILE_DIR, IDENTITY_FILE);
    if (!fs.existsSync(identityPath)) {
        return normalizedHallToken
            ? { verdict: 'identity_missing', root_sha256: fingerprint, identity_present: false, reason: 'identity_binding_missing' }
            : { verdict: 'unproven', root_sha256: fingerprint, identity_present: false, reason: 'legacy_binding_absent' };
    }
    let onDiskToken: string | null = null;
    try {
        const file = readBoundedUtf8FileInside(root, identityPath, 64 * 1024);
        const parsed = JSON.parse(file.content) as Record<string, unknown>;
        onDiskToken = typeof parsed.mount_token === 'string' && parsed.mount_token.trim()
            ? parsed.mount_token.trim() : null;
    } catch {
        return { verdict: 'identity_invalid', root_sha256: fingerprint, identity_present: true, reason: 'identity_binding_invalid' };
    }
    if (!onDiskToken && !normalizedHallToken) {
        return { verdict: 'unproven', root_sha256: fingerprint, identity_present: true, reason: 'legacy_binding_absent' };
    }
    if (!onDiskToken) {
        return { verdict: 'identity_missing', root_sha256: fingerprint, identity_present: true, reason: 'identity_token_missing' };
    }
    if (!normalizedHallToken) {
        return { verdict: 'hall_missing', root_sha256: fingerprint, identity_present: true, reason: 'hall_binding_missing' };
    }
    const onDisk = Buffer.from(onDiskToken, 'utf-8');
    const inHall = Buffer.from(normalizedHallToken, 'utf-8');
    const matches = onDisk.length === inHall.length && timingSafeEqual(onDisk, inHall);
    return matches
        ? { verdict: 'ok', root_sha256: fingerprint, identity_present: true, reason: 'mount_token_verified' }
        : { verdict: 'mismatch', root_sha256: fingerprint, identity_present: true, reason: 'mount_token_mismatch' };
}

/** Always fails before creating directories, tokens, contracts, or files. */
export function establishAuthority(_options: EstablishAuthorityOptions): never {
    throw new Error(SPOKE_AUTHORITY_WRITE_RETIRED);
}
