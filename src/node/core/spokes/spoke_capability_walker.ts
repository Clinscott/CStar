/**
 * BEAD-CSTAR-SPOKE-DISCOVERY-001 — F1 walker.
 *
 * Read-only enumeration of spoke-local skill manifests. Announce-only per
 * AGENTS.qmd §0 (Host-Native First) — the walker reports what exists; the
 * host agent executes via the SKILL.md it returns. The kernel never spawns.
 *
 * Design record: docs/beads/cstar-spoke-discovery-001.md
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { database } from '../../../tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';

export type SpokeSkillTier = 'PRIME' | 'SKILL' | 'WEAVE' | 'SPELL' | 'UNKNOWN';
export type SpokeSkillValidation = 'ok' | 'invalid' | 'quarantined';

export interface SpokeSkillManifest {
    id: string;
    bare_id: string;
    spoke_slug: string;
    spoke_root: string;
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
}

export interface WalkSpokeSkillsOptions {
    hubRegistryIds?: ReadonlySet<string>;
    includeQuarantined?: boolean;
}

const VALID_TIERS: ReadonlySet<string> = new Set(['PRIME', 'SKILL', 'WEAVE', 'SPELL']);
const BARE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

interface ParsedFrontmatter {
    frontmatter: Record<string, string>;
    body: string;
    error?: string;
}

function parseSkillFrontmatter(raw: string): ParsedFrontmatter {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) {
        return { frontmatter: {}, body: raw, error: 'no frontmatter block found' };
    }
    const yamlBlock = match[1];
    const body = match[2];
    const fm: Record<string, string> = {};
    const lines = yamlBlock.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }
        const idx = line.indexOf(':');
        if (idx === -1) {
            return { frontmatter: fm, body, error: `malformed frontmatter line: ${line}` };
        }
        const key = line.slice(0, idx).trim();
        if (!key) {
            return { frontmatter: fm, body, error: `empty key in frontmatter line: ${line}` };
        }
        let value = line.slice(idx + 1).trim();
        if (value.length >= 2) {
            const first = value.charAt(0);
            const last = value.charAt(value.length - 1);
            if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
                value = value.slice(1, -1);
            }
        }
        fm[key] = value;
    }
    return { frontmatter: fm, body };
}

interface BareIdValidation {
    ok: boolean;
    reason?: string;
}

function validateBareId(id: string): BareIdValidation {
    if (!id) {
        return { ok: false, reason: 'empty id' };
    }
    if (id.includes(':')) {
        return { ok: false, reason: 'colon reserved as spoke separator' };
    }
    if (!BARE_ID_RE.test(id)) {
        return { ok: false, reason: 'id must match /^[a-z0-9][a-z0-9_-]*$/i' };
    }
    return { ok: true };
}

function readSkillManifest(
    spoke: HallMountedSpokeRecord,
    bareId: string,
    skillMdPath: string,
    hubRegistryIds: ReadonlySet<string>,
): SpokeSkillManifest | null {
    let raw: string;
    try {
        raw = fs.readFileSync(skillMdPath, 'utf-8');
    } catch {
        return null;
    }

    const idValidation = validateBareId(bareId);
    const namespacedId = `${spoke.slug}:${bareId}`;
    const shadowsHubId = hubRegistryIds.has(bareId);

    const { frontmatter, error: parseError } = parseSkillFrontmatter(raw);

    const fmName = frontmatter.name ?? bareId;
    const fmDesc = frontmatter.description ?? '';
    const fmTierRaw = (frontmatter.tier ?? '').toUpperCase();
    const tier: SpokeSkillTier = VALID_TIERS.has(fmTierRaw)
        ? (fmTierRaw as SpokeSkillTier)
        : 'UNKNOWN';
    const risk = frontmatter.risk ?? 'unknown';

    let validation: SpokeSkillValidation = 'ok';
    let validationReason: string | undefined;

    if (spoke.trust_level === 'quarantined') {
        validation = 'quarantined';
        validationReason = 'spoke is quarantined';
    } else if (!idValidation.ok) {
        validation = 'invalid';
        validationReason = idValidation.reason;
    } else if (parseError !== undefined) {
        validation = 'invalid';
        validationReason = parseError;
    } else if (!frontmatter.name) {
        validation = 'invalid';
        validationReason = 'frontmatter missing required field: name';
    } else if (!frontmatter.description) {
        validation = 'invalid';
        validationReason = 'frontmatter missing required field: description';
    } else if (tier === 'UNKNOWN') {
        validation = 'invalid';
        validationReason = `unknown tier '${frontmatter.tier ?? ''}'`;
    }

    return {
        id: namespacedId,
        bare_id: bareId,
        spoke_slug: spoke.slug,
        spoke_root: spoke.root_path,
        authority_path: skillMdPath,
        name: fmName,
        description: fmDesc,
        tier,
        risk,
        frontmatter_raw: frontmatter,
        documentation: raw,
        validation,
        validation_reason: validationReason,
        shadows_hub_id: shadowsHubId,
    };
}

/**
 * Pure walker over a caller-supplied spoke record list. Test seam.
 *
 * Filters:
 * - drops spokes with `mount_status !== 'active'`
 * - drops quarantined spokes unless `options.includeQuarantined`
 * - skips spoke roots that do not exist on disk (filesystem drift; reported via the convenience wrapper, not here)
 * - skips skill directories whose name starts with `_` (archive convention)
 * @param spokes records to walk; supply the live `database.listHallMountedSpokes()` in production
 * @param options optional filters; see {@link WalkSpokeSkillsOptions}
 * @returns spoke skill manifests, stable-sorted by namespaced id
 */
export function walkSpokeSkillsForRecords(
    spokes: readonly HallMountedSpokeRecord[],
    options: WalkSpokeSkillsOptions = {},
): SpokeSkillManifest[] {
    const hubRegistryIds = options.hubRegistryIds ?? new Set<string>();
    const includeQuarantined = options.includeQuarantined ?? false;
    const out: SpokeSkillManifest[] = [];

    for (const spoke of spokes) {
        if (spoke.mount_status !== 'active') {
            continue;
        }
        if (!includeQuarantined && spoke.trust_level === 'quarantined') {
            continue;
        }

        const skillsDir = path.join(spoke.root_path, '.agents', 'skills');
        if (!fs.existsSync(skillsDir)) {
            continue;
        }

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const ent of entries) {
            if (!ent.isDirectory()) {
                continue;
            }
            if (ent.name.startsWith('_')) {
                continue;
            }
            const bareId = ent.name;
            const skillMdPath = path.join(skillsDir, bareId, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) {
                continue;
            }
            const manifest = readSkillManifest(spoke, bareId, skillMdPath, hubRegistryIds);
            if (manifest !== null) {
                out.push(manifest);
            }
        }
    }

    out.sort((left, right) => left.id.localeCompare(right.id));
    return out;
}

/**
 * Convenience wrapper. Reads `hall_mounted_spokes` via the kernel database,
 * optionally narrows to a single slug, and delegates to {@link walkSpokeSkillsForRecords}.
 *
 * Per Q5: a slug-targeted call still respects `includeQuarantined`. Without
 * that flag, quarantined spokes are dropped here too — quarantined surfaces
 * resolve through the per-id `cstar_skill_info` path in F3.
 * @param spokeSlug optional slug; when set, only that spoke's skills are walked
 * @param options optional filters; see {@link WalkSpokeSkillsOptions}
 * @returns spoke skill manifests, stable-sorted by namespaced id
 */
export function walkSpokeSkills(
    spokeSlug?: string,
    options: WalkSpokeSkillsOptions = {},
): SpokeSkillManifest[] {
    const allSpokes = database.listHallMountedSpokes();
    const spokes = spokeSlug !== undefined
        ? allSpokes.filter((s) => s.slug === spokeSlug)
        : allSpokes;
    return walkSpokeSkillsForRecords(spokes, options);
}

// ─────────────────────────────────────────────────────────────────────────
// F2 — journal walker (Q7).
// ─────────────────────────────────────────────────────────────────────────

export type SpokeJournalFileValidation = 'ok' | 'invalid' | 'missing' | 'drift';
export type SpokeJournalValidation = 'ok' | 'mount_status_drift' | 'spoke_not_found';

export interface SpokeJournalFile {
    present: boolean;
    path: string;
    mtime?: number;
    sha256?: string;
    size_bytes?: number;
    summary?: string;
    validation: SpokeJournalFileValidation;
    validation_reason?: string;
    drift_paths?: string[];
    open_tasks?: number;
    prominent_functions?: string[];
    last_entry_timestamp?: string;
}

export interface SpokeJournalReport {
    spoke: string;
    root_path: string;
    files: {
        memory_md: SpokeJournalFile;
        tasks_md: SpokeJournalFile;
        wireframe_md: SpokeJournalFile;
        dev_journal_md: SpokeJournalFile;
    };
    validation: SpokeJournalValidation;
}

interface FileStatSummary {
    mtime: number;
    sha256: string;
    size_bytes: number;
    content: string;
}

function readFileStat(absPath: string): FileStatSummary | null {
    if (!fs.existsSync(absPath)) {
        return null;
    }
    let stat: fs.Stats;
    let content: string;
    try {
        stat = fs.statSync(absPath);
        content = fs.readFileSync(absPath, 'utf-8');
    } catch {
        return null;
    }
    return {
        mtime: Math.floor(stat.mtimeMs / 1000),
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        size_bytes: stat.size,
        content,
    };
}

function extractFirstH1(content: string): string | undefined {
    for (const line of content.split(/\r?\n/)) {
        const m = /^#\s+(.+)$/.exec(line);
        if (m) {
            return m[1].trim();
        }
    }
    return undefined;
}

const MEMORY_SUMMARY_CAP = 280;

function makeMemorySummary(content: string): string | undefined {
    const h1 = extractFirstH1(content);
    if (h1 === undefined) {
        return undefined;
    }
    const lines = content.split(/\r?\n/);
    let foundH1 = false;
    const paragraph: string[] = [];
    for (const line of lines) {
        if (!foundH1) {
            if (/^#\s+/.test(line)) {
                foundH1 = true;
            }
            continue;
        }
        if (line.trim() === '') {
            if (paragraph.length > 0) {
                break;
            }
            continue;
        }
        if (/^#+\s+/.test(line)) {
            if (paragraph.length > 0) {
                break;
            }
            continue;
        }
        paragraph.push(line.trim());
    }
    const composed = paragraph.length > 0 ? `${h1} — ${paragraph.join(' ')}` : h1;
    if (composed.length <= MEMORY_SUMMARY_CAP) {
        return composed;
    }
    return `${composed.slice(0, MEMORY_SUMMARY_CAP - 3)}...`;
}

function countOpenTasks(content: string): number {
    const matches = content.match(/^- \[ \]/gm);
    return matches === null ? 0 : matches.length;
}

function extractProminentFunctions(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
        if (/^#{2,3}\s+Prominent Functions/i.test(line)) {
            inSection = true;
            continue;
        }
        if (!inSection) {
            continue;
        }
        if (/^#{1,3}\s+/.test(line)) {
            break;
        }
        const bullet = /^-\s+`([^`]+)`/.exec(line);
        if (bullet !== null) {
            out.push(bullet[1]);
        }
    }
    return out;
}

const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?Z?)?\b/g;

function findLastEntryTimestamp(content: string): string | undefined {
    const matches = content.match(ISO_DATE_RE);
    if (matches === null || matches.length === 0) {
        return undefined;
    }
    // ISO 8601 lexical order matches chronological order.
    return [...matches].sort().at(-1);
}

const MEMORY_PRIMARY = '.agent/memory.md';     // CorvusEye/AGENTS.md convention
const MEMORY_FALLBACK = '.agents/memory.md';   // CStar plural convention

function readMemoryFile(spokeRoot: string): SpokeJournalFile {
    const primaryAbs = path.join(spokeRoot, MEMORY_PRIMARY);
    const fallbackAbs = path.join(spokeRoot, MEMORY_FALLBACK);
    const primaryExists = fs.existsSync(primaryAbs);
    const fallbackExists = fs.existsSync(fallbackAbs);

    if (!primaryExists && !fallbackExists) {
        return { present: false, path: MEMORY_PRIMARY, validation: 'missing' };
    }

    const chosenRel = primaryExists ? MEMORY_PRIMARY : MEMORY_FALLBACK;
    const chosenAbs = primaryExists ? primaryAbs : fallbackAbs;
    const stat = readFileStat(chosenAbs);
    if (stat === null) {
        return { present: false, path: chosenRel, validation: 'missing' };
    }

    const file: SpokeJournalFile = {
        present: true,
        path: chosenRel,
        mtime: stat.mtime,
        sha256: stat.sha256,
        size_bytes: stat.size_bytes,
        summary: makeMemorySummary(stat.content),
        validation: 'ok',
    };

    if (primaryExists && fallbackExists) {
        file.validation = 'drift';
        file.validation_reason =
            `both ${MEMORY_PRIMARY} and ${MEMORY_FALLBACK} exist; spoke must pick one`;
        file.drift_paths = [MEMORY_PRIMARY, MEMORY_FALLBACK];
    }

    return file;
}

interface SimpleFileSpec {
    relPath: string;
    extras?: (content: string, file: SpokeJournalFile) => void;
}

function readSimpleJournalFile(spokeRoot: string, spec: SimpleFileSpec): SpokeJournalFile {
    const abs = path.join(spokeRoot, spec.relPath);
    const stat = readFileStat(abs);
    if (stat === null) {
        return { present: false, path: spec.relPath, validation: 'missing' };
    }
    const file: SpokeJournalFile = {
        present: true,
        path: spec.relPath,
        mtime: stat.mtime,
        sha256: stat.sha256,
        size_bytes: stat.size_bytes,
        summary: extractFirstH1(stat.content),
        validation: 'ok',
    };
    if (spec.extras !== undefined) {
        spec.extras(stat.content, file);
    }
    return file;
}

function missingJournalReport(slug: string, rootPath: string, validation: SpokeJournalValidation): SpokeJournalReport {
    const missing: Omit<SpokeJournalFile, 'path'> = { present: false, validation: 'missing' };
    return {
        spoke: slug,
        root_path: rootPath,
        files: {
            memory_md: { ...missing, path: MEMORY_PRIMARY },
            tasks_md: { ...missing, path: 'tasks.md' },
            wireframe_md: { ...missing, path: 'wireframe.md' },
            dev_journal_md: { ...missing, path: 'DEV_JOURNAL.md' },
        },
        validation,
    };
}

/**
 * Pure journal walker over a single spoke record. Reads the four AGENTS.md-mandated
 * files (memory.md / tasks.md / wireframe.md / DEV_JOURNAL.md), summarising each.
 *
 * Per Q7: memory.md is read from `.agent/` (CorvusEye convention) or `.agents/`
 * (CStar convention). If both exist, the entry is flagged with `validation: 'drift'`.
 *
 * Per Q8: a spoke whose `root_path` no longer exists on disk reports every file
 * as `missing` and the top-level validation as `mount_status_drift`. The walker
 * never mutates the spoke filesystem.
 * @param spoke registered Hall spoke record (any trust_level — listing is read-only)
 * @returns journal report; never throws on a well-formed input
 */
export function walkSpokeJournalForRecord(spoke: HallMountedSpokeRecord): SpokeJournalReport {
    if (!fs.existsSync(spoke.root_path)) {
        return missingJournalReport(spoke.slug, spoke.root_path, 'mount_status_drift');
    }
    return {
        spoke: spoke.slug,
        root_path: spoke.root_path,
        files: {
            memory_md: readMemoryFile(spoke.root_path),
            tasks_md: readSimpleJournalFile(spoke.root_path, {
                relPath: 'tasks.md',
                extras: (content, file) => {
                    file.open_tasks = countOpenTasks(content);
                },
            }),
            wireframe_md: readSimpleJournalFile(spoke.root_path, {
                relPath: 'wireframe.md',
                extras: (content, file) => {
                    file.prominent_functions = extractProminentFunctions(content);
                },
            }),
            dev_journal_md: readSimpleJournalFile(spoke.root_path, {
                relPath: 'DEV_JOURNAL.md',
                extras: (content, file) => {
                    file.last_entry_timestamp = findLastEntryTimestamp(content);
                },
            }),
        },
        validation: 'ok',
    };
}

/**
 * Convenience wrapper for the MCP `cstar_spoke_journal` tool. Resolves the
 * spoke by slug via `database.getHallMountedSpoke` and delegates to
 * {@link walkSpokeJournalForRecord}. Returns a `spoke_not_found` report when
 * the slug is not registered.
 * @param spokeSlug slug of a registered spoke
 * @returns journal report (or a `spoke_not_found` envelope when the slug is unknown)
 */
export function walkSpokeJournal(spokeSlug: string): SpokeJournalReport {
    const spoke = database.getHallMountedSpoke(spokeSlug);
    if (spoke === null) {
        return missingJournalReport(spokeSlug, '', 'spoke_not_found');
    }
    return walkSpokeJournalForRecord(spoke);
}

// Re-exported test helpers so the walker stays observable from unit tests
// without leaking private helpers across the module boundary.
export const __testing = {
    parseSkillFrontmatter,
    validateBareId,
    extractFirstH1,
    makeMemorySummary,
    countOpenTasks,
    extractProminentFunctions,
    findLastEntryTimestamp,
    readMemoryFile,
};
