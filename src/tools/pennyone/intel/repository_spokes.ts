import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId, type HallMountedSpokeRecord, type HallMountedSpokeStatus, type HallMountedSpokeKind, type HallMountedSpokeTrust, type HallMountedSpokeWritePolicy, type HallMountedSpokeProjectionStatus } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';

export function saveHallMountedSpoke(record: HallMountedSpokeRecord): void {
    const db = database.getWritableDb();
    db.prepare(`
        INSERT INTO hall_mounted_spokes (
            spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
            mount_status, trust_level, write_policy, projection_status,
            last_scan_at, last_health_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(spoke_id) DO UPDATE SET
            slug = excluded.slug,
            kind = excluded.kind,
            root_path = excluded.root_path,
            remote_url = excluded.remote_url,
            default_branch = excluded.default_branch,
            mount_status = excluded.mount_status,
            trust_level = excluded.trust_level,
            write_policy = excluded.write_policy,
            projection_status = excluded.projection_status,
            last_scan_at = excluded.last_scan_at,
            last_health_at = excluded.last_health_at,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.spoke_id,
        record.repo_id,
        record.slug,
        record.kind,
        normalizeHallPath(record.root_path),
        record.remote_url ?? null,
        record.default_branch ?? null,
        record.mount_status,
        record.trust_level,
        record.write_policy,
        record.projection_status,
        record.last_scan_at ?? null,
        record.last_health_at ?? null,
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function getHallMountedSpoke(
    slugOrId: string,
    rootPath: string = registry.getRoot(),
): HallMountedSpokeRecord | null {
    const db = database.tryGetReadDb(rootPath);
    if (!db) return null;
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = db.prepare(`
        SELECT spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
               mount_status, trust_level, write_policy, projection_status,
               last_scan_at, last_health_at, metadata_json, created_at, updated_at
        FROM hall_mounted_spokes
        WHERE repo_id = ? AND (slug = ? OR spoke_id = ?)
        LIMIT 1
    `).get(repoId, slugOrId, slugOrId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        spoke_id: String(row.spoke_id),
        repo_id: String(row.repo_id),
        slug: String(row.slug),
        kind: row.kind as HallMountedSpokeRecord['kind'],
        root_path: String(row.root_path),
        remote_url: row.remote_url ? String(row.remote_url) : undefined,
        default_branch: row.default_branch ? String(row.default_branch) : undefined,
        mount_status: row.mount_status as HallMountedSpokeStatus,
        trust_level: row.trust_level as HallMountedSpokeRecord['trust_level'],
        write_policy: row.write_policy as HallMountedSpokeRecord['write_policy'],
        projection_status: row.projection_status as HallMountedSpokeRecord['projection_status'],
        last_scan_at: row.last_scan_at ? Number(row.last_scan_at) : undefined,
        last_health_at: row.last_health_at ? Number(row.last_health_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function listHallMountedSpokes(rootPath: string = registry.getRoot()): HallMountedSpokeRecord[] {
    const db = database.tryGetReadDb(rootPath);
    if (!db) return [];
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = db.prepare(`
        SELECT spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
               mount_status, trust_level, write_policy, projection_status,
               last_scan_at, last_health_at, metadata_json, created_at, updated_at
        FROM hall_mounted_spokes
        WHERE repo_id = ?
        ORDER BY slug ASC
    `).all(repoId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        spoke_id: String(row.spoke_id),
        repo_id: String(row.repo_id),
        slug: String(row.slug),
        kind: row.kind as HallMountedSpokeRecord['kind'],
        root_path: String(row.root_path),
        remote_url: row.remote_url ? String(row.remote_url) : undefined,
        default_branch: row.default_branch ? String(row.default_branch) : undefined,
        mount_status: row.mount_status as HallMountedSpokeStatus,
        trust_level: row.trust_level as HallMountedSpokeRecord['trust_level'],
        write_policy: row.write_policy as HallMountedSpokeRecord['write_policy'],
        projection_status: row.projection_status as HallMountedSpokeRecord['projection_status'],
        last_scan_at: row.last_scan_at ? Number(row.last_scan_at) : undefined,
        last_health_at: row.last_health_at ? Number(row.last_health_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}

/**
 * List EVERY mounted-spoke row in the Hall, ignoring the active hub's repo_id.
 *
 * Required by `cstar_spoke action=doctor` so foreign-repo phantoms (test-fixture
 * residue under `/tmp/corvus-*` etc.) become visible. Production callers that
 * only care about the active hub should keep using `listHallMountedSpokes`.
 *
 * @returns every row in `hall_mounted_spokes`, sorted by repo_id then slug
 */
export function listAllHallMountedSpokes(): HallMountedSpokeRecord[] {
    const db = database.tryGetReadDb();
    if (!db) return [];
    const rows = db.prepare(`
        SELECT spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
               mount_status, trust_level, write_policy, projection_status,
               last_scan_at, last_health_at, metadata_json, created_at, updated_at
        FROM hall_mounted_spokes
        ORDER BY repo_id ASC, slug ASC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        spoke_id: String(row.spoke_id),
        repo_id: String(row.repo_id),
        slug: String(row.slug),
        kind: row.kind as HallMountedSpokeKind,
        root_path: String(row.root_path),
        remote_url: row.remote_url ? String(row.remote_url) : undefined,
        default_branch: row.default_branch ? String(row.default_branch) : undefined,
        mount_status: row.mount_status as HallMountedSpokeStatus,
        trust_level: row.trust_level as HallMountedSpokeTrust,
        write_policy: row.write_policy as HallMountedSpokeWritePolicy,
        projection_status: row.projection_status as HallMountedSpokeProjectionStatus,
        last_scan_at: row.last_scan_at ? Number(row.last_scan_at) : undefined,
        last_health_at: row.last_health_at ? Number(row.last_health_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}

export function removeHallMountedSpoke(slugOrId: string, rootPath: string = registry.getRoot()): boolean {
    const db = database.getWritableDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const result = db.prepare(`
        DELETE FROM hall_mounted_spokes
        WHERE repo_id = ? AND (slug = ? OR spoke_id = ?)
    `).run(repoId, slugOrId, slugOrId);

    return result.changes > 0;
}

/**
 * Touch `last_health_at` on a single hall_mounted_spokes row.
 *
 * Lightweight write — no metadata mutation, no projection_status change. Used
 * by `cstar_spoke action=health` and as a heartbeat from any read path that
 * just observed the spoke alive (link, project, manifest walk).
 *
 * Keys on (slug, repo_id) so heartbeat writes don't accidentally touch
 * foreign-repo phantoms.
 *
 * @param slug normalized spoke slug
 * @param repoId hub repo_id the heartbeat is recorded against
 * @param timestampMs epoch milliseconds; defaults to now
 * @returns true if a row was updated
 */
export function touchSpokeHeartbeat(slug: string, repoId: string, timestampMs: number = Date.now()): boolean {
    const db = database.getWritableDb();
    const result = db.prepare(`
        UPDATE hall_mounted_spokes
        SET last_health_at = ?, updated_at = ?
        WHERE slug = ? AND repo_id = ?
    `).run(timestampMs, timestampMs, slug, repoId);
    return result.changes > 0;
}

/**
 * Delete a hall_mounted_spokes row by exact (slug, root_path) pair.
 *
 * Unlike `removeHallMountedSpoke`, this does NOT scope to the active hub's
 * `repo_id`. Required for `cstar_spoke action=prune` to clean up phantom
 * rows registered under foreign repo_ids (typically test-fixture residue
 * left over after a scaffolded hub is torn down).
 *
 * @param slug normalized spoke slug
 * @param rootPath exact root_path stored in the row (will be normalized via normalizeHallPath for matching)
 * @returns true if a row was deleted
 */
export function removeHallMountedSpokeByRootPath(slug: string, rootPath: string): boolean {
    const db = database.getWritableDb();
    const normalized = normalizeHallPath(rootPath);
    const result = db.prepare(`
        DELETE FROM hall_mounted_spokes
        WHERE slug = ? AND root_path = ?
    `).run(slug, normalized);
    return result.changes > 0;
}
