import fs from 'node:fs';
import path from 'node:path';

import { database } from '../../../tools/pennyone/intel/database.js';
import {
    readBoundedUtf8FileInside,
    resolveExistingPathInside,
} from '../../../tools/cstar-kernel-mcp/contracts/runtime.js';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import {
    verifyMountedSpokeAuthority,
    type SpokeAuthorityVerification,
    type VerifyMountedSpokeAuthorityResult,
} from './spoke_attachment_authority.js';
import type { MountTokenVerdict } from './spoke_authority.js';
import {
    __journalTesting,
    walkSpokeJournal,
    walkSpokeJournalForRecord,
} from './spoke_journal_walker.js';

export type SpokeSkillTier = 'PRIME' | 'SKILL' | 'WEAVE' | 'SPELL' | 'UNKNOWN';
export type SpokeSkillValidation = 'ok' | 'invalid' | 'quarantined';

export interface SpokeSkillManifest {
    id: string;
    bare_id: string;
    spoke_slug: string;
    authority_path: string;
    name: string;
    description: string;
    tier: SpokeSkillTier;
    risk: string;
    frontmatter_raw: Record<string, string>;
    documentation: string;
    validation: SpokeSkillValidation;
    validation_reason?: string;
    shadows_hub_id: boolean;
    authority_verification: SpokeAuthorityVerification;
    authority_failure_code?: string;
    mount_token: MountTokenVerdict;
}

export interface WalkSpokeSkillsOptions {
    hubRegistryIds?: ReadonlySet<string>;
    includeQuarantined?: boolean;
}

const VALID_TIERS: ReadonlySet<string> = new Set(['PRIME', 'SKILL', 'WEAVE', 'SPELL']);
const BARE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const MAX_SKILL_BYTES = 256 * 1024;
const MAX_SPOKE_SKILL_ENTRIES = 2_048;

function listBoundedSkillEntries(directoryPath: string): fs.Dirent[] {
    const entries: fs.Dirent[] = [];
    const directory = fs.opendirSync(directoryPath);
    try {
        let entry: fs.Dirent | null;
        while ((entry = directory.readSync()) !== null) {
            if (entries.length >= MAX_SPOKE_SKILL_ENTRIES) {
                throw new Error('spoke_skill_directory_entry_limit_exceeded');
            }
            entries.push(entry);
        }
    } finally {
        directory.closeSync();
    }
    return entries;
}

interface ParsedFrontmatter {
    frontmatter: Record<string, string>;
    body: string;
    error?: string;
}

function parseSkillFrontmatter(raw: string): ParsedFrontmatter {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) return { frontmatter: {}, body: raw, error: 'no frontmatter block found' };
    const frontmatter: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = line.indexOf(':');
        if (separator === -1) {
            return { frontmatter, body: match[2], error: `malformed frontmatter line: ${line}` };
        }
        const key = line.slice(0, separator).trim();
        if (!key) return { frontmatter, body: match[2], error: 'empty key in frontmatter line' };
        let value = line.slice(separator + 1).trim();
        if (value.length >= 2) {
            const first = value.at(0);
            const last = value.at(-1);
            if ((first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1);
        }
        frontmatter[key] = value;
    }
    return { frontmatter, body: match[2] };
}

function validateBareId(id: string): { ok: boolean; reason?: string } {
    if (!id) return { ok: false, reason: 'empty id' };
    if (id.includes(':')) return { ok: false, reason: 'colon reserved as spoke separator' };
    if (!BARE_ID_RE.test(id)) return { ok: false, reason: 'id must match the safe bare-id grammar' };
    return { ok: true };
}

function verifiedSpokeRoot(spoke: HallMountedSpokeRecord): {
    root: string;
    authority: VerifyMountedSpokeAuthorityResult;
} | null {
    const authority = verifyMountedSpokeAuthority(spoke);
    if (authority.authority_verification !== 'token_verified'
        && authority.authority_verification !== 'hall_attachment_verified') return null;
    try {
        return { root: fs.realpathSync(spoke.root_path), authority };
    } catch {
        return null;
    }
}

function readSkillManifest(
    spoke: HallMountedSpokeRecord,
    root: string,
    authority: VerifyMountedSpokeAuthorityResult,
    bareId: string,
    hubRegistryIds: ReadonlySet<string>,
): SpokeSkillManifest | null {
    const relativePath = path.posix.join('.agents', 'skills', bareId, 'SKILL.md');
    let raw: string;
    try {
        raw = readBoundedUtf8FileInside(root, path.join(root, relativePath), MAX_SKILL_BYTES).content;
    } catch {
        return null;
    }
    const idValidation = validateBareId(bareId);
    const parsed = parseSkillFrontmatter(raw);
    const tierValue = (parsed.frontmatter.tier ?? '').toUpperCase();
    const tier: SpokeSkillTier = VALID_TIERS.has(tierValue) ? tierValue as SpokeSkillTier : 'UNKNOWN';
    let validation: SpokeSkillValidation = 'ok';
    let validationReason: string | undefined;
    if (spoke.trust_level === 'quarantined') {
        validation = 'quarantined';
        validationReason = 'spoke is quarantined';
    } else if (!idValidation.ok) {
        validation = 'invalid';
        validationReason = idValidation.reason;
    } else if (parsed.error) {
        validation = 'invalid';
        validationReason = parsed.error;
    } else if (!parsed.frontmatter.name) {
        validation = 'invalid';
        validationReason = 'frontmatter missing required field: name';
    } else if (!parsed.frontmatter.description) {
        validation = 'invalid';
        validationReason = 'frontmatter missing required field: description';
    } else if (tier === 'UNKNOWN') {
        validation = 'invalid';
        validationReason = 'unknown tier';
    }
    return {
        id: `${spoke.slug}:${bareId}`,
        bare_id: bareId,
        spoke_slug: spoke.slug,
        authority_path: relativePath,
        name: parsed.frontmatter.name ?? bareId,
        description: parsed.frontmatter.description ?? '',
        tier,
        risk: parsed.frontmatter.risk ?? 'unknown',
        frontmatter_raw: parsed.frontmatter,
        documentation: raw,
        validation,
        validation_reason: validationReason,
        shadows_hub_id: hubRegistryIds.has(bareId),
        authority_verification: authority.authority_verification,
        ...(authority.failure_code ? { authority_failure_code: authority.failure_code } : {}),
        mount_token: authority.mount_token,
    };
}

export function walkSpokeSkillsForRecords(
    spokes: readonly HallMountedSpokeRecord[],
    options: WalkSpokeSkillsOptions = {},
): SpokeSkillManifest[] {
    const output: SpokeSkillManifest[] = [];
    for (const spoke of spokes) {
        if (spoke.mount_status !== 'active') continue;
        if (spoke.trust_level === 'quarantined' && options.includeQuarantined !== true) continue;
        const verified = verifiedSpokeRoot(spoke);
        if (!verified) continue;
        const root = verified.root;
        let skillsDirectory: string;
        try {
            skillsDirectory = resolveExistingPathInside(root, path.join(root, '.agents', 'skills'), 'directory');
        } catch {
            continue;
        }
        const entries = listBoundedSkillEntries(skillsDirectory);
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
            const manifest = readSkillManifest(
                spoke,
                root,
                verified.authority,
                entry.name,
                options.hubRegistryIds ?? new Set<string>(),
            );
            if (manifest) output.push(manifest);
        }
    }
    return output.sort((left, right) => left.id.localeCompare(right.id));
}

export function walkSpokeSkills(
    spokeSlug?: string,
    options: WalkSpokeSkillsOptions = {},
): SpokeSkillManifest[] {
    const rows = database.listHallMountedSpokes();
    return walkSpokeSkillsForRecords(
        spokeSlug === undefined ? rows : rows.filter((row) => row.slug === spokeSlug),
        options,
    );
}

export { walkSpokeJournal, walkSpokeJournalForRecord };
export type {
    SpokeJournalFile,
    SpokeJournalFileValidation,
    SpokeJournalReport,
    SpokeJournalValidation,
} from './spoke_journal_walker.js';

export const __testing = {
    parseSkillFrontmatter,
    validateBareId,
    ...__journalTesting,
};
