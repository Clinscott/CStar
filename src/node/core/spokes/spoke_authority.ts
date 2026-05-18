/**
 * Spoke authority module — establishes the bidirectional contract between CStar (hub) and a mounted spoke.
 *
 * Where the spoke projector (`spoke_projector.ts`) captures observation
 * (what the spoke IS), this module plants authority (what the spoke OWES
 * CStar and what CStar GRANTS the spoke). Five files land in `<spoke>/.cstar/`:
 *
 *   - IDENTITY.json        identity card with the mount_token nonce (proof-of-mount)
 *   - CSTAR_CONTRACT.md    rules CStar imposes + rights CStar grants
 *   - CAPABILITIES.md      declared `<slug>:<bare_id>` namespace claim
 *   - INTAKE.md            bead/engram submission rules (varies by write_policy/trust)
 *   - HUB_ACK.json         CStar's signed acknowledgement (sha256 over the four contract files)
 *
 * Mount token preservation order, in priority:
 *   1. Existing IDENTITY.json on disk (if valid).
 *   2. mount_token in the supplied existingHallToken arg (Hall back-reference).
 *   3. Newly-generated UUIDv4.
 *
 * Re-running establishAuthority on an already-mounted spoke is idempotent
 * with respect to the mount_token; only the contract files / hashes / acceptance
 * timestamp change.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
    SpokeProjection,
    SpokeCapabilityEntry,
} from './spoke_projector.ts';
import { SPOKE_PROFILE_DIR } from './spoke_projector.ts';

export const SPOKE_CONTRACT_VERSION = '1.0';
export const IDENTITY_FILE = 'IDENTITY.json';
export const CSTAR_CONTRACT_FILE = 'CSTAR_CONTRACT.md';
export const CAPABILITIES_FILE = 'CAPABILITIES.md';
export const INTAKE_FILE = 'INTAKE.md';
export const HUB_ACK_FILE = 'HUB_ACK.json';

export type SpokeTrustLevel = 'trusted' | 'observe' | 'quarantined';
export type SpokeWritePolicy = 'read_write' | 'read_only';

export interface SpokeIdentity {
    schema: 'cstar.spoke.identity';
    contract_version: string;
    slug: string;
    spoke_root: string;
    hub_repo_id: string;
    hub_root: string;
    mount_token: string;
    registered_at: number;
    last_renewed_at: number;
    projection_version?: string;
    trust_level: SpokeTrustLevel;
    write_policy: SpokeWritePolicy;
}

export interface SpokeHubAck {
    schema: 'cstar.spoke.hub_ack';
    contract_version: string;
    slug: string;
    mount_token: string;
    hub_repo_id: string;
    hub_root: string;
    hub_kernel_version: string;
    accepted_at: number;
    contract_sha256: {
        identity: string;
        cstar_contract: string;
        capabilities: string;
        intake: string;
    };
    contract_paths: {
        identity: string;
        cstar_contract: string;
        capabilities: string;
        intake: string;
    };
}

export interface EstablishAuthorityOptions {
    slug: string;
    rootPath: string;
    hubRepoId: string;
    hubRoot: string;
    hubKernelVersion: string;
    trustLevel: SpokeTrustLevel;
    writePolicy: SpokeWritePolicy;
    projection?: SpokeProjection;
    /**
     * Hall-side mount_token if previously persisted. Used as the second-priority
     * source after the on-disk IDENTITY.json, before generating a fresh nonce.
     */
    existingHallToken?: string;
    /**
     * Set true to forcibly rotate the mount_token even if a valid one exists.
     * Defaults to false. Rotation invalidates any prior HUB_ACK on disk.
     */
    rotateToken?: boolean;
    now?: Date;
}

export interface EstablishAuthorityResult {
    identity: SpokeIdentity;
    hubAck: SpokeHubAck;
    metadataPatch: Record<string, unknown>;
    rotated: boolean;
    files: {
        identity: string;
        cstar_contract: string;
        capabilities: string;
        intake: string;
        hub_ack: string;
    };
}

export type MountTokenVerdict =
    | 'ok'              // both sides present and match
    | 'unproven'        // both sides absent (legacy spoke; tolerated)
    | 'mismatch'        // both present but tokens differ (proof-of-mount drift; HARD REJECT)
    | 'identity_missing'    // Hall has token, IDENTITY.json absent (HARD REJECT)
    | 'hall_missing';   // IDENTITY.json present, Hall lost the binding (HARD REJECT)

export interface VerifyMountTokenResult {
    verdict: MountTokenVerdict;
    spoke_root: string;
    identity_path: string;
    hall_token: string | null;
    identity_token: string | null;
    reason: string;
}

/**
 * Verify the mount_token nonce on disk matches the Hall record.
 *
 * Read-only; no mutations. The result is the authoritative input for the
 * write-path gate in `resolveSpokeAnchor` (kernel rejects bead/engram
 * intake on `mismatch`, `identity_missing`, or `hall_missing`).
 *
 * @param spokeRootPath the spoke's root_path from the Hall record
 * @param hallToken the mount_token recorded in `hall_mounted_spokes.metadata.authority.mount_token`
 * @returns structured verdict explaining the match status and the reason
 */
export function verifyMountToken(spokeRootPath: string, hallToken: string | null | undefined): VerifyMountTokenResult {
    const identityPath = path.join(spokeRootPath, SPOKE_PROFILE_DIR, IDENTITY_FILE);
    const existing = readExistingIdentity(identityPath);
    const onDiskToken = existing.token ?? null;
    const hallTokenNorm = typeof hallToken === 'string' && hallToken.length > 0 ? hallToken : null;

    if (hallTokenNorm === null && onDiskToken === null) {
        return {
            verdict: 'unproven',
            spoke_root: spokeRootPath,
            identity_path: identityPath,
            hall_token: null,
            identity_token: null,
            reason: 'no mount_token on either side (legacy/pre-authority spoke); tolerated for backward compatibility',
        };
    }
    if (hallTokenNorm === null) {
        return {
            verdict: 'hall_missing',
            spoke_root: spokeRootPath,
            identity_path: identityPath,
            hall_token: null,
            identity_token: onDiskToken,
            reason: 'IDENTITY.json present but Hall has no mount_token; relink the spoke to restore the binding',
        };
    }
    if (onDiskToken === null) {
        return {
            verdict: 'identity_missing',
            spoke_root: spokeRootPath,
            identity_path: identityPath,
            hall_token: hallTokenNorm,
            identity_token: null,
            reason: 'Hall holds a mount_token but IDENTITY.json is missing or unreadable; re-project the spoke',
        };
    }
    if (onDiskToken !== hallTokenNorm) {
        return {
            verdict: 'mismatch',
            spoke_root: spokeRootPath,
            identity_path: identityPath,
            hall_token: hallTokenNorm,
            identity_token: onDiskToken,
            reason: 'mount_token drift: IDENTITY.json and Hall disagree (possible swap, restore from snapshot, or tampering)',
        };
    }
    return {
        verdict: 'ok',
        spoke_root: spokeRootPath,
        identity_path: identityPath,
        hall_token: hallTokenNorm,
        identity_token: onDiskToken,
        reason: 'mount_token verified',
    };
}

interface ExistingIdentityRead {
    token?: string;
    registered_at?: number;
}

/**
 * Read an existing IDENTITY.json if one is on disk.
 *
 * Missing file → `{}` (legitimate "no prior mount" case).
 * Existing-but-corrupt file → THROW. Silently returning `{}` here would force
 * mount_token regeneration and invalidate the hub's signed HUB_ACK, severing
 * proof-of-mount. A corrupted identity is an operator-visible problem.
 *
 * @param file absolute path to IDENTITY.json
 * @returns parsed token + registered_at if available, else empty for "no file"
 * @throws Error when the file exists but cannot be read, parsed, or is not an object
 */
function readExistingIdentity(file: string): ExistingIdentityRead {
    if (!fs.existsSync(file)) return {};
    let raw: string;
    try {
        raw = fs.readFileSync(file, 'utf-8');
    } catch (err) {
        throw new Error(`IDENTITY.json exists at ${file} but is unreadable: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`IDENTITY.json at ${file} is not valid JSON: ${(err as Error).message}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const got = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
        throw new Error(`IDENTITY.json at ${file} must be a JSON object, got ${got}`);
    }
    const obj = parsed as Record<string, unknown>;
    const token = typeof obj.mount_token === 'string' && obj.mount_token.length > 0 ? obj.mount_token : undefined;
    const registered = typeof obj.registered_at === 'number' && Number.isFinite(obj.registered_at) ? obj.registered_at : undefined;
    return { token, registered_at: registered };
}

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

function renderCstarContract(slug: string, identity: SpokeIdentity, hubKernelVersion: string): string {
    const lines: string[] = [];
    lines.push(`# CStar Contract — ${slug}`);
    lines.push('');
    lines.push(`> Authority document planted by CStar kernel v${hubKernelVersion} on ${new Date(identity.registered_at).toISOString()}.`);
    lines.push(`> Contract version: \`${identity.contract_version}\`. Mount token: \`${identity.mount_token}\`.`);
    lines.push(`> This file is generated. Edit IDENTITY.json or re-run \`cstar_spoke action=project\` to refresh.`);
    lines.push('');
    lines.push('## What CStar Requires');
    lines.push('');
    lines.push('1. **Sterling Mandate.** No change inside this spoke is final until it satisfies all three:');
    lines.push('   - **Lore** — a `.feature` Gherkin contract describes the behavior.');
    lines.push('   - **Isolation** — a unit test confirms the logic in a sandbox.');
    lines.push('   - **Audit** — Gungnir score `[L] [S] [I] [G] [V] [E] [A] [Ω]` holds or improves.');
    lines.push('2. **Augury Enforcement.** Multi-file changes initiated through CStar must emit a Corvus Star Augury block (route, intent, council expert, verdict).');
    lines.push('3. **Capability namespace.** All capabilities this spoke surfaces are addressed through the `' + slug + ':<bare_id>` namespace at the hub. Bare ids must match `/^[a-z0-9][a-z0-9_-]*$/i`. Colons in bare ids are reserved.');
    lines.push('4. **Bead protocol.** Beads originating in this spoke MUST follow the rules in `' + INTAKE_FILE + '`.');
    lines.push('5. **Identity stewardship.** `' + IDENTITY_FILE + '` is the proof-of-mount. Do not edit `mount_token` by hand. Deleting the file removes proof-of-mount and forces re-init on next projection.');
    lines.push('6. **Quarantine respect.** If the hub flips `trust_level` to `quarantined`, the spoke is dropped from capability discovery and bead intake on the next projection.');
    lines.push('');
    lines.push('## What CStar Grants');
    lines.push('');
    lines.push('1. **Hall persistence.** The hub PennyOne database stores beads, engrams, and validations submitted under this spoke\'s slug.');
    lines.push('2. **Capability discovery.** `cstar_manifest` exposes every `' + slug + ':<bare_id>` declared in `' + CAPABILITIES_FILE + '` to estate-wide hosts (Claude / Gemini / Codex).');
    lines.push('3. **Engram seeding.** When `write_policy=read_write`, this spoke MAY publish episodic memories via `cstar_engram_record` — surfaced through `cstar_hall_search` for cross-spoke research.');
    lines.push('4. **Intent routing.** The hub intent grammar (`.agents/skill_registry.json#intent_grammar`) routes operator prompts that match this spoke\'s declared capabilities.');
    lines.push('5. **Profile durability.** `<spoke>/.cstar/SPOKE_PROFILE.md` and `spoke_profile.json` are deterministic and idempotent — re-running projection produces identical artifacts modulo timestamp + git state.');
    lines.push('6. **Hermes integration.** When a Hermes profile exists at `~/.hermes/profiles/' + slug + '/`, daily research digests are linked from the spoke profile and discoverable by hub agents.');
    lines.push('');
    lines.push('## Authority Surface');
    lines.push('');
    lines.push(`- **Hub repo_id**: \`${identity.hub_repo_id}\``);
    lines.push(`- **Hub root**: \`${identity.hub_root}\``);
    lines.push(`- **Spoke root**: \`${identity.spoke_root}\``);
    lines.push(`- **Trust level**: \`${identity.trust_level}\``);
    lines.push(`- **Write policy**: \`${identity.write_policy}\``);
    lines.push('');
    lines.push('## Revocation');
    lines.push('');
    lines.push(`- The hub can revoke this mount via \`cstar_spoke action=unlink slug=${slug}\`. The Hall row is removed; this directory's \`.cstar/\` files are NOT auto-deleted (the spoke remains addressable on disk; CStar simply forgets about it).`);
    lines.push(`- The spoke can self-revoke by deleting \`${IDENTITY_FILE}\`. The next projection will treat this as a fresh mount and emit a new mount_token; the prior HUB_ACK is invalidated.`);
    lines.push('');
    return lines.join('\n');
}

function renderCapabilities(slug: string, identity: SpokeIdentity, capabilities: readonly SpokeCapabilityEntry[]): string {
    const lines: string[] = [];
    lines.push(`# Capability Charter — ${slug}`);
    lines.push('');
    lines.push(`> Declared capability namespace under \`${slug}:<bare_id>\`. Generated from the spoke projector inventory; re-run \`cstar_spoke action=project\` after adding new capabilities.`);
    lines.push(`> Mount token: \`${identity.mount_token}\`. Contract version: \`${identity.contract_version}\`.`);
    lines.push('');
    if (capabilities.length === 0) {
        lines.push('_No capabilities declared. Add `.agents/skills/<name>/SKILL.md`, package.json scripts, Makefile targets, or justfile recipes; then re-project._');
        lines.push('');
        return lines.join('\n');
    }
    const grouped: Record<string, SpokeCapabilityEntry[]> = {};
    for (const c of capabilities) {
        (grouped[c.kind] ??= []).push(c);
    }
    const order: Array<SpokeCapabilityEntry['kind']> = ['skill', 'workflow', 'script', 'make_target', 'just_recipe'];
    lines.push('| Kind | Namespaced ID | Source | Description |');
    lines.push('|:---|:---|:---|:---|');
    for (const kind of order) {
        const entries = grouped[kind];
        if (entries === undefined) continue;
        for (const c of entries) {
            const desc = (c.description ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
            lines.push(`| ${c.kind} | \`${c.namespaced_id}\` | \`${c.source_path}\` | ${desc} |`);
        }
    }
    lines.push('');
    lines.push('## Stability Tiers');
    lines.push('');
    lines.push('- `skill` — declared via `.agents/skills/<name>/SKILL.md`. Tier comes from frontmatter (`PRIME` / `SKILL` / `WEAVE` / `SPELL`). Stable contract.');
    lines.push('- `workflow` — declared via `.agents/workflows/*.md`. Host-native composition; less stable than skills.');
    lines.push('- `script` — package.json scripts. Operational surface; not a stable agent contract.');
    lines.push('- `make_target` / `just_recipe` — build / dev tooling. Not addressable as agent capabilities.');
    lines.push('');
    return lines.join('\n');
}

function renderIntake(slug: string, identity: SpokeIdentity): string {
    const lines: string[] = [];
    lines.push(`# Bead / Engram Intake Contract — ${slug}`);
    lines.push('');
    lines.push(`> Generated from the spoke's resolved \`trust_level=${identity.trust_level}\`, \`write_policy=${identity.write_policy}\`. Re-project after policy changes to refresh.`);
    lines.push('');

    if (identity.trust_level === 'quarantined') {
        lines.push('## Status: QUARANTINED');
        lines.push('');
        lines.push('- This spoke is quarantined. Capability discovery skips it.');
        lines.push('- Bead and engram submissions are rejected hard at the kernel boundary.');
        lines.push('- Quarantine is lifted only by explicit `cstar_spoke action=link --trust trusted`.');
        lines.push('');
        return lines.join('\n');
    }

    if (identity.write_policy === 'read_only') {
        lines.push('## Status: READ-ONLY');
        lines.push('');
        lines.push('- This spoke MAY NOT submit beads via `cstar_bead` or `cstar_spoke_bead_import`.');
        lines.push('- This spoke MAY NOT publish engrams via `cstar_engram_record`.');
        lines.push('- The spoke is fully observable: capabilities surface through `cstar_manifest`, journal through `cstar_spoke_journal`, profile through `<spoke>/.cstar/SPOKE_PROFILE.md`.');
        lines.push('- To enable bead intake: `cstar_spoke action=link slug=' + slug + ' root_path=<root> --accept-beads`.');
        lines.push('');
        return lines.join('\n');
    }

    lines.push('## Status: READ-WRITE (bead intake enabled)');
    lines.push('');
    lines.push('### Beads');
    lines.push('');
    lines.push('- **Allowed `target_kind`**: `SPOKE`, `FILE`, `SECTOR`, `REPOSITORY`, `CONTRACT`, `WORKFLOW`, `VALIDATION`, `OTHER`.');
    lines.push('- **`source_kind`**: SHOULD be `spoke:' + slug + '` for clean provenance. Other source_kinds are accepted but flagged in audits.');
    lines.push('- **Status flow**: `OPEN` → `SET-PENDING` → `SET` → `IN_PROGRESS` → `READY_FOR_REVIEW` → `RESOLVED` (or `BLOCKED` / `NEEDS_TRIAGE` / `SUPERSEDED` / `ARCHIVED`).');
    lines.push('- **Sterling Mandate** applies to every bead resolution: Lore (`.feature`) + Isolation (unit test) + Audit (Gungnir score). A bead may not transition to `RESOLVED` without all three.');
    lines.push('');
    lines.push('### Engrams');
    lines.push('');
    lines.push('- **Anchor**: every engram requires a `bead_id` parent.');
    lines.push('- **Intent prefix convention**: `spoke/' + slug + '/<topic>` for free-form events. War-game contests use `usb-forge/shot-fired/...` and similar registered prefixes (the score trigger fires on those).');
    lines.push('- **Payload**: JSON-serializable. Free-form `metadata`. Carries shot_id, terminal_event, expected, etc. for war-game arbitration.');
    lines.push('');
    lines.push('### Hard kernel gates');
    lines.push('');
    lines.push('- A bead/engram submission with `spoke=' + slug + '` is rejected when:');
    lines.push('  - `trust_level=quarantined` (hard reject).');
    lines.push('  - `write_policy=read_only` (hard reject).');
    lines.push('  - `mount_status != active` (hard reject).');
    lines.push('  - `mount_token` mismatch between IDENTITY.json and Hall (proof-of-mount drift).');
    lines.push('');
    return lines.join('\n');
}

/**
 * Establish (or refresh) the authority contract between CStar and a mounted spoke.
 *
 * Plants 5 files into `<spoke>/.cstar/` and returns a metadata patch suitable
 * for merging into the `hall_mounted_spokes.metadata.projection` record.
 * Idempotent with respect to the mount_token unless `rotateToken=true`.
 *
 * @param options inputs (slug, paths, trust/write policy, optional projection + existing hall token)
 * @returns identity, hub_ack, metadata patch, file paths, and a `rotated` flag
 */
export function establishAuthority(options: EstablishAuthorityOptions): EstablishAuthorityResult {
    const slug = options.slug;
    const rootPath = path.resolve(options.rootPath);
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
        throw new Error(`establishAuthority: spoke root is not a directory: ${rootPath}`);
    }
    const profileDir = path.join(rootPath, SPOKE_PROFILE_DIR);
    fs.mkdirSync(profileDir, { recursive: true });

    const identityPath = path.join(profileDir, IDENTITY_FILE);
    const cstarContractPath = path.join(profileDir, CSTAR_CONTRACT_FILE);
    const capabilitiesPath = path.join(profileDir, CAPABILITIES_FILE);
    const intakePath = path.join(profileDir, INTAKE_FILE);
    const hubAckPath = path.join(profileDir, HUB_ACK_FILE);

    const existing = readExistingIdentity(identityPath);
    const now = options.now ?? new Date();
    const nowMs = now.getTime();

    let mountToken: string;
    let rotated = false;
    if (options.rotateToken === true) {
        mountToken = crypto.randomUUID();
        rotated = true;
    } else if (existing.token !== undefined) {
        mountToken = existing.token;
    } else if (options.existingHallToken !== undefined && options.existingHallToken.length > 0) {
        mountToken = options.existingHallToken;
    } else {
        mountToken = crypto.randomUUID();
        rotated = true;
    }

    const registeredAt = options.rotateToken === true || existing.registered_at === undefined
        ? nowMs
        : existing.registered_at;

    const identity: SpokeIdentity = {
        schema: 'cstar.spoke.identity',
        contract_version: SPOKE_CONTRACT_VERSION,
        slug,
        spoke_root: rootPath.replace(/\\/g, '/'),
        hub_repo_id: options.hubRepoId,
        hub_root: options.hubRoot.replace(/\\/g, '/'),
        mount_token: mountToken,
        registered_at: registeredAt,
        last_renewed_at: nowMs,
        projection_version: options.projection?.version,
        trust_level: options.trustLevel,
        write_policy: options.writePolicy,
    };

    const identityJson = JSON.stringify(identity, null, 2);
    const cstarContract = renderCstarContract(slug, identity, options.hubKernelVersion);
    const capabilities = renderCapabilities(slug, identity, options.projection?.capabilities ?? []);
    const intake = renderIntake(slug, identity);

    fs.writeFileSync(identityPath, identityJson, 'utf-8');
    fs.writeFileSync(cstarContractPath, cstarContract, 'utf-8');
    fs.writeFileSync(capabilitiesPath, capabilities, 'utf-8');
    fs.writeFileSync(intakePath, intake, 'utf-8');

    const contractSha = {
        identity: sha256(identityJson),
        cstar_contract: sha256(cstarContract),
        capabilities: sha256(capabilities),
        intake: sha256(intake),
    };
    const contractPaths = {
        identity: identityPath.replace(/\\/g, '/'),
        cstar_contract: cstarContractPath.replace(/\\/g, '/'),
        capabilities: capabilitiesPath.replace(/\\/g, '/'),
        intake: intakePath.replace(/\\/g, '/'),
    };

    const hubAck: SpokeHubAck = {
        schema: 'cstar.spoke.hub_ack',
        contract_version: SPOKE_CONTRACT_VERSION,
        slug,
        mount_token: mountToken,
        hub_repo_id: options.hubRepoId,
        hub_root: options.hubRoot.replace(/\\/g, '/'),
        hub_kernel_version: options.hubKernelVersion,
        accepted_at: nowMs,
        contract_sha256: contractSha,
        contract_paths: contractPaths,
    };
    fs.writeFileSync(hubAckPath, JSON.stringify(hubAck, null, 2), 'utf-8');

    const metadataPatch: Record<string, unknown> = {
        contract_version: SPOKE_CONTRACT_VERSION,
        mount_token: mountToken,
        rotated,
        registered_at: registeredAt,
        last_renewed_at: nowMs,
        identity_path: path.relative(rootPath, identityPath).replace(/\\/g, '/'),
        cstar_contract_path: path.relative(rootPath, cstarContractPath).replace(/\\/g, '/'),
        capabilities_path: path.relative(rootPath, capabilitiesPath).replace(/\\/g, '/'),
        intake_path: path.relative(rootPath, intakePath).replace(/\\/g, '/'),
        hub_ack_path: path.relative(rootPath, hubAckPath).replace(/\\/g, '/'),
        contract_sha256: contractSha,
    };

    return {
        identity,
        hubAck,
        metadataPatch,
        rotated,
        files: {
            identity: identityPath.replace(/\\/g, '/'),
            cstar_contract: cstarContractPath.replace(/\\/g, '/'),
            capabilities: capabilitiesPath.replace(/\\/g, '/'),
            intake: intakePath.replace(/\\/g, '/'),
            hub_ack: hubAckPath.replace(/\\/g, '/'),
        },
    };
}
