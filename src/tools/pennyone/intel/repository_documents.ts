import path from 'node:path';
import crypto from 'node:crypto';
import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId, type HallDocumentMetadata, type HallDocumentRecord, type HallDocumentVersionRecord } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';

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
    const db = database.getWritableDb();
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
    const db = database.getReadDb();
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
    const db = database.getReadDb();
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
    const db = database.getWritableDb();
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
    const db = database.getReadDb();
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
    const db = database.getReadDb();
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
    void versionId;
    void destinationPath;
    throw new Error('legacy_hall_document_restore_retired_requires_operator_gate');
}
