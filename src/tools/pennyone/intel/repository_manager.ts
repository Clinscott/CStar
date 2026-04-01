import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { database } from './database.js';
import { parseJson, stringifyJson, getLegacyState } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId } from '../../../types/hall.js';
import {
    HallDocumentMetadata,
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
    HallDocumentRecord,
    HallDocumentVersionRecord,
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

export function listHallRepositories(rootPath: string = registry.getRoot()): HallRepositoryRecord[] {
    const db = database.getDb(rootPath);
    const rows = db.prepare(`
        SELECT repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
               intent_integrity, metadata_json, created_at, updated_at
        FROM hall_repositories
        ORDER BY updated_at DESC, root_path ASC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
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
    }));
}

export function reconcileLegacyHallRepositoryAliases(rootPath: string = registry.getRoot()): number {
    const db = database.getDb();
    const canonicalRoot = normalizeHallPath(rootPath);
    const canonicalRepoId = buildHallRepositoryId(canonicalRoot);
    const aliases = db.prepare(`
        SELECT repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
               intent_integrity, metadata_json, created_at, updated_at
        FROM hall_repositories
        WHERE root_path NOT LIKE '/%'
    `).all() as Array<Record<string, unknown>>;

    if (aliases.length === 0) {
        return 0;
    }

    const repoLinkedTables = [
        'hall_scans',
        'hall_files',
        'hall_episodic_memory',
        'hall_beads',
        'hall_bead_critiques',
        'hall_validation_runs',
        'hall_skill_observations',
        'hall_skill_activations',
        'hall_skill_proposals',
        'hall_planning_sessions',
        'hall_one_mind_broker',
        'hall_one_mind_requests',
        'hall_one_mind_branches',
        'hall_git_commits',
        'hall_git_diffs',
        'hall_documents',
        'hall_document_versions',
        'hall_mounted_spokes',
    ];

    const reconcile = db.transaction(() => {
        let updated = 0;

        for (const alias of aliases) {
            const aliasRepoId = String(alias.repo_id);
            const aliasRoot = String(alias.root_path);
            if (aliasRepoId === canonicalRepoId && aliasRoot === canonicalRoot) {
                continue;
            }

            const existingCanonical = db.prepare(`
                SELECT repo_id, metadata_json, created_at, updated_at
                FROM hall_repositories
                WHERE repo_id = ?
                LIMIT 1
            `).get(canonicalRepoId) as Record<string, unknown> | undefined;

            if (!existingCanonical) {
                db.prepare(`
                    INSERT INTO hall_repositories (
                        repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
                        intent_integrity, metadata_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    canonicalRepoId,
                    canonicalRoot,
                    path.basename(canonicalRoot),
                    String(alias.status),
                    String(alias.active_persona),
                    Number(alias.baseline_gungnir_score ?? 0),
                    Number(alias.intent_integrity ?? 0),
                    alias.metadata_json ?? null,
                    Number(alias.created_at ?? Date.now()),
                    Number(alias.updated_at ?? Date.now()),
                );
            } else {
                const mergedMetadata = {
                    ...parseJson<Record<string, unknown>>(alias.metadata_json as string | null, {}),
                    ...parseJson<Record<string, unknown>>(existingCanonical.metadata_json as string | null, {}),
                };
                db.prepare(`
                    UPDATE hall_repositories
                    SET metadata_json = ?, created_at = ?, updated_at = ?
                    WHERE repo_id = ?
                `).run(
                    stringifyJson(mergedMetadata),
                    Math.min(Number(existingCanonical.created_at ?? Date.now()), Number(alias.created_at ?? Date.now())),
                    Math.max(Number(existingCanonical.updated_at ?? 0), Number(alias.updated_at ?? 0)),
                    canonicalRepoId,
                );
            }

            for (const tableName of repoLinkedTables) {
                db.prepare(`UPDATE ${tableName} SET repo_id = ? WHERE repo_id = ?`).run(canonicalRepoId, aliasRepoId);
            }

            db.prepare('DELETE FROM hall_repositories WHERE repo_id = ?').run(aliasRepoId);
            updated += 1;
        }

        return updated;
    });

    return reconcile();
}

function deriveDocumentTitle(content: string, fallbackPath: string): string {
    const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (firstHeading) return firstHeading;
    return path.basename(fallbackPath);
}

function deriveDocumentSummary(content: string): string | undefined {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('#'));
    const summary = lines[0];
    return summary ? summary.slice(0, 280) : undefined;
}

function inferDocumentAuthorityTier(relativePath: string): HallDocumentMetadata['authority_tier'] {
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/docs/legacy_archive/') || normalized.startsWith('docs/legacy_archive/')) {
        return 'archive';
    }
    if (normalized.includes('/src/node/core/runtime/host_workflows/')
        || normalized.includes('/src/node/core/runtime/compat/')
        || normalized.endsWith('/.agents/skill_registry.json')
        || normalized.endsWith('/agents.qmd')) {
        return 'live_authority';
    }
    return 'reference';
}

function normalizeHallDocumentMetadata(relativePath: string, metadata?: Record<string, unknown>): HallDocumentMetadata {
    const normalized: HallDocumentMetadata = { ...(metadata ?? {}) };
    const authorityTier = normalized.authority_tier ?? inferDocumentAuthorityTier(relativePath);
    const archived = typeof normalized.archived === 'boolean'
        ? normalized.archived
        : authorityTier === 'archive';
    return {
        ...normalized,
        authority_tier: authorityTier,
        archived,
    };
}

export function saveHallDocumentSnapshot(input: {
    root_path: string;
    document_path: string;
    content: string;
    doc_kind?: string;
    title?: string;
    summary?: string;
    source_label?: string;
    metadata?: Record<string, unknown>;
    created_at?: number;
}): { document: HallDocumentRecord; version: HallDocumentVersionRecord; changed: boolean } {
    const db = database.getDb();
    const repoRoot = normalizeHallPath(input.root_path);
    const repoId = buildHallRepositoryId(repoRoot);
    const relativePath = normalizeHallPath(path.isAbsolute(input.document_path)
        ? path.relative(repoRoot, input.document_path)
        : input.document_path);
    const now = input.created_at ?? Date.now();
    const contentHash = crypto.createHash('sha256').update(input.content).digest('hex');
    const title = input.title?.trim() || deriveDocumentTitle(input.content, relativePath);
    const summary = input.summary?.trim() || deriveDocumentSummary(input.content);
    const metadata = normalizeHallDocumentMetadata(relativePath, input.metadata);
    const existing = db.prepare(`
        SELECT document_id, latest_version_id, latest_content_hash, title, doc_kind, status, latest_summary, metadata_json, created_at, updated_at
        FROM hall_documents
        WHERE repo_id = ? AND path = ?
        LIMIT 1
    `).get(repoId, relativePath) as Record<string, unknown> | undefined;

    const documentId = existing?.document_id
        ? String(existing.document_id)
        : `doc:${repoId}:${relativePath}`;

    if (existing?.latest_content_hash && String(existing.latest_content_hash) === contentHash) {
        const unchangedDocument: HallDocumentRecord = {
            document_id: documentId,
            repo_id: repoId,
            root_path: repoRoot,
            path: relativePath,
            title: String(existing.title ?? title),
            doc_kind: String(existing.doc_kind ?? (input.doc_kind ?? 'doctrine')),
            status: (existing.status as HallDocumentRecord['status']) ?? 'ACTIVE',
            latest_version_id: String(existing.latest_version_id),
            latest_content_hash: String(existing.latest_content_hash),
            latest_summary: existing.latest_summary ? String(existing.latest_summary) : summary,
            metadata: parseJson<Record<string, unknown>>(existing.metadata_json as string | null, metadata),
            created_at: Number(existing.created_at ?? now),
            updated_at: Number(existing.updated_at ?? now),
        };
        const unchangedVersion = getHallDocumentVersion(String(existing.latest_version_id));
        if (!unchangedVersion) {
            throw new Error(`Hall document version missing for ${documentId}.`);
        }
        return { document: unchangedDocument, version: unchangedVersion, changed: false };
    }

    const versionId = `docv:${documentId}:${now}`;
    db.prepare(`
        INSERT INTO hall_documents (
            document_id, repo_id, root_path, path, title, doc_kind, status, latest_version_id, latest_content_hash,
            latest_summary, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
            root_path = excluded.root_path,
            path = excluded.path,
            title = excluded.title,
            doc_kind = excluded.doc_kind,
            status = excluded.status,
            latest_version_id = excluded.latest_version_id,
            latest_content_hash = excluded.latest_content_hash,
            latest_summary = excluded.latest_summary,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        documentId,
        repoId,
        repoRoot,
        relativePath,
        title,
        input.doc_kind ?? 'doctrine',
        'ACTIVE',
        versionId,
        contentHash,
        summary ?? null,
        stringifyJson(metadata),
        existing?.created_at ? Number(existing.created_at) : now,
        now,
    );

    db.prepare(`
        INSERT INTO hall_document_versions (
            version_id, document_id, repo_id, content_hash, title, summary, content, source_label, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        versionId,
        documentId,
        repoId,
        contentHash,
        title,
        summary ?? null,
        input.content,
        input.source_label ?? null,
        stringifyJson(metadata),
        now,
    );

    db.prepare('DELETE FROM hall_documents_fts WHERE path = ?').run(relativePath);
    db.prepare(`
        INSERT INTO hall_documents_fts (path, title, summary, content)
        VALUES (?, ?, ?, ?)
    `).run(
        relativePath,
        title,
        summary ?? '',
        input.content,
    );

    const document = getHallDocumentRecord(repoRoot, relativePath);
    const version = getHallDocumentVersion(versionId);
    if (!document || !version) {
        throw new Error(`Failed to materialize Hall document snapshot for ${relativePath}.`);
    }
    return { document, version, changed: true };
}

export function getHallDocumentRecord(rootPath: string = registry.getRoot(), documentPath?: string): HallDocumentRecord | null {
    const db = database.getDb();
    const repoRoot = normalizeHallPath(rootPath);
    const repoId = buildHallRepositoryId(repoRoot);
    const normalizedPath = documentPath ? normalizeHallPath(documentPath) : undefined;
    const row = (normalizedPath
        ? db.prepare(`
            SELECT document_id, repo_id, root_path, path, title, doc_kind, status, latest_version_id,
                   latest_content_hash, latest_summary, metadata_json, created_at, updated_at
            FROM hall_documents
            WHERE repo_id = ? AND path = ?
            LIMIT 1
        `).get(repoId, normalizedPath)
        : db.prepare(`
            SELECT document_id, repo_id, root_path, path, title, doc_kind, status, latest_version_id,
                   latest_content_hash, latest_summary, metadata_json, created_at, updated_at
            FROM hall_documents
            WHERE repo_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
        `).get(repoId)) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
        document_id: String(row.document_id),
        repo_id: String(row.repo_id),
        root_path: String(row.root_path),
        path: String(row.path),
        title: String(row.title),
        doc_kind: String(row.doc_kind),
        status: row.status as HallDocumentRecord['status'],
        latest_version_id: String(row.latest_version_id),
        latest_content_hash: String(row.latest_content_hash),
        latest_summary: row.latest_summary ? String(row.latest_summary) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function listHallDocuments(rootPath: string = registry.getRoot()): HallDocumentRecord[] {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = db.prepare(`
        SELECT document_id, repo_id, root_path, path, title, doc_kind, status, latest_version_id,
               latest_content_hash, latest_summary, metadata_json, created_at, updated_at
        FROM hall_documents
        WHERE repo_id = ?
        ORDER BY updated_at DESC, path ASC
    `).all(repoId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        document_id: String(row.document_id),
        repo_id: String(row.repo_id),
        root_path: String(row.root_path),
        path: String(row.path),
        title: String(row.title),
        doc_kind: String(row.doc_kind),
        status: row.status as HallDocumentRecord['status'],
        latest_version_id: String(row.latest_version_id),
        latest_content_hash: String(row.latest_content_hash),
        latest_summary: row.latest_summary ? String(row.latest_summary) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}

export function backfillHallDocumentMetadata(rootPath: string = registry.getRoot()): number {
    const db = database.getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = db.prepare(`
        SELECT path, metadata_json
        FROM hall_documents
        WHERE repo_id = ?
    `).all(repoId) as Array<Record<string, unknown>>;

    let updated = 0;
    for (const row of rows) {
        const relativePath = String(row.path);
        const existing = parseJson<HallDocumentMetadata>(row.metadata_json as string | null, {});
        if (existing.authority_tier && typeof existing.archived === 'boolean') {
            continue;
        }
        const metadata = normalizeHallDocumentMetadata(relativePath, existing);
        db.prepare('UPDATE hall_documents SET metadata_json = ? WHERE repo_id = ? AND path = ?').run(
            stringifyJson(metadata),
            repoId,
            relativePath,
        );
        updated += 1;
    }

    return updated;
}

export function getHallDocumentVersion(versionId: string): HallDocumentVersionRecord | null {
    const db = database.getDb();
    const row = db.prepare(`
        SELECT version_id, document_id, repo_id, content_hash, title, summary, content, source_label, metadata_json, created_at
        FROM hall_document_versions
        WHERE version_id = ?
        LIMIT 1
    `).get(versionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        version_id: String(row.version_id),
        document_id: String(row.document_id),
        repo_id: String(row.repo_id),
        content_hash: String(row.content_hash),
        title: String(row.title),
        summary: row.summary ? String(row.summary) : undefined,
        content: String(row.content),
        source_label: row.source_label ? String(row.source_label) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
    };
}

export function listHallDocumentVersions(documentId: string): HallDocumentVersionRecord[] {
    const db = database.getDb();
    const rows = db.prepare(`
        SELECT version_id, document_id, repo_id, content_hash, title, summary, content, source_label, metadata_json, created_at
        FROM hall_document_versions
        WHERE document_id = ?
        ORDER BY created_at DESC
    `).all(documentId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        version_id: String(row.version_id),
        document_id: String(row.document_id),
        repo_id: String(row.repo_id),
        content_hash: String(row.content_hash),
        title: String(row.title),
        summary: row.summary ? String(row.summary) : undefined,
        content: String(row.content),
        source_label: row.source_label ? String(row.source_label) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
    }));
}

export function restoreHallDocumentVersion(versionId: string, destinationPath?: string): { path: string; content_hash: string } {
    const version = getHallDocumentVersion(versionId);
    if (!version) {
        throw new Error(`Hall document version '${versionId}' not found.`);
    }
    const db = database.getDb();
    const documentRow = db.prepare(`
        SELECT root_path, path
        FROM hall_documents
        WHERE document_id = ?
        LIMIT 1
    `).get(version.document_id) as Record<string, unknown> | undefined;
    if (!documentRow) {
        throw new Error(`Hall document '${version.document_id}' not found.`);
    }
    const rootPath = String(documentRow.root_path);
    const relativePath = String(documentRow.path);
    const absolutePath = destinationPath
        ? path.resolve(destinationPath)
        : path.join(rootPath, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, version.content, 'utf-8');
    return {
        path: normalizeHallPath(absolutePath),
        content_hash: version.content_hash,
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

function normalizeSearchPath(value: string | undefined): string {
    return (value ?? '').replace(/\\/g, '/').toLowerCase();
}

function isArchivedSearchPath(value: string | undefined): boolean {
    const normalized = normalizeSearchPath(value);
    return normalized.includes('/docs/legacy_archive/') || normalized.includes('/legacy_archive/');
}

function isCurrentAuthoritySearchPath(value: string | undefined): boolean {
    const normalized = normalizeSearchPath(value);
    return normalized.includes('/src/node/core/runtime/host_workflows/')
        || normalized.includes('/src/node/core/runtime/compat/')
        || normalized.endsWith('/.agents/skill_registry.json')
        || normalized.endsWith('/agents.qmd');
}

function parseDocumentSearchMetadata(value: unknown): HallDocumentMetadata {
    return parseJson<HallDocumentMetadata>(typeof value === 'string' ? value : null, {});
}

function isMaintenanceQuery(query: string): boolean {
    const normalized = query.toLowerCase();
    return [
        'maintenance',
        'status',
        'statuses',
        'normalize',
        'normalization',
        'hygiene',
        'receipt',
        'receipts',
        'report',
        'reports',
    ].some((token) => normalized.includes(token));
}

function isMaintenanceArtifact(metadata: HallDocumentMetadata): boolean {
    return metadata.receipt_kind === 'pennyone-normalize'
        || metadata.report_kind === 'pennyone-hall-hygiene'
        || metadata.status_kind === 'pennyone-maintenance-status';
}

function getMaintenanceArtifactBaseBoost(metadata: HallDocumentMetadata): number {
    if (metadata.status_kind === 'pennyone-maintenance-status') {
        return 45;
    }
    if (metadata.report_kind === 'pennyone-hall-hygiene') {
        return 35;
    }
    if (metadata.receipt_kind === 'pennyone-normalize') {
        return 30;
    }
    return 0;
}

function getMaintenanceRecencyBoost(updatedAt: number | undefined): number {
    if (!updatedAt || !Number.isFinite(updatedAt)) {
        return 0;
    }

    const ageMs = Math.max(0, Date.now() - updatedAt);
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDayMs = 7 * oneDayMs;

    if (ageMs <= oneDayMs) {
        return 25;
    }

    if (ageMs <= sevenDayMs) {
        return 15;
    }

    if (ageMs <= 30 * oneDayMs) {
        return 5;
    }

    return 0;
}

function scoreIndexedSearchResult(
    result: { path?: string; rank?: number; type?: string; metadata_json?: string | null; updated_at?: number | null },
    query: string,
): number {
    let score = typeof result.rank === 'number' ? result.rank : Number.POSITIVE_INFINITY;
    const metadata = parseDocumentSearchMetadata(result.metadata_json);

    if (metadata.archived === true || isArchivedSearchPath(result.path)) {
        score += 40;
    }

    if (metadata.authority_tier === 'live_authority' || isCurrentAuthoritySearchPath(result.path)) {
        score -= 20;
    }

    if (result.type === 'DOC' || result.type === 'LORE') {
        score += 5;
    }

    if (isMaintenanceQuery(query) && result.type === 'DOC' && isMaintenanceArtifact(metadata)) {
        score -= getMaintenanceArtifactBaseBoost(metadata);
        score -= getMaintenanceRecencyBoost(typeof result.updated_at === 'number' ? result.updated_at : undefined);
    }

    return score;
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

    const documentResults = db.prepare(`
        SELECT fts.path, fts.title as intent, COALESCE(fts.summary, fts.content) as interaction_protocol, docs.metadata_json, docs.updated_at, fts.rank, 'DOC' as type
        FROM hall_documents_fts AS fts
        LEFT JOIN hall_documents AS docs ON docs.path = fts.path
        WHERE hall_documents_fts MATCH ?
        ORDER BY rank
    `).all(safeQuery) as any[];

    return [...codeResults, ...loreResults, ...episodicResults, ...documentResults]
        .sort((a, b) => scoreIndexedSearchResult(a, query) - scoreIndexedSearchResult(b, query));
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
