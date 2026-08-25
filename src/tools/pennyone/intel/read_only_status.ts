import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
    normalizeHallPath,
    type HallDocumentRecord,
    type HallRepositorySummary,
} from '../../../types/hall.js';

export interface PennyOneReadOnlyStatusEntry {
    root_path: string;
    summary: HallRepositorySummary | null;
    documents: HallDocumentRecord[];
}

export interface PennyOneReadOnlyStatusSnapshot {
    roots: string[];
    entries: PennyOneReadOnlyStatusEntry[];
    database_present: boolean;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.length === 0) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function readSummary(db: Database.Database, rootPath: string): HallRepositorySummary | null {
    const row = db.prepare(
        'SELECT * FROM hall_repository_projection WHERE root_path = ?',
    ).get(normalizeHallPath(rootPath)) as Record<string, unknown> | undefined;
    if (!row) return null;
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

function readDocuments(db: Database.Database, rootPath: string): HallDocumentRecord[] {
    const rows = db.prepare(`
        SELECT document_id, repo_id, root_path, path, title, doc_kind, status, latest_version_id,
               latest_content_hash, latest_summary, metadata_json, created_at, updated_at
        FROM hall_documents
        WHERE root_path = ?
        ORDER BY updated_at DESC, path ASC
    `).all(normalizeHallPath(rootPath)) as Array<Record<string, unknown>>;
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
        metadata: parseMetadata(row.metadata_json),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}

function readSnapshot(
    controlRoot: string,
    baseRoot: string,
    estate: boolean,
): PennyOneReadOnlyStatusSnapshot {
    const normalizedBase = normalizeHallPath(baseRoot);
    const databasePath = path.join(controlRoot, '.stats', 'pennyone.db');
    const stats = fs.lstatSync(databasePath, { throwIfNoEntry: false });
    if (!stats) {
        return {
            roots: [normalizedBase],
            entries: [{ root_path: normalizedBase, summary: null, documents: [] }],
            database_present: false,
        };
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`PennyOne status rejected non-regular Hall database path ${databasePath}.`);
    }

    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
        const roots = estate
            ? Array.from(new Set([
                normalizedBase,
                ...(db.prepare('SELECT root_path FROM hall_repositories ORDER BY root_path ASC').all() as Array<{ root_path: string }>)
                    .map((row) => normalizeHallPath(row.root_path)),
            ]))
            : [normalizedBase];
        return {
            roots,
            entries: roots.map((rootPath) => ({
                root_path: rootPath,
                summary: readSummary(db, rootPath),
                documents: readDocuments(db, rootPath),
            })),
            database_present: true,
        };
    } finally {
        db.close();
    }
}

export const pennyOneReadOnlyStatus = {
    read: readSnapshot,
};
