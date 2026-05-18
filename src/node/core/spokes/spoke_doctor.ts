/**
 * Spoke doctor — survey + prune for the mounted-spokes registry.
 *
 * Detects four classes of registry drift:
 *
 *   - LIVE      — projection_status='current', root_path exists, mount_token present.
 *   - PHANTOM   — root_path missing on disk (or platform-mismatched, e.g. Windows path on Linux).
 *   - DUPLICATE — same slug under multiple repo_ids (typically test residue + a real mount).
 *   - STALE     — exists on disk but never projected, or registered under a foreign repo_id with no current projection.
 *
 * Pruning is opt-in and explicit: callers pass the exact (slug, root_path)
 * targets they want removed. The doctor never auto-deletes — survey is
 * read-only; prune requires a target list.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { database } from '../../../tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { SPOKE_PROFILE_DIR } from './spoke_projector.ts';
import {
    verifyMountToken,
    IDENTITY_FILE,
    HUB_ACK_FILE,
    CSTAR_CONTRACT_FILE,
    CAPABILITIES_FILE,
    INTAKE_FILE,
    type MountTokenVerdict,
    type SpokeHubAck,
} from './spoke_authority.ts';

export type SpokeBucket = 'live' | 'phantom' | 'duplicate' | 'stale';

export interface SpokeSurveyEntry {
    slug: string;
    spoke_id: string;
    repo_id: string;
    root_path: string;
    mount_status: string;
    trust_level: string;
    write_policy: string;
    projection_status: string;
    last_scan_at: number | null;
    updated_at: number | null;
    mount_token: string | null;
    bucket: SpokeBucket;
    reason: string;
    path_exists: boolean;
    is_hub: boolean;
    is_tmp_fixture: boolean;
    is_platform_mismatch: boolean;
}

export interface SpokeSurveyReport {
    surveyed_at: number;
    hub_repo_id: string;
    counts: Record<SpokeBucket, number>;
    by_repo_id: Record<string, number>;
    spokes: SpokeSurveyEntry[];
}

export interface PruneTarget {
    slug: string;
    root_path: string;
}

export interface PruneOptions {
    dry_run?: boolean;
    cleanup_artifacts?: boolean;
}

export interface PruneOutcome {
    slug: string;
    root_path: string;
    hall_row_deleted: boolean;
    artifacts_deleted: boolean;
    artifact_path?: string;
    error?: string;
}

export interface PruneResult {
    dry_run: boolean;
    cleanup_artifacts: boolean;
    outcomes: PruneOutcome[];
    counts: {
        targets: number;
        hall_rows_deleted: number;
        artifacts_deleted: number;
        errors: number;
    };
}

const PLATFORM_WIN_PATH_RE = /^[A-Z]:[\\/]/;

function pathExistsAsDir(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Pure surveyor — caller supplies the row list and the hub_repo_id.
 *
 * Test seam (mirrors `walkSpokeSkillsForRecords`). Production callers
 * use `surveySpokes`, which pulls from `database.listHallMountedSpokes()`.
 *
 * @param rows the rows to classify (pass `database.listHallMountedSpokes()` in production)
 * @param hubRepoId the active hub's repo_id
 * @param now optional clock for deterministic test surveyed_at
 * @returns classification report
 */
export function surveySpokesForRecords(
    rows: readonly HallMountedSpokeRecord[],
    hubRepoId: string,
    now?: Date,
): SpokeSurveyReport {
    const slugCounts: Record<string, number> = {};
    for (const r of rows) {
        slugCounts[r.slug] = (slugCounts[r.slug] ?? 0) + 1;
    }

    const entries: SpokeSurveyEntry[] = [];
    const byRepoId: Record<string, number> = {};
    for (const row of rows) {
        const exists = pathExistsAsDir(row.root_path);
        const isTmpFixture = row.root_path.startsWith('/tmp/corvus-');
        const isWinOnLinux = process.platform !== 'win32' && PLATFORM_WIN_PATH_RE.test(row.root_path);
        const isHub = row.repo_id === hubRepoId;
        const tokenRaw = (row.metadata?.authority as Record<string, unknown> | undefined)?.mount_token;
        const mountToken = typeof tokenRaw === 'string' ? tokenRaw : null;

        let bucket: SpokeBucket;
        let reason: string;
        if (!exists && isTmpFixture) {
            bucket = 'phantom';
            reason = 'path gone, /tmp test residue';
        } else if (!exists && isWinOnLinux) {
            bucket = 'phantom';
            reason = 'Windows path on Linux, gone';
        } else if (!exists) {
            bucket = 'phantom';
            reason = 'path gone';
        } else if (slugCounts[row.slug] > 1 && !isHub) {
            bucket = 'duplicate';
            reason = 'duplicate slug under non-hub repo_id';
        } else if (!isHub) {
            bucket = 'stale';
            reason = 'foreign repo_id (not current hub)';
        } else if (row.projection_status === 'current' && mountToken !== null) {
            bucket = 'live';
            reason = 'current projection on existing path';
        } else {
            bucket = 'stale';
            reason = 'on-hub but no current projection';
        }

        byRepoId[row.repo_id] = (byRepoId[row.repo_id] ?? 0) + 1;

        entries.push({
            slug: row.slug,
            spoke_id: row.spoke_id,
            repo_id: row.repo_id,
            root_path: row.root_path,
            mount_status: row.mount_status,
            trust_level: row.trust_level,
            write_policy: row.write_policy,
            projection_status: row.projection_status,
            last_scan_at: row.last_scan_at ?? null,
            updated_at: row.updated_at ?? null,
            mount_token: mountToken,
            bucket,
            reason,
            path_exists: exists,
            is_hub: isHub,
            is_tmp_fixture: isTmpFixture,
            is_platform_mismatch: isWinOnLinux,
        });
    }

    entries.sort((a, b) => {
        if (a.bucket !== b.bucket) return a.bucket.localeCompare(b.bucket);
        if (a.slug !== b.slug) return a.slug.localeCompare(b.slug);
        return a.root_path.localeCompare(b.root_path);
    });

    const counts: Record<SpokeBucket, number> = { live: 0, phantom: 0, duplicate: 0, stale: 0 };
    for (const e of entries) counts[e.bucket]++;

    return {
        surveyed_at: (now ?? new Date()).getTime(),
        hub_repo_id: hubRepoId,
        counts,
        by_repo_id: byRepoId,
        spokes: entries,
    };
}

/**
 * Live surveyor — pulls from `database.listHallMountedSpokes()`.
 * Thin convenience wrapper over `surveySpokesForRecords`.
 *
 * @param hubRepoId the active hub's repo_id
 * @returns classification report
 */
export function surveySpokes(hubRepoId: string): SpokeSurveyReport {
    return surveySpokesForRecords(database.listAllHallMountedSpokes(), hubRepoId);
}

export type FileVerdict = 'ok' | 'drift' | 'missing';

export interface SpokeVerifyReport {
    slug: string;
    spoke_root: string;
    drift_detected: boolean;
    mount_token: MountTokenVerdict;
    mount_token_reason: string;
    hall_token: string | null;
    identity_token: string | null;
    hub_ack_present: boolean;
    contract: {
        identity: FileVerdict;
        cstar_contract: FileVerdict;
        capabilities: FileVerdict;
        intake: FileVerdict;
    };
    contract_paths: {
        identity: string;
        cstar_contract: string;
        capabilities: string;
        intake: string;
        hub_ack: string;
    };
    notes: string[];
}

function sha256File(file: string): string | null {
    try {
        const buf = fs.readFileSync(file, 'utf-8');
        return crypto.createHash('sha256').update(buf, 'utf-8').digest('hex');
    } catch {
        return null;
    }
}

function readHubAck(file: string): SpokeHubAck | null {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.schema === 'cstar.spoke.hub_ack') return parsed as SpokeHubAck;
        return null;
    } catch {
        return null;
    }
}

function compareSha(currentSha: string | null, recordedSha: string | undefined): FileVerdict {
    if (currentSha === null) return 'missing';
    if (recordedSha === undefined) return 'drift';
    return currentSha === recordedSha ? 'ok' : 'drift';
}

export type HealthVerdict = 'healthy' | 'degraded' | 'unhealthy';

export interface SpokeHealthReport {
    slug: string;
    spoke_root: string;
    verdict: HealthVerdict;
    checks: {
        path_exists: boolean;
        is_directory: boolean;
        readable: boolean;
        identity_present: boolean;
        git_dir_present: boolean;
        mount_token_ok: boolean;
    };
    notes: string[];
    last_health_at: number | null;
    heartbeat_written: boolean;
}

/**
 * Health-check a registered spoke and update `last_health_at`.
 *
 * Lightweight filesystem probe: path exists, is a directory, is readable,
 * IDENTITY.json is present, .git directory is present (if it was at link
 * time), mount_token verification passes. The Hall row's `last_health_at`
 * is bumped to now on every call (the heartbeat).
 *
 * @param slug normalized spoke slug
 * @returns per-check verdict + aggregate health
 */
export function healthCheckSpoke(slug: string): SpokeHealthReport {
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) {
        throw new Error(`spoke not registered: ${slug}`);
    }
    const root = spoke.root_path;
    let pathExists = false;
    let isDir = false;
    let readable = false;
    try {
        const stat = fs.statSync(root);
        pathExists = true;
        isDir = stat.isDirectory();
    } catch { /* missing */ }
    if (pathExists && isDir) {
        try {
            fs.accessSync(root, fs.constants.R_OK);
            readable = true;
        } catch { /* unreadable */ }
    }
    const identityPresent = pathExists && fs.existsSync(path.join(root, SPOKE_PROFILE_DIR, IDENTITY_FILE));
    const gitDirPresent = pathExists && fs.existsSync(path.join(root, '.git'));

    const hallAuthority = (spoke.metadata?.authority ?? {}) as Record<string, unknown>;
    const hallToken = typeof hallAuthority.mount_token === 'string' ? hallAuthority.mount_token : null;
    const tokenVerdict = pathExists ? verifyMountToken(root, hallToken) : null;
    const mountTokenOk = tokenVerdict === null
        ? false
        : tokenVerdict.verdict === 'ok' || tokenVerdict.verdict === 'unproven';

    const notes: string[] = [];
    if (!pathExists) notes.push(`root_path missing on disk: ${root}`);
    if (pathExists && !isDir) notes.push('root_path exists but is not a directory');
    if (pathExists && isDir && !readable) notes.push('root_path is not readable by the kernel');
    if (pathExists && !identityPresent) notes.push('IDENTITY.json missing — re-project to restore the binding');
    if (pathExists && !gitDirPresent) notes.push('.git directory absent (might be intentional for non-git spokes)');
    if (tokenVerdict !== null && tokenVerdict.verdict !== 'ok' && tokenVerdict.verdict !== 'unproven') {
        notes.push(`mount_token: ${tokenVerdict.reason}`);
    }

    let verdict: HealthVerdict = 'healthy';
    if (!pathExists || !isDir || !readable) verdict = 'unhealthy';
    else if (!identityPresent || !mountTokenOk) verdict = 'unhealthy';
    else if (!gitDirPresent) verdict = 'degraded';

    const heartbeatTimestamp = Date.now();
    const heartbeatWritten = database.touchSpokeHeartbeat(slug, spoke.repo_id, heartbeatTimestamp);

    return {
        slug,
        spoke_root: root,
        verdict,
        checks: {
            path_exists: pathExists,
            is_directory: isDir,
            readable,
            identity_present: identityPresent,
            git_dir_present: gitDirPresent,
            mount_token_ok: mountTokenOk,
        },
        notes,
        last_health_at: heartbeatWritten ? heartbeatTimestamp : (spoke.last_health_at ?? null),
        heartbeat_written: heartbeatWritten,
    };
}

/**
 * Verify a single spoke's authority artifacts against the recorded HUB_ACK + Hall.
 *
 * Detects: token drift between IDENTITY.json and the Hall, missing/modified
 * contract files, missing HUB_ACK, sha256 drift on any of the 4 contract files.
 * Read-only.
 *
 * @param slug normalized spoke slug
 * @returns per-check verdict + drift_detected aggregate flag
 */
export function verifySpoke(slug: string): SpokeVerifyReport {
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) {
        throw new Error(`spoke not registered: ${slug}`);
    }
    const profileDir = path.join(spoke.root_path, SPOKE_PROFILE_DIR);
    const paths = {
        identity: path.join(profileDir, IDENTITY_FILE),
        cstar_contract: path.join(profileDir, CSTAR_CONTRACT_FILE),
        capabilities: path.join(profileDir, CAPABILITIES_FILE),
        intake: path.join(profileDir, INTAKE_FILE),
        hub_ack: path.join(profileDir, HUB_ACK_FILE),
    };

    const hallAuthority = (spoke.metadata?.authority ?? {}) as Record<string, unknown>;
    const hallToken = typeof hallAuthority.mount_token === 'string' ? hallAuthority.mount_token : null;
    const tokenVerdict = verifyMountToken(spoke.root_path, hallToken);

    const ack = readHubAck(paths.hub_ack);
    const recorded = ack?.contract_sha256;

    const contract = {
        identity: compareSha(sha256File(paths.identity), recorded?.identity),
        cstar_contract: compareSha(sha256File(paths.cstar_contract), recorded?.cstar_contract),
        capabilities: compareSha(sha256File(paths.capabilities), recorded?.capabilities),
        intake: compareSha(sha256File(paths.intake), recorded?.intake),
    };

    const notes: string[] = [];
    if (ack === null) notes.push('HUB_ACK.json missing or unreadable; sha256 drift checks degraded');
    if (tokenVerdict.verdict !== 'ok' && tokenVerdict.verdict !== 'unproven') notes.push(`mount_token: ${tokenVerdict.reason}`);
    for (const [name, verdict] of Object.entries(contract)) {
        if (verdict === 'drift') notes.push(`${name} drift: on-disk sha256 differs from HUB_ACK record`);
        if (verdict === 'missing') notes.push(`${name} missing on disk`);
    }

    const driftDetected = tokenVerdict.verdict === 'mismatch'
        || tokenVerdict.verdict === 'identity_missing'
        || tokenVerdict.verdict === 'hall_missing'
        || ack === null
        || Object.values(contract).some((v) => v !== 'ok');

    return {
        slug,
        spoke_root: spoke.root_path,
        drift_detected: driftDetected,
        mount_token: tokenVerdict.verdict,
        mount_token_reason: tokenVerdict.reason,
        hall_token: hallToken,
        identity_token: tokenVerdict.identity_token,
        hub_ack_present: ack !== null,
        contract,
        contract_paths: paths,
        notes,
    };
}

/**
 * Prune the named (slug, root_path) pairs from `hall_mounted_spokes`.
 *
 * Targets are deleted by exact (slug, root_path) match, regardless of repo_id —
 * required to clean up phantoms registered under foreign hub roots.
 *
 * `cleanup_artifacts=true` also wipes the `<root>/.cstar/` directory if the
 * spoke's root path still exists on disk. The current cleanup case (all paths
 * gone) is a no-op for that flag; it exists for future cleanups where a real
 * spoke directory survives an unmount.
 *
 * @param targets exact rows to delete
 * @param options dry_run (default true), cleanup_artifacts (default false)
 * @returns per-target outcomes plus aggregate counts
 */
export function pruneSpokes(targets: readonly PruneTarget[], options: PruneOptions = {}): PruneResult {
    const dryRun = options.dry_run ?? true;
    const cleanupArtifacts = options.cleanup_artifacts ?? false;
    const outcomes: PruneOutcome[] = [];

    for (const t of targets) {
        const outcome: PruneOutcome = {
            slug: t.slug,
            root_path: t.root_path,
            hall_row_deleted: false,
            artifacts_deleted: false,
        };
        try {
            if (!dryRun) {
                outcome.hall_row_deleted = database.removeHallMountedSpokeByRootPath(t.slug, t.root_path);
            } else {
                // Dry-run: probe across ALL repo_ids — phantoms live under foreign hub roots.
                const all = database.listAllHallMountedSpokes();
                outcome.hall_row_deleted = all.some((r) => r.slug === t.slug && r.root_path === t.root_path);
            }

            if (cleanupArtifacts) {
                const artifactDir = path.join(t.root_path, SPOKE_PROFILE_DIR);
                if (pathExistsAsDir(artifactDir)) {
                    outcome.artifact_path = artifactDir;
                    if (!dryRun) {
                        fs.rmSync(artifactDir, { recursive: true, force: true });
                    }
                    outcome.artifacts_deleted = true;
                }
            }
        } catch (err) {
            outcome.error = err instanceof Error ? err.message : String(err);
        }
        outcomes.push(outcome);
    }

    const counts = {
        targets: outcomes.length,
        hall_rows_deleted: outcomes.filter((o) => o.hall_row_deleted && o.error === undefined).length,
        artifacts_deleted: outcomes.filter((o) => o.artifacts_deleted && o.error === undefined).length,
        errors: outcomes.filter((o) => o.error !== undefined).length,
    };

    return { dry_run: dryRun, cleanup_artifacts: cleanupArtifacts, outcomes, counts };
}
