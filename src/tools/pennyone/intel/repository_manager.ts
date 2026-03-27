import Database from 'better-sqlite3';
import path from 'node:path';
import { database } from './database.js';
import { parseJson, stringifyJson, getLegacyState } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId } from '../../../types/hall.js';
import {
    HallRepositoryRecord,
    HallRepositorySummary,
    HallScanRecord,
    HallFileRecord,
    HallMountedSpokeRecord,
    HallMountedSpokeStatus,
    HallGitCommitRecord,
    HallGitDiffRecord,
    HallBeadRecord,
    HallValidationRun,
} from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { createGungnirMatrix, getGungnirOverall, type GungnirMatrix } from '../../../types/gungnir.js';
import { upsertHallBead, saveValidationRun as saveHallValidationRun } from './bead_controller.js';

export function upsertHallRepository(record: Omit<HallRepositoryRecord, 'repo_id'> & { repo_id?: string }): HallRepositoryRecord {
    const db = database.getDb();
    const normalizedRoot = normalizeHallPath(record.root_path);
    const now = Math.max(record.updated_at, record.created_at, Date.now());
    const materialized: HallRepositoryRecord = {
        ...record,
        repo_id: record.repo_id ?? buildHallRepositoryId(normalizedRoot),
        root_path: normalizedRoot,
        created_at: record.created_at || now,
        updated_at: now,
    };

    db.prepare(`
        INSERT INTO hall_repositories (
            repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
            intent_integrity, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_id) DO UPDATE SET
            root_path = excluded.root_path,
            name = excluded.name,
            status = excluded.status,
            active_persona = excluded.active_persona,
            baseline_gungnir_score = excluded.baseline_gungnir_score,
            intent_integrity = excluded.intent_integrity,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        materialized.repo_id,
        materialized.root_path,
        materialized.name,
        materialized.status,
        materialized.active_persona,
        materialized.baseline_gungnir_score,
        materialized.intent_integrity,
        stringifyJson(materialized.metadata),
        materialized.created_at,
        materialized.updated_at,
    );

    return materialized;
}

export function recordHallScan(record: HallScanRecord): void {
    const db = database.getDb();
    db.prepare(`
        INSERT INTO hall_scans (
            scan_id, repo_id, scan_kind, status, baseline_gungnir_score, started_at, completed_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id) DO UPDATE SET
            status = excluded.status,
            baseline_gungnir_score = excluded.baseline_gungnir_score,
            completed_at = excluded.completed_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.scan_id,
        record.repo_id,
        record.scan_kind,
        record.status,
        record.baseline_gungnir_score ?? 0,
        record.started_at,
        record.completed_at ?? null,
        stringifyJson(record.metadata),
    );
}

export function recordHallFile(record: HallFileRecord): void {
    const db = database.getDb();
    const materializedMatrix = record.matrix ? createGungnirMatrix(record.matrix) : undefined;
    db.prepare(`
        INSERT INTO hall_files (
            repo_id, scan_id, path, content_hash, language, gungnir_score,
            matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id, path) DO UPDATE SET
            content_hash = excluded.content_hash,
            language = excluded.language,
            gungnir_score = excluded.gungnir_score,
            matrix_json = excluded.matrix_json,
            imports_json = excluded.imports_json,
            exports_json = excluded.exports_json,
            intent_summary = excluded.intent_summary,
            interaction_summary = excluded.interaction_summary
    `).run(
        record.repo_id,
        record.scan_id,
        normalizeHallPath(record.path),
        record.content_hash ?? null,
        record.language ?? null,
        record.gungnir_score ?? getGungnirOverall(materializedMatrix),
        stringifyJson(materializedMatrix),
        stringifyJson(record.imports ?? []),
        stringifyJson(record.exports ?? []),
        record.intent_summary ?? null,
        record.interaction_summary ?? null,
        record.created_at,
    );
}

export function saveHallMountedSpoke(record: HallMountedSpokeRecord): void {
    const db = database.getDb();
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
    const db = database.getDb();
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
    const db = database.getDb();
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

export function removeHallMountedSpoke(slugOrId: string, rootPath: string = registry.getRoot()): boolean {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const result = db.prepare(`
        DELETE FROM hall_mounted_spokes
        WHERE repo_id = ? AND (slug = ? OR spoke_id = ?)
    `).run(repoId, slugOrId, slugOrId);

    return result.changes > 0;
}

export function getHallSummary(rootPath: string = registry.getRoot()): HallRepositorySummary | null {
    const db = database.getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const row = db.prepare('SELECT * FROM hall_repository_projection WHERE root_path = ?').get(normalizedRoot) as
        | Record<string, unknown>
        | undefined;
    if (!row) {
        return null;
    }
    return {
        repo_id: String(row.repo_id),
        root_path: String(row.root_path),
        name: String(row.name),
        status: row.status as HallRepositorySummary['status'],
        active_persona: String(row.active_persona),
        baseline_gungnir_score: Number(row.baseline_gungnir_score ?? 0),
        intent_integrity: Number(row.intent_integrity ?? 0),
        last_scan_id: row.last_scan_id ? String(row.last_scan_id) : undefined,
        last_scan_status: row.last_scan_status as HallRepositorySummary['last_scan_status'],
        last_scan_at: row.last_scan_at ? Number(row.last_scan_at) : undefined,
        open_beads: Number(row.open_beads ?? 0),
        validation_runs: Number(row.validation_runs ?? 0),
        last_validation_at: row.last_validation_at ? Number(row.last_validation_at) : undefined,
    };
}

export function getHallRepositoryRecord(rootPath: string = registry.getRoot()): HallRepositoryRecord | null {
    const db = database.getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const row = db.prepare(`
        SELECT repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
               intent_integrity, metadata_json, created_at, updated_at
        FROM hall_repositories
        WHERE root_path = ?
        LIMIT 1
    `).get(normalizedRoot) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        repo_id: String(row.repo_id),
        root_path: String(row.root_path),
        name: String(row.name),
        status: row.status as HallRepositoryRecord['status'],
        active_persona: String(row.active_persona),
        baseline_gungnir_score: Number(row.baseline_gungnir_score ?? 0),
        intent_integrity: Number(row.intent_integrity ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function getHallFiles(rootPath: string = registry.getRoot(), scanId?: string): HallFileRecord[] {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = (scanId
        ? db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND scan_id = ?
            ORDER BY path ASC
        `).all(repoId, scanId)
        : db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ?
            ORDER BY path ASC
        `).all(repoId)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        repo_id: String(row.repo_id),
        scan_id: String(row.scan_id),
        path: String(row.path),
        content_hash: row.content_hash ? String(row.content_hash) : undefined,
        language: row.language ? String(row.language) : undefined,
        gungnir_score: Number(row.gungnir_score ?? 0),
        matrix: createGungnirMatrix(parseJson<GungnirMatrix | undefined>(row.matrix_json as string | null, undefined)),
        imports: parseJson<HallFileRecord['imports']>(row.imports_json as string | null, []),
        exports: parseJson<string[]>(row.exports_json as string | null, []),
        intent_summary: row.intent_summary ? String(row.intent_summary) : undefined,
        interaction_summary: row.interaction_summary ? String(row.interaction_summary) : undefined,
        created_at: Number(row.created_at ?? 0),
    }));
}

export function getLatestHallScanId(rootPath: string = registry.getRoot()): string | undefined {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = db.prepare(`
        SELECT scan_id
        FROM hall_scans
        WHERE repo_id = ?
        ORDER BY COALESCE(completed_at, started_at) DESC
        LIMIT 1
    `).get(repoId) as Record<string, unknown> | undefined;

    return row?.scan_id ? String(row.scan_id) : undefined;
}

export function getHallFileByPath(
    filePath: string,
    rootPath: string = registry.getRoot(),
    scanId?: string,
): HallFileRecord | null {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const normalizedPath = normalizeHallPath(filePath);
    const activeScanId = scanId ?? getLatestHallScanId(rootPath);
    const row = (activeScanId
        ? db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND scan_id = ? AND path = ?
            LIMIT 1
        `).get(repoId, activeScanId, normalizedPath)
        : db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND path = ?
            ORDER BY created_at DESC
            LIMIT 1
        `).get(repoId, normalizedPath)) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        repo_id: String(row.repo_id),
        scan_id: String(row.scan_id),
        path: String(row.path),
        content_hash: row.content_hash ? String(row.content_hash) : undefined,
        language: row.language ? String(row.language) : undefined,
        gungnir_score: Number(row.gungnir_score ?? 0),
        matrix: createGungnirMatrix(parseJson<GungnirMatrix | undefined>(row.matrix_json as string | null, undefined)),
        imports: parseJson<HallFileRecord['imports']>(row.imports_json as string | null, []),
        exports: parseJson<string[]>(row.exports_json as string | null, []),
        intent_summary: row.intent_summary ? String(row.intent_summary) : undefined,
        interaction_summary: row.interaction_summary ? String(row.interaction_summary) : undefined,
        created_at: Number(row.created_at ?? 0),
    };
}

export function getHallFilesByIntentSummary(
    intentSummary: string,
    rootPath: string = registry.getRoot(),
    pathPrefix?: string,
): HallFileRecord[] {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const normalizedPrefix = pathPrefix ? normalizeHallPath(pathPrefix) : null;
    const likePrefix = normalizedPrefix ? `${normalizedPrefix.replace(/[\\/]$/, '')}%` : null;
    const rows = (likePrefix
        ? db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND intent_summary = ? AND path LIKE ?
            ORDER BY path ASC
        `).all(repoId, intentSummary, likePrefix)
        : db.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND intent_summary = ?
            ORDER BY path ASC
        `).all(repoId, intentSummary)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        repo_id: String(row.repo_id),
        scan_id: String(row.scan_id),
        path: String(row.path),
        content_hash: row.content_hash ? String(row.content_hash) : undefined,
        language: row.language ? String(row.language) : undefined,
        gungnir_score: Number(row.gungnir_score ?? 0),
        matrix: createGungnirMatrix(parseJson<GungnirMatrix | undefined>(row.matrix_json as string | null, undefined)),
        imports: parseJson<HallFileRecord['imports']>(row.imports_json as string | null, []),
        exports: parseJson<string[]>(row.exports_json as string | null, []),
        intent_summary: row.intent_summary ? String(row.intent_summary) : undefined,
        interaction_summary: row.interaction_summary ? String(row.interaction_summary) : undefined,
        created_at: Number(row.created_at ?? 0),
    }));
}

export function updateHallFileIntent(
    record: {
        repo_id: string;
        scan_id: string;
        path: string;
        intent_summary: string;
        interaction_summary?: string;
    },
): void {
    const db = database.getDb();
    db.prepare(`
        UPDATE hall_files
        SET intent_summary = ?, interaction_summary = ?
        WHERE repo_id = ? AND scan_id = ? AND path = ?
    `).run(
        record.intent_summary,
        record.interaction_summary ?? null,
        record.repo_id,
        record.scan_id,
        normalizeHallPath(record.path),
    );
}

export function saveHallGitCommit(record: HallGitCommitRecord): void {
    const db = database.getDb();
    db.prepare(`
        INSERT INTO hall_git_commits (
            commit_hash, repo_id, author_name, author_email, authored_at,
            committer_name, committer_email, committed_at, message, parent_hashes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(commit_hash) DO UPDATE SET
            repo_id = excluded.repo_id,
            author_name = excluded.author_name,
            author_email = excluded.author_email,
            authored_at = excluded.authored_at,
            committer_name = excluded.committer_name,
            committer_email = excluded.committer_email,
            committed_at = excluded.committed_at,
            message = excluded.message,
            parent_hashes_json = excluded.parent_hashes_json
    `).run(
        record.commit_hash,
        record.repo_id,
        record.author_name,
        record.author_email,
        record.authored_at,
        record.committer_name,
        record.committer_email,
        record.committed_at,
        record.message,
        stringifyJson(record.parent_hashes),
    );
}

export function saveHallGitDiff(record: HallGitDiffRecord): void {
    const db = database.getDb();
    db.prepare(`
        INSERT INTO hall_git_diffs (
            commit_hash, repo_id, file_path, change_type, old_path, insertions, deletions, patch_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        record.commit_hash,
        record.repo_id,
        record.file_path,
        record.change_type,
        record.old_path ?? null,
        record.insertions,
        record.deletions,
        record.patch_text ?? null,
    );
}

export function getHallGitHistory(repoId: string, limit: number = 100): HallGitCommitRecord[] {
    const db = database.getDb();
    const rows = db.prepare(`
        SELECT * FROM hall_git_commits
        WHERE repo_id = ?
        ORDER BY committed_at DESC
        LIMIT ?
    `).all(repoId, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        commit_hash: String(row.commit_hash),
        repo_id: String(row.repo_id),
        author_name: String(row.author_name),
        author_email: String(row.author_email),
        authored_at: Number(row.authored_at),
        committer_name: String(row.committer_name),
        committer_email: String(row.committer_email),
        committed_at: Number(row.committed_at),
        message: String(row.message),
        parent_hashes: parseJson<string[]>(row.parent_hashes_json as string | null, []),
    }));
}

function getLegacyTableColumns(db: Database.Database, tableName: string): string[] {
    return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((row) => row.name);
}

export function migrateLegacyHallRecords(rootPath: string = registry.getRoot()): {
    repository: HallRepositoryRecord;
    scans: number;
    beads: number;
    validation_runs: number;
} {
    const db = database.getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const legacyState = getLegacyState(rootPath);
    const repository = upsertHallRepository({
        root_path: normalizedRoot,
        name: path.basename(normalizedRoot),
        status: legacyState.framework?.status ?? 'DORMANT',
        active_persona: legacyState.framework?.active_persona ?? 'ALFRED',
        baseline_gungnir_score: Number(legacyState.framework?.gungnir_score ?? 0),
        intent_integrity: Number(legacyState.framework?.intent_integrity ?? 0),
        metadata: {
            source: 'migration',
        },
        created_at: Number(legacyState.framework?.last_awakening ?? 0),
        updated_at: Date.now(),
    });

    let scans = 0;
    let beads = 0;
    let validationRuns = 0;

    const beadColumns = getLegacyTableColumns(db, 'norn_beads');
    if (beadColumns.length > 0) {
        const rows = db.prepare('SELECT * FROM norn_beads').all() as Array<Record<string, unknown>>;
        for (const row of rows) {
            const status =
                row.status === 'OPEN' || row.status === 'IN_PROGRESS'
                    ? 'NEEDS_TRIAGE'
                    : row.status === 'RESOLVED'
                        ? 'ARCHIVED'
                        : ((row.status as HallBeadRecord['status']) ?? 'OPEN');
            upsertHallBead({
                bead_id: `legacy-bead:${row.id}`,
                repo_id: repository.repo_id,
                legacy_id: Number(row.id),
                rationale: String(row.description ?? ''),
                target_kind: 'OTHER',
                status,
                assigned_agent: (row.assigned_raven as string | undefined) ?? (row.agent_id as string | undefined),
                source_kind: 'LEGACY_IMPORT',
                triage_reason:
                    status === 'NEEDS_TRIAGE'
                        ? 'Imported legacy bead requires canonical target identity and acceptance criteria.'
                        : undefined,
                resolution_note:
                    status === 'ARCHIVED'
                        ? 'Imported legacy resolved bead preserved without canonical validation evidence.'
                        : undefined,
                created_at: Number(row.timestamp ?? Date.now()),
                updated_at: Number(row.timestamp ?? Date.now()),
            });
            beads += 1;
        }
    }

    const traceColumns = getLegacyTableColumns(db, 'mission_traces');
    if (traceColumns.length > 0) {
        const rows = db.prepare('SELECT * FROM mission_traces ORDER BY timestamp ASC').all() as Array<Record<string, unknown>>;
        const seenScans = new Set<string>();
        for (const row of rows) {
            const missionId = String(row.mission_id ?? `legacy-mission:${row.id}`);
            const scanId = `legacy-scan:${missionId}`;
            if (!seenScans.has(scanId)) {
                recordHallScan({
                    scan_id: scanId,
                    repo_id: repository.repo_id,
                    scan_kind: 'legacy_mission_trace',
                    status: 'COMPLETED',
                    baseline_gungnir_score: Number(row.initial_score ?? 0),
                    started_at: Number(row.timestamp ?? Date.now()),
                    completed_at: Number(row.timestamp ?? Date.now()),
                    metadata: {
                        mission_id: missionId,
                    },
                });
                seenScans.add(scanId);
                scans += 1;
            }

            saveHallValidationRun({
                validation_id: `legacy-validation:${row.id}`,
                repo_id: repository.repo_id,
                scan_id: scanId,
                target_path: row.file_path ? String(row.file_path) : undefined,
                verdict: (row.status as HallValidationRun['verdict']) ?? 'INCONCLUSIVE',
                sprt_verdict: 'legacy_trace',
                pre_scores: { overall: Number(row.initial_score ?? 0) },
                post_scores: { overall: Number(row.final_score ?? 0) },
                benchmark: { target_metric: row.target_metric ?? null },
                notes: row.justification ? String(row.justification) : undefined,
                created_at: Number(row.timestamp ?? Date.now()),
                legacy_trace_id: Number(row.id),
            });
            validationRuns += 1;
        }
    }

    return {
        repository,
        scans,
        beads,
        validation_runs: validationRuns,
    };
}

export function acquireLease(targetPath: string, agentId: string, durationMs: number = 300000): boolean {
    const db = database.getDb();
    const now = Date.now();
    const expiry = now + durationMs;
    const normalizedPath = targetPath.replace(/\\/g, '/');

    try {
        db.prepare('DELETE FROM task_leases WHERE lease_expiry < ?').run(now);
        db.prepare('INSERT INTO task_leases (target_path, agent_id, lease_expiry) VALUES (?, ?, ?)')
            .run(normalizedPath, agentId, expiry);
        return true;
    } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            const existing = db.prepare('SELECT agent_id FROM task_leases WHERE target_path = ?').get(normalizedPath) as { agent_id: string };
            if (existing && existing.agent_id === agentId) {
                db.prepare('UPDATE task_leases SET lease_expiry = ? WHERE target_path = ?').run(expiry, normalizedPath);
                return true;
            }
            return false;
        }
        throw err;
    }
}

export function releaseLease(targetPath: string, agentId: string): void {
    const db = database.getDb();
    const normalizedPath = targetPath.replace(/\\/g, '/');
    db.prepare('DELETE FROM task_leases WHERE target_path = ? AND agent_id = ?').run(normalizedPath, agentId);
}

export function updateFtsIndex(filePath: string, intent: string, protocol: string) {
    const db = database.getDb();
    const normalizedPath = filePath.replace(/\\/g, '/');

    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
            path UNINDEXED,
            intent,
            interaction_protocol
        )
    `);

    const isStructural = intent.includes('sector implements logic focusing on');
    if (isStructural) {
        const existing = db.prepare('SELECT intent FROM intents_fts WHERE path = ?').get(normalizedPath) as { intent: string } | undefined;
        if (existing && !existing.intent.includes('sector implements logic focusing on')) {
            return;
        }
    }

    db.prepare('DELETE FROM intents_fts WHERE path = ?').run(normalizedPath);
    db.prepare('INSERT INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)')
        .run(normalizedPath, intent, protocol);
}

export function updateChronicleIndex(sourceFile: string, header: string, content: string, timestamp: string = '') {
    const db = database.getDb();
    db.prepare('DELETE FROM chronicles_fts WHERE source_file = ? AND header = ?').run(sourceFile, header);
    db.prepare('INSERT INTO chronicles_fts (source_file, header, content, timestamp) VALUES (?, ?, ?, ?)')
        .run(sourceFile, header, content, timestamp);
}

export function searchIntents(query: string): any[] {
    const db = database.getDb();
    const safeQuery = buildSafeFtsQuery(query);
    if (!safeQuery) {
        return [];
    }

    const codeResults = db.prepare(`
        SELECT path, intent, interaction_protocol, rank, 'CODE' as type
        FROM intents_fts 
        WHERE intents_fts MATCH ? 
        ORDER BY rank
    `).all(safeQuery) as any[];

    const loreResults = db.prepare(`
        SELECT source_file as path, header as intent, content as interaction_protocol, rank, 'LORE' as type
        FROM chronicles_fts 
        WHERE chronicles_fts MATCH ? 
        ORDER BY rank
    `).all(safeQuery) as any[];

    const episodicResults = db.prepare(`
        SELECT memory_id as path, tactical_summary as intent, metadata_json as interaction_protocol, rank, 'ENGRAM' as type
        FROM hall_episodic_fts 
        WHERE hall_episodic_fts MATCH ? 
        ORDER BY rank
    `).all(safeQuery) as any[];

    return [...codeResults, ...loreResults, ...episodicResults].sort((a, b) => a.rank - b.rank);
}

function buildSafeFtsQuery(query: string): string {
    const tokens = query
        .split(/[^A-Za-z0-9_]+/g)
        .map((token) => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        return '';
    }

    const primaryTokens = tokens.filter((token) => token.length >= 3 && /[A-Za-z]/.test(token));
    const fallbackTokens = primaryTokens.length > 0
        ? primaryTokens
        : tokens.filter((token) => token.length >= 2 && /[A-Za-z]/.test(token));
    const safeTokens = fallbackTokens.length > 0 ? fallbackTokens : tokens;

    return safeTokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' ');
}
