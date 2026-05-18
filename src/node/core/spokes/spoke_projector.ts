/**
 * Spoke projector — deterministic /init equivalent for newly-linked spokes.
 *
 * Runs synchronously during `cstar spoke link` (CLI + MCP). Walks the spoke
 * filesystem and produces:
 *
 *   - <spoke>/.cstar/SPOKE_PROFILE.md   (human-readable; mirrors CLAUDE.md)
 *   - <spoke>/.cstar/spoke_profile.json (machine-readable; Hermes-researcher index)
 *   - mounted-spokes metadata patch     (returned to caller for Hall write)
 *
 * Kernel-deterministic — no LLM. The host can later deepen narrative sections
 * via the host-native `spoke_init` skill (see .agents/skills/spoke_init/SKILL.md).
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SPOKE_PROJECTION_VERSION = '1.0';
export const SPOKE_PROFILE_DIR = '.cstar';
export const SPOKE_PROFILE_MD = 'SPOKE_PROFILE.md';
export const SPOKE_PROFILE_JSON = 'spoke_profile.json';

export type SpokeStackKind = 'node' | 'rust' | 'python' | 'go' | 'bun' | 'deno' | 'mixed' | 'unknown';

export interface SpokeStackSignal {
    kind: SpokeStackKind;
    detector: string;
    name?: string;
    version?: string;
}

export interface SpokeBuildSurface {
    package_manager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'cargo' | 'poetry' | 'pip' | 'go' | 'unknown';
    scripts: Record<string, string>;
    makefile_targets: string[];
    justfile_recipes: string[];
}

export interface SpokeCapabilityEntry {
    kind: 'skill' | 'workflow' | 'script' | 'make_target' | 'just_recipe';
    bare_id: string;
    namespaced_id: string;
    source_path: string;
    description?: string;
}

export interface SpokeKnowledgeEntry {
    path: string;
    category: 'architecture' | 'agents' | 'docs' | 'readme' | 'changelog' | 'license' | 'other';
    size_bytes: number;
    mtime_ms: number;
    summary: string;
}

export interface SpokeGitSnapshot {
    available: boolean;
    head?: string;
    branch?: string;
    remote?: string;
    recent_commits?: Array<{ sha: string; subject: string; date: string }>;
    contributors?: string[];
    error?: string;
}

export interface SpokeHermesDigestEntry {
    path: string;
    date?: string;
    size_bytes: number;
    mtime_ms: number;
    summary: string;
}

export interface SpokeHermesProfile {
    available: boolean;
    profile_root?: string;
    vault_root?: string;
    config_path?: string;
    interest_profile_path?: string;
    project?: string;
    model_default?: string;
    model_synthesis?: string;
    daily_brief_time?: string;
    artifact_pattern?: string;
    output_dir?: string;
    refresh_interval_hours?: number;
    lanes?: string[];
    current_priorities?: string[];
    key_questions?: string[];
    today_digest_path?: string;
    today_digest_present?: boolean;
    recent_digests: SpokeHermesDigestEntry[];
    next_step?: string;
    error?: string;
}

export interface SpokeProjection {
    version: string;
    slug: string;
    root_path: string;
    projected_at: number;
    profile_md_path: string;
    profile_json_path: string;
    profile_md_sha256: string;
    profile_json_sha256: string;
    stack: SpokeStackSignal[];
    primary_stack: SpokeStackKind;
    build: SpokeBuildSurface;
    capabilities: SpokeCapabilityEntry[];
    knowledge_index: SpokeKnowledgeEntry[];
    git: SpokeGitSnapshot;
    hermes: SpokeHermesProfile;
    counts: {
        skills: number;
        scripts: number;
        make_targets: number;
        just_recipes: number;
        knowledge_entries: number;
        recent_commits: number;
        contributors: number;
        hermes_lanes: number;
        hermes_recent_digests: number;
    };
}

export interface ProjectSpokeOptions {
    slug: string;
    rootPath: string;
    knowledgeDocLimit?: number;
    knowledgeSummaryChars?: number;
    recentCommitLimit?: number;
    hermesProfilesRoot?: string;
    hermesDigestRoot?: string;
    hermesRecentDays?: number;
    now?: Date;
}

export interface ProjectSpokeResult {
    projection: SpokeProjection;
    metadataPatch: Record<string, unknown>;
}

const KNOWLEDGE_DOC_LIMIT_DEFAULT = 30;
const KNOWLEDGE_SUMMARY_CHARS_DEFAULT = 240;
const RECENT_COMMIT_LIMIT_DEFAULT = 10;
const SKILL_TIER_RE = /^[A-Z_]+$/;

function tryReadJson(file: string): Record<string, unknown> | null {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function tryReadText(file: string, maxBytes = 1024 * 1024): string | null {
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) {
            return null;
        }
        if (stat.size > maxBytes) {
            const fd = fs.openSync(file, 'r');
            try {
                const buf = Buffer.alloc(maxBytes);
                fs.readSync(fd, buf, 0, maxBytes, 0);
                return buf.toString('utf-8');
            } finally {
                fs.closeSync(fd);
            }
        }
        return fs.readFileSync(file, 'utf-8');
    } catch {
        return null;
    }
}

function detectStack(rootPath: string): SpokeStackSignal[] {
    const signals: SpokeStackSignal[] = [];
    const pkgJson = tryReadJson(path.join(rootPath, 'package.json'));
    if (pkgJson !== null) {
        const isBun = fs.existsSync(path.join(rootPath, 'bun.lockb')) || fs.existsSync(path.join(rootPath, 'bun.lock'));
        signals.push({
            kind: isBun ? 'bun' : 'node',
            detector: 'package.json',
            name: typeof pkgJson.name === 'string' ? pkgJson.name : undefined,
            version: typeof pkgJson.version === 'string' ? pkgJson.version : undefined,
        });
    }
    if (fs.existsSync(path.join(rootPath, 'deno.json')) || fs.existsSync(path.join(rootPath, 'deno.jsonc'))) {
        signals.push({ kind: 'deno', detector: 'deno.json' });
    }
    const cargoToml = tryReadText(path.join(rootPath, 'Cargo.toml'));
    if (cargoToml !== null) {
        const nameMatch = /^\s*name\s*=\s*"([^"]+)"/m.exec(cargoToml);
        const versionMatch = /^\s*version\s*=\s*"([^"]+)"/m.exec(cargoToml);
        signals.push({
            kind: 'rust',
            detector: 'Cargo.toml',
            name: nameMatch?.[1],
            version: versionMatch?.[1],
        });
    }
    const pyproject = tryReadText(path.join(rootPath, 'pyproject.toml'));
    if (pyproject !== null) {
        const nameMatch = /^\s*name\s*=\s*"([^"]+)"/m.exec(pyproject);
        const versionMatch = /^\s*version\s*=\s*"([^"]+)"/m.exec(pyproject);
        signals.push({
            kind: 'python',
            detector: 'pyproject.toml',
            name: nameMatch?.[1],
            version: versionMatch?.[1],
        });
    } else if (fs.existsSync(path.join(rootPath, 'requirements.txt')) || fs.existsSync(path.join(rootPath, 'setup.py'))) {
        signals.push({ kind: 'python', detector: 'requirements.txt|setup.py' });
    }
    const goMod = tryReadText(path.join(rootPath, 'go.mod'));
    if (goMod !== null) {
        const moduleMatch = /^\s*module\s+(\S+)/m.exec(goMod);
        signals.push({ kind: 'go', detector: 'go.mod', name: moduleMatch?.[1] });
    }
    return signals;
}

function pickPrimaryStack(signals: readonly SpokeStackSignal[]): SpokeStackKind {
    if (signals.length === 0) {
        return 'unknown';
    }
    if (signals.length === 1) {
        return signals[0].kind;
    }
    return 'mixed';
}

function pickPackageManager(rootPath: string, signals: readonly SpokeStackSignal[]): SpokeBuildSurface['package_manager'] {
    if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(rootPath, 'bun.lockb')) || fs.existsSync(path.join(rootPath, 'bun.lock'))) return 'bun';
    if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) return 'npm';
    if (signals.some((s) => s.kind === 'rust')) return 'cargo';
    if (fs.existsSync(path.join(rootPath, 'poetry.lock'))) return 'poetry';
    if (signals.some((s) => s.kind === 'python')) return 'pip';
    if (signals.some((s) => s.kind === 'go')) return 'go';
    if (signals.some((s) => s.kind === 'node' || s.kind === 'bun')) return 'npm';
    return 'unknown';
}

function extractScripts(rootPath: string): Record<string, string> {
    const pkg = tryReadJson(path.join(rootPath, 'package.json'));
    if (pkg === null) {
        return {};
    }
    const scripts = pkg.scripts;
    if (scripts === null || scripts === undefined || typeof scripts !== 'object') {
        return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(scripts as Record<string, unknown>)) {
        if (typeof v === 'string') {
            out[k] = v;
        }
    }
    return out;
}

function extractMakefileTargets(rootPath: string): string[] {
    const candidates = ['Makefile', 'makefile', 'GNUmakefile'];
    for (const candidate of candidates) {
        const text = tryReadText(path.join(rootPath, candidate));
        if (text === null) continue;
        const targets = new Set<string>();
        const re = /^([A-Za-z0-9_./-]+)\s*:/gm;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            const name = match[1];
            if (name.startsWith('.')) continue;
            if (name.includes('=')) continue;
            targets.add(name);
        }
        return Array.from(targets).sort();
    }
    return [];
}

function extractJustfileRecipes(rootPath: string): string[] {
    const candidates = ['justfile', 'Justfile', '.justfile'];
    for (const candidate of candidates) {
        const text = tryReadText(path.join(rootPath, candidate));
        if (text === null) continue;
        const recipes = new Set<string>();
        const re = /^([a-zA-Z0-9_-]+)(?:\s+[^:]*)?:/gm;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            recipes.add(match[1]);
        }
        return Array.from(recipes).sort();
    }
    return [];
}

function inventoryCapabilities(slug: string, rootPath: string, build: SpokeBuildSurface): SpokeCapabilityEntry[] {
    const out: SpokeCapabilityEntry[] = [];
    const skillsDir = path.join(rootPath, '.agents', 'skills');
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
        for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
            const skillMd = path.join(skillsDir, ent.name, 'SKILL.md');
            if (!fs.existsSync(skillMd)) continue;
            const raw = tryReadText(skillMd, 16 * 1024) ?? '';
            const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(raw);
            let description: string | undefined;
            if (fmMatch !== null) {
                const descMatch = /^description:\s*(.+?)\s*$/m.exec(fmMatch[1]);
                description = descMatch?.[1];
                const tierMatch = /^tier:\s*([A-Za-z_]+)\s*$/m.exec(fmMatch[1]);
                if (tierMatch !== null && !SKILL_TIER_RE.test(tierMatch[1])) {
                    // tier present but malformed — still surface the skill
                }
            }
            out.push({
                kind: 'skill',
                bare_id: ent.name,
                namespaced_id: `${slug}:${ent.name}`,
                source_path: path.relative(rootPath, skillMd),
                description,
            });
        }
    }
    const workflowsDir = path.join(rootPath, '.agents', 'workflows');
    if (fs.existsSync(workflowsDir) && fs.statSync(workflowsDir).isDirectory()) {
        for (const ent of fs.readdirSync(workflowsDir, { withFileTypes: true })) {
            if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
            const bareId = ent.name.slice(0, -3);
            out.push({
                kind: 'workflow',
                bare_id: bareId,
                namespaced_id: `${slug}:${bareId}`,
                source_path: path.relative(rootPath, path.join(workflowsDir, ent.name)),
            });
        }
    }
    for (const [name, cmd] of Object.entries(build.scripts)) {
        out.push({
            kind: 'script',
            bare_id: name,
            namespaced_id: `${slug}:script/${name}`,
            source_path: 'package.json',
            description: cmd,
        });
    }
    for (const target of build.makefile_targets) {
        out.push({
            kind: 'make_target',
            bare_id: target,
            namespaced_id: `${slug}:make/${target}`,
            source_path: 'Makefile',
        });
    }
    for (const recipe of build.justfile_recipes) {
        out.push({
            kind: 'just_recipe',
            bare_id: recipe,
            namespaced_id: `${slug}:just/${recipe}`,
            source_path: 'justfile',
        });
    }
    out.sort((a, b) => a.namespaced_id.localeCompare(b.namespaced_id));
    return out;
}

function categorizeKnowledgeFile(rel: string): SpokeKnowledgeEntry['category'] {
    const lower = rel.toLowerCase();
    if (lower.endsWith('readme.md') || lower.endsWith('readme.qmd') || lower === 'readme') return 'readme';
    if (lower.endsWith('changelog.md') || lower.endsWith('changelog')) return 'changelog';
    if (lower.endsWith('license') || lower.endsWith('license.md') || lower.endsWith('license.txt')) return 'license';
    if (lower.includes('architecture')) return 'architecture';
    if (lower.endsWith('agents.md') || lower.endsWith('agents.qmd') || lower.endsWith('claude.md') || lower.endsWith('gemini.md') || lower.endsWith('codex.md')) return 'agents';
    if (lower.startsWith('docs/') || lower.startsWith('doc/')) return 'docs';
    return 'other';
}

function summarizeText(raw: string, maxChars: number): string {
    const stripped = raw
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m, '')
        .replace(/^#+\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (stripped.length <= maxChars) return stripped;
    return `${stripped.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildKnowledgeIndex(rootPath: string, limit: number, summaryChars: number): SpokeKnowledgeEntry[] {
    const out: SpokeKnowledgeEntry[] = [];
    const seenPaths = new Set<string>();
    const candidateRoots = [
        '',
        'docs',
        'doc',
        '.agents',
    ];
    for (const dir of candidateRoots) {
        const absDir = dir === '' ? rootPath : path.join(rootPath, dir);
        if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) continue;
        const stack: string[] = [absDir];
        while (stack.length > 0 && out.length < limit) {
            const current = stack.pop() as string;
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(current, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const ent of entries) {
                if (out.length >= limit) break;
                if (ent.name.startsWith('.') && ent.name !== '.agents') continue;
                if (ent.name === 'node_modules' || ent.name === '.venv' || ent.name === 'dist' || ent.name === 'build' || ent.name === 'target') continue;
                const abs = path.join(current, ent.name);
                if (ent.isDirectory()) {
                    if (dir === '' && abs !== path.join(rootPath, 'docs') && abs !== path.join(rootPath, 'doc') && abs !== path.join(rootPath, '.agents')) {
                        // when scanning rootPath, only descend into docs/.agents (handled by candidateRoots)
                        continue;
                    }
                    stack.push(abs);
                    continue;
                }
                if (!ent.isFile()) continue;
                if (!/\.(md|mdx|qmd|rst|txt)$/i.test(ent.name)) continue;
                const rel = path.relative(rootPath, abs).replace(/\\/g, '/');
                if (seenPaths.has(rel)) continue;
                seenPaths.add(rel);
                let stat: fs.Stats;
                try {
                    stat = fs.statSync(abs);
                } catch {
                    continue;
                }
                if (stat.size === 0 || stat.size > 512 * 1024) continue;
                const raw = tryReadText(abs, 64 * 1024) ?? '';
                out.push({
                    path: rel,
                    category: categorizeKnowledgeFile(rel),
                    size_bytes: stat.size,
                    mtime_ms: Math.floor(stat.mtimeMs),
                    summary: summarizeText(raw, summaryChars),
                });
            }
        }
        if (out.length >= limit) break;
    }
    out.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.path.localeCompare(b.path);
    });
    return out.slice(0, limit);
}

function expandHomeRelative(input: string): string {
    if (input.startsWith('~/')) {
        return path.join(os.homedir(), input.slice(2));
    }
    if (input === '~') {
        return os.homedir();
    }
    return input;
}

interface HermesYamlConfig {
    name?: string;
    project?: string;
    model_default?: string;
    model_synthesis?: string;
    daily_brief_time?: string;
    artifact_pattern?: string;
    output_dir?: string;
    refresh_interval_hours?: number;
}

function parseHermesConfigYaml(raw: string): HermesYamlConfig {
    const out: HermesYamlConfig = {};
    const lines = raw.split(/\r?\n/);
    let section: string | null = null;
    const sectionRe = /^([a-z_][a-z0-9_]*)\s*:\s*$/i;
    const kvRe = /^(\s*)([a-z_][a-z0-9_]*)\s*:\s*(.*?)\s*$/i;
    const stripQuotes = (v: string): string => {
        const trimmed = v.replace(/\s*#.*$/, '').trim();
        if (trimmed.length >= 2) {
            const f = trimmed.charAt(0);
            const l = trimmed.charAt(trimmed.length - 1);
            if ((f === '"' && l === '"') || (f === '\'' && l === '\'')) {
                return trimmed.slice(1, -1);
            }
        }
        return trimmed;
    };
    for (const line of lines) {
        if (line.trim().startsWith('#') || line.trim() === '') continue;
        if (!line.startsWith(' ') && !line.startsWith('\t')) {
            const m = sectionRe.exec(line);
            if (m !== null) {
                section = m[1];
                continue;
            }
            section = null;
        }
        const kv = kvRe.exec(line);
        if (kv === null) continue;
        const indent = kv[1].length;
        const key = kv[2];
        const value = stripQuotes(kv[3]);
        if (value === '') continue;
        if (section === 'profile' && indent > 0) {
            if (key === 'name') out.name = value;
            else if (key === 'project') out.project = value;
        } else if (section === 'model' && indent > 0) {
            if (key === 'default') out.model_default = value;
            else if (key === 'synthesis') out.model_synthesis = value;
        } else if (section === 'research' && indent > 0) {
            if (key === 'daily_brief_time') out.daily_brief_time = value;
            else if (key === 'artifact_pattern') out.artifact_pattern = value;
            else if (key === 'output_dir') out.output_dir = expandHomeRelative(value);
            else if (key === 'refresh_interval_hours') {
                const n = Number.parseFloat(value);
                if (Number.isFinite(n)) out.refresh_interval_hours = n;
            }
        }
    }
    return out;
}

function readInterestProfile(file: string): { lanes?: string[]; current_priorities?: string[]; key_questions?: string[]; project?: string } {
    const raw = tryReadText(file, 256 * 1024);
    if (raw === null) return {};
    let parsed: Record<string, unknown>;
    try {
        const json = JSON.parse(raw);
        if (json === null || typeof json !== 'object') return {};
        parsed = json as Record<string, unknown>;
    } catch {
        return {};
    }
    // Existing data has known typos: ' lanes' (leading space) and 'key_contraints'.
    // Normalize keys via trim() so lookups still work.
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        normalized[k.trim()] = v;
    }
    const out: { lanes?: string[]; current_priorities?: string[]; key_questions?: string[]; project?: string } = {};
    if (Array.isArray(normalized.lanes)) {
        out.lanes = normalized.lanes.filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(normalized.current_priorities)) {
        out.current_priorities = normalized.current_priorities.filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(normalized.key_questions)) {
        out.key_questions = normalized.key_questions.filter((x): x is string => typeof x === 'string');
    }
    if (typeof normalized.project === 'string') {
        out.project = normalized.project;
    }
    return out;
}

function formatDateYmd(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function applyArtifactPattern(pattern: string, slug: string, dateStr: string): string {
    return pattern
        .replace(/%Y-%m-%d/g, dateStr)
        .replace(/%Y/g, dateStr.slice(0, 4))
        .replace(/%m/g, dateStr.slice(5, 7))
        .replace(/%d/g, dateStr.slice(8, 10))
        .replace(/<spoke>/g, slug)
        .replace(/<slug>/g, slug);
}

function findRecentDigests(digestDir: string, slug: string, recentDays: number, now: Date, summaryChars: number): SpokeHermesDigestEntry[] {
    if (!fs.existsSync(digestDir) || !fs.statSync(digestDir).isDirectory()) return [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(digestDir, { withFileTypes: true });
    } catch {
        return [];
    }
    const cutoff = now.getTime() - recentDays * 24 * 60 * 60 * 1000;
    const dailyRe = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-daily-(\\d{4}-\\d{2}-\\d{2})\\.md$`);
    const out: SpokeHermesDigestEntry[] = [];
    for (const ent of entries) {
        if (!ent.isFile()) continue;
        const m = dailyRe.exec(ent.name);
        if (m === null) continue;
        const abs = path.join(digestDir, ent.name);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(abs);
        } catch {
            continue;
        }
        if (stat.mtimeMs < cutoff) continue;
        const raw = tryReadText(abs, 32 * 1024) ?? '';
        out.push({
            path: abs.replace(/\\/g, '/'),
            date: m[1],
            size_bytes: stat.size,
            mtime_ms: Math.floor(stat.mtimeMs),
            summary: summarizeText(raw, summaryChars),
        });
    }
    out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return out;
}

function detectHermesProfile(
    slug: string,
    profilesRoot: string,
    digestRootDefault: string,
    recentDays: number,
    summaryChars: number,
    now: Date,
): SpokeHermesProfile {
    const profileRoot = path.join(profilesRoot, slug);
    if (!fs.existsSync(profileRoot) || !fs.statSync(profileRoot).isDirectory()) {
        return {
            available: false,
            recent_digests: [],
            next_step: `No Hermes profile at ${profileRoot}. Bootstrap with: hermes profile init ${slug}`,
        };
    }
    const vaultRoot = path.join(profileRoot, 'workspace', 'research-vault');
    const configPath = path.join(profileRoot, 'config.yaml');
    const interestProfilePath = path.join(vaultRoot, 'context', 'interest-profile.json');

    const config = fs.existsSync(configPath) ? parseHermesConfigYaml(tryReadText(configPath, 64 * 1024) ?? '') : {};
    const interest = fs.existsSync(interestProfilePath) ? readInterestProfile(interestProfilePath) : {};

    const digestDir = config.output_dir ?? digestRootDefault;
    const artifactPattern = config.artifact_pattern ?? `${slug}-daily-%Y-%m-%d.md`;
    const todayStr = formatDateYmd(now);
    const todayFile = applyArtifactPattern(artifactPattern, slug, todayStr);
    const todayPath = path.join(digestDir, todayFile);
    const todayPresent = fs.existsSync(todayPath) && fs.statSync(todayPath).isFile();

    const recent = findRecentDigests(digestDir, slug, recentDays, now, summaryChars);

    const out: SpokeHermesProfile = {
        available: true,
        profile_root: profileRoot.replace(/\\/g, '/'),
        vault_root: vaultRoot.replace(/\\/g, '/'),
        config_path: fs.existsSync(configPath) ? configPath.replace(/\\/g, '/') : undefined,
        interest_profile_path: fs.existsSync(interestProfilePath) ? interestProfilePath.replace(/\\/g, '/') : undefined,
        project: interest.project ?? config.project,
        model_default: config.model_default,
        model_synthesis: config.model_synthesis,
        daily_brief_time: config.daily_brief_time,
        artifact_pattern: config.artifact_pattern,
        output_dir: config.output_dir,
        refresh_interval_hours: config.refresh_interval_hours,
        lanes: interest.lanes,
        current_priorities: interest.current_priorities,
        key_questions: interest.key_questions,
        today_digest_path: todayPath.replace(/\\/g, '/'),
        today_digest_present: todayPresent,
        recent_digests: recent,
    };
    if (config === undefined && interest === undefined) {
        out.error = 'profile root present but config.yaml and interest-profile.json both missing';
    }
    return out;
}

function gitSnapshot(rootPath: string, recentCommitLimit: number): SpokeGitSnapshot {
    if (!fs.existsSync(path.join(rootPath, '.git'))) {
        return { available: false, error: 'no .git directory' };
    }
    const run = (args: string[]): string => execFileSync('git', args, { cwd: rootPath, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
        const head = run(['rev-parse', 'HEAD']);
        let branch: string | undefined;
        try {
            branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
            if (branch === 'HEAD') branch = undefined;
        } catch { /* detached */ }
        let remote: string | undefined;
        try {
            remote = run(['config', '--get', 'remote.origin.url']);
        } catch { /* no remote */ }
        let recent: SpokeGitSnapshot['recent_commits'] = [];
        try {
            const log = run(['log', `-${recentCommitLimit}`, '--pretty=format:%h%s%cI']);
            recent = log.split('\n').filter(Boolean).map((line) => {
                const [sha, subject, date] = line.split('');
                return { sha, subject: subject ?? '', date: date ?? '' };
            });
        } catch { /* no commits */ }
        let contributors: string[] = [];
        try {
            const shortlog = run(['shortlog', '-sne', '--all', 'HEAD']);
            contributors = shortlog.split('\n').filter(Boolean).slice(0, 20).map((line) => line.replace(/^\s*\d+\s+/, '').trim());
        } catch { /* fine */ }
        return { available: true, head, branch, remote, recent_commits: recent, contributors };
    } catch (error) {
        return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
}

function renderProfileMarkdown(p: SpokeProjection): string {
    const lines: string[] = [];
    lines.push(`# Spoke Profile — ${p.slug}`);
    lines.push('');
    lines.push(`> Auto-generated by CStar spoke projector v${p.version} on ${new Date(p.projected_at).toISOString()}.`);
    lines.push('> This file is the deterministic baseline. A host LLM may deepen the narrative sections via `/spoke-init` (skill: `spoke_init`).');
    lines.push('> Do not delete `.cstar/spoke_profile.json` — it is the machine-readable index for Hermes-style researchers.');
    lines.push('');
    lines.push(`- **Slug**: \`${p.slug}\``);
    lines.push(`- **Root**: \`${p.root_path}\``);
    lines.push(`- **Primary stack**: \`${p.primary_stack}\``);
    lines.push(`- **Projected at**: ${new Date(p.projected_at).toISOString()}`);
    lines.push('');
    lines.push('## Stack');
    if (p.stack.length === 0) {
        lines.push('_No stack signals detected._');
    } else {
        for (const s of p.stack) {
            const ident = [s.name, s.version].filter(Boolean).join('@');
            lines.push(`- \`${s.kind}\` (via \`${s.detector}\`)${ident !== '' ? ` — ${ident}` : ''}`);
        }
    }
    lines.push('');
    lines.push('## Build Surface');
    lines.push(`- **Package manager**: \`${p.build.package_manager ?? 'unknown'}\``);
    if (Object.keys(p.build.scripts).length > 0) {
        lines.push('- **package.json scripts**:');
        for (const [k, v] of Object.entries(p.build.scripts)) {
            lines.push(`  - \`${k}\` → \`${v}\``);
        }
    }
    if (p.build.makefile_targets.length > 0) {
        lines.push(`- **Makefile targets** (${p.build.makefile_targets.length}): ${p.build.makefile_targets.map((t) => `\`${t}\``).join(', ')}`);
    }
    if (p.build.justfile_recipes.length > 0) {
        lines.push(`- **justfile recipes** (${p.build.justfile_recipes.length}): ${p.build.justfile_recipes.map((t) => `\`${t}\``).join(', ')}`);
    }
    lines.push('');
    lines.push('## Capability Surface');
    if (p.capabilities.length === 0) {
        lines.push('_No capabilities found. Add `.agents/skills/<name>/SKILL.md`, package.json scripts, Makefile targets, or justfile recipes to surface capabilities._');
    } else {
        const grouped: Record<string, SpokeCapabilityEntry[]> = {};
        for (const c of p.capabilities) {
            (grouped[c.kind] ??= []).push(c);
        }
        for (const [kind, entries] of Object.entries(grouped)) {
            lines.push(`### ${kind} (${entries.length})`);
            for (const c of entries) {
                const desc = c.description !== undefined ? ` — ${c.description}` : '';
                lines.push(`- \`${c.namespaced_id}\` (\`${c.source_path}\`)${desc}`);
            }
            lines.push('');
        }
    }
    lines.push('## Knowledge Map');
    lines.push('> Indexed for cross-spoke search and Hermes-style knowledge research. Update by re-running `cstar_spoke action=project slug=…`.');
    lines.push('');
    if (p.knowledge_index.length === 0) {
        lines.push('_No top-level docs found._');
    } else {
        const grouped: Record<string, SpokeKnowledgeEntry[]> = {};
        for (const k of p.knowledge_index) {
            (grouped[k.category] ??= []).push(k);
        }
        const order: SpokeKnowledgeEntry['category'][] = ['readme', 'agents', 'architecture', 'docs', 'changelog', 'license', 'other'];
        for (const cat of order) {
            const entries = grouped[cat];
            if (entries === undefined || entries.length === 0) continue;
            lines.push(`### ${cat} (${entries.length})`);
            for (const k of entries) {
                lines.push(`- **${k.path}** — ${k.summary}`);
            }
            lines.push('');
        }
    }
    lines.push('## Hermes Research Profile');
    if (!p.hermes.available) {
        lines.push('_No Hermes profile detected._');
        if (p.hermes.next_step !== undefined) {
            lines.push(`- **Next step**: ${p.hermes.next_step}`);
        }
    } else {
        lines.push(`- **Profile root**: \`${p.hermes.profile_root}\``);
        lines.push(`- **Vault root**: \`${p.hermes.vault_root}\``);
        if (p.hermes.project !== undefined) lines.push(`- **Project**: ${p.hermes.project}`);
        if (p.hermes.daily_brief_time !== undefined) lines.push(`- **Daily brief at**: ${p.hermes.daily_brief_time}`);
        if (p.hermes.refresh_interval_hours !== undefined) lines.push(`- **Refresh interval**: every ${p.hermes.refresh_interval_hours}h`);
        if (p.hermes.model_default !== undefined || p.hermes.model_synthesis !== undefined) {
            const parts: string[] = [];
            if (p.hermes.model_default !== undefined) parts.push(`default=\`${p.hermes.model_default}\``);
            if (p.hermes.model_synthesis !== undefined) parts.push(`synthesis=\`${p.hermes.model_synthesis}\``);
            lines.push(`- **Models**: ${parts.join(', ')}`);
        }
        if (p.hermes.lanes !== undefined && p.hermes.lanes.length > 0) {
            lines.push(`- **Lanes** (${p.hermes.lanes.length}): ${p.hermes.lanes.map((l) => `\`${l}\``).join(', ')}`);
        }
        if (p.hermes.current_priorities !== undefined && p.hermes.current_priorities.length > 0) {
            lines.push('- **Current priorities**:');
            for (const pr of p.hermes.current_priorities) lines.push(`  - ${pr}`);
        }
        if (p.hermes.key_questions !== undefined && p.hermes.key_questions.length > 0) {
            lines.push('- **Key research questions**:');
            for (const q of p.hermes.key_questions) lines.push(`  - ${q}`);
        }
        if (p.hermes.today_digest_path !== undefined) {
            const present = p.hermes.today_digest_present === true ? 'present' : 'not yet written';
            lines.push(`- **Today's digest**: \`${p.hermes.today_digest_path}\` _(${present})_`);
        }
        if (p.hermes.recent_digests.length > 0) {
            lines.push(`- **Recent digests** (last ${p.hermes.recent_digests.length}):`);
            for (const d of p.hermes.recent_digests) {
                lines.push(`  - \`${d.date ?? '?'}\` — ${d.path}`);
                if (d.summary !== '') lines.push(`    > ${d.summary}`);
            }
        } else {
            lines.push('- **Recent digests**: _none in the last 7 days_');
        }
    }
    lines.push('');
    lines.push('## Git Snapshot');
    if (!p.git.available) {
        lines.push(`_Git unavailable: ${p.git.error ?? 'unknown'}._`);
    } else {
        lines.push(`- **HEAD**: \`${p.git.head}\``);
        lines.push(`- **Branch**: \`${p.git.branch ?? '(detached)'}\``);
        if (p.git.remote !== undefined) lines.push(`- **Remote**: \`${p.git.remote}\``);
        if (p.git.recent_commits !== undefined && p.git.recent_commits.length > 0) {
            lines.push('- **Recent commits**:');
            for (const c of p.git.recent_commits) {
                lines.push(`  - \`${c.sha}\` ${c.subject} _(${c.date})_`);
            }
        }
        if (p.git.contributors !== undefined && p.git.contributors.length > 0) {
            lines.push(`- **Contributors** (${p.git.contributors.length}): ${p.git.contributors.slice(0, 8).join(', ')}${p.git.contributors.length > 8 ? ', …' : ''}`);
        }
    }
    lines.push('');
    lines.push('## How to Use This Profile');
    lines.push('- A Hermes-style knowledge researcher should treat `.cstar/spoke_profile.json` as the entry index.');
    lines.push('- Hub agents reach this spoke via `cstar_spoke action=inspect slug=' + p.slug + '` and `cstar_spoke_journal slug=' + p.slug + '`.');
    lines.push('- Re-run projection any time the spoke evolves: `cstar_spoke action=project slug=' + p.slug + '`.');
    lines.push('');
    return lines.join('\n');
}

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Project a freshly-linked (or re-linked) spoke into deterministic profile artifacts.
 *
 * Side effects: writes `<root>/.cstar/SPOKE_PROFILE.md` and `<root>/.cstar/spoke_profile.json`.
 * Caller is responsible for persisting the returned `metadataPatch` to `hall_mounted_spokes`.
 *
 * @param options projection inputs (slug, rootPath, optional limits)
 * @returns the structured projection plus a metadata patch for the Hall record
 */
export function projectSpoke(options: ProjectSpokeOptions): ProjectSpokeResult {
    const slug = options.slug;
    const rootPath = path.resolve(options.rootPath);
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
        throw new Error(`projectSpoke: root_path is not a directory: ${rootPath}`);
    }
    const knowledgeLimit = options.knowledgeDocLimit ?? KNOWLEDGE_DOC_LIMIT_DEFAULT;
    const summaryChars = options.knowledgeSummaryChars ?? KNOWLEDGE_SUMMARY_CHARS_DEFAULT;
    const recentCommitLimit = options.recentCommitLimit ?? RECENT_COMMIT_LIMIT_DEFAULT;
    const hermesProfilesRoot = options.hermesProfilesRoot ?? path.join(os.homedir(), '.hermes', 'profiles');
    const hermesDigestRootDefault = options.hermesDigestRoot ?? path.join(os.homedir(), 'wiki', 'queries');
    const hermesRecentDays = options.hermesRecentDays ?? 7;
    const now = options.now ?? new Date();

    const stack = detectStack(rootPath);
    const primaryStack = pickPrimaryStack(stack);
    const build: SpokeBuildSurface = {
        package_manager: pickPackageManager(rootPath, stack),
        scripts: extractScripts(rootPath),
        makefile_targets: extractMakefileTargets(rootPath),
        justfile_recipes: extractJustfileRecipes(rootPath),
    };
    const capabilities = inventoryCapabilities(slug, rootPath, build);
    const knowledgeIndex = buildKnowledgeIndex(rootPath, knowledgeLimit, summaryChars);
    const git = gitSnapshot(rootPath, recentCommitLimit);
    const hermes = detectHermesProfile(slug, hermesProfilesRoot, hermesDigestRootDefault, hermesRecentDays, summaryChars, now);

    const profileDir = path.join(rootPath, SPOKE_PROFILE_DIR);
    fs.mkdirSync(profileDir, { recursive: true });
    const profileMdPath = path.join(profileDir, SPOKE_PROFILE_MD);
    const profileJsonPath = path.join(profileDir, SPOKE_PROFILE_JSON);

    const projection: SpokeProjection = {
        version: SPOKE_PROJECTION_VERSION,
        slug,
        root_path: rootPath.replace(/\\/g, '/'),
        projected_at: now.getTime(),
        profile_md_path: profileMdPath.replace(/\\/g, '/'),
        profile_json_path: profileJsonPath.replace(/\\/g, '/'),
        profile_md_sha256: '',
        profile_json_sha256: '',
        stack,
        primary_stack: primaryStack,
        build,
        capabilities,
        knowledge_index: knowledgeIndex,
        git,
        hermes,
        counts: {
            skills: capabilities.filter((c) => c.kind === 'skill').length,
            scripts: Object.keys(build.scripts).length,
            make_targets: build.makefile_targets.length,
            just_recipes: build.justfile_recipes.length,
            knowledge_entries: knowledgeIndex.length,
            recent_commits: git.recent_commits?.length ?? 0,
            contributors: git.contributors?.length ?? 0,
            hermes_lanes: hermes.lanes?.length ?? 0,
            hermes_recent_digests: hermes.recent_digests.length,
        },
    };

    const md = renderProfileMarkdown(projection);
    const json = JSON.stringify(projection, null, 2);
    projection.profile_md_sha256 = sha256(md);
    projection.profile_json_sha256 = sha256(json);
    const finalJson = JSON.stringify(projection, null, 2);

    fs.writeFileSync(profileMdPath, md, 'utf-8');
    fs.writeFileSync(profileJsonPath, finalJson, 'utf-8');

    const metadataPatch: Record<string, unknown> = {
        last_projected_at: projection.projected_at,
        projection_version: SPOKE_PROJECTION_VERSION,
        primary_stack: primaryStack,
        package_manager: build.package_manager,
        capability_count: capabilities.length,
        skill_count: projection.counts.skills,
        script_count: projection.counts.scripts,
        knowledge_entry_count: knowledgeIndex.length,
        git_head: git.available ? git.head : null,
        git_branch: git.available ? git.branch ?? null : null,
        profile_md_path: path.relative(rootPath, profileMdPath).replace(/\\/g, '/'),
        profile_json_path: path.relative(rootPath, profileJsonPath).replace(/\\/g, '/'),
        profile_md_sha256: projection.profile_md_sha256,
        profile_json_sha256: projection.profile_json_sha256,
        hermes: {
            available: hermes.available,
            profile_root: hermes.profile_root ?? null,
            vault_root: hermes.vault_root ?? null,
            today_digest_path: hermes.today_digest_path ?? null,
            today_digest_present: hermes.today_digest_present ?? false,
            lane_count: hermes.lanes?.length ?? 0,
            recent_digest_count: hermes.recent_digests.length,
            daily_brief_time: hermes.daily_brief_time ?? null,
        },
    };

    return { projection, metadataPatch };
}
