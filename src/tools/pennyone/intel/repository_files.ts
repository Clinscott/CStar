import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId, type HallFileRecord, type HallGitCommitRecord, type HallGitDiffRecord } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { createGungnirMatrix, type GungnirMatrix } from '../../../types/gungnir.js';

export function getHallFiles(rootPath: string = registry.getRoot(), scanId?: string): HallFileRecord[] {
    const db = database.getReadDb();
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
    const db = database.getReadDb();
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
    const db = database.getReadDb();
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
    const db = database.getReadDb();
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
    const db = database.getWritableDb();
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
    const db = database.getWritableDb();
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
    const db = database.getWritableDb();
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
    const db = database.getReadDb();
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
