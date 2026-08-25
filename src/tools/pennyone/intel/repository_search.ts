import type Database from 'better-sqlite3';
import { database } from './database.js';
import { parseJson } from './schema.js';
import type { HallDocumentMetadata } from '../../../types/hall.js';

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
    result: { path?: string; rank?: number; type?: string; metadata_json?: string | null; updated_at?: number | null; gungnir_score_json?: string | null },
    query: string,
): number {
    let score = typeof result.rank === 'number' ? result.rank : Number.POSITIVE_INFINITY;
    const metadata = parseDocumentSearchMetadata(result.metadata_json);

    // [🔱] THE GUNGNIR BOOST: Prioritize high-fidelity results
    if (result.gungnir_score_json) {
        try {
            const gungnir = JSON.parse(result.gungnir_score_json);
            const omega = typeof gungnir.overall === 'number' ? gungnir.overall : 0;
            const logic = typeof gungnir.logic === 'number' ? gungnir.logic : 0;

            // Boost score based on Ω (0.0 to 10.0 scale)
            // Subtracting from rank score (lower is better in FTS5)
            score -= (omega * 5);

            // Penalize low logic scores
            if (logic < 5.0) {
                score += 30;
            }
        } catch {
            // Ignore parse errors
        }
    }

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
    const db = database.getReadDb();
    const safeQueries = buildSafeFtsQueries(query);
    if (safeQueries.length === 0) {
        return [];
    }

    for (const [index, safeQuery] of safeQueries.entries()) {
        const results = searchIndexedTables(db, safeQuery, query);
        if (results.length > 0) {
            return index === 0 ? results : results.slice(0, 30);
        }
    }

    return [];
}

function searchIndexedTables(db: Database.Database, safeQuery: string, originalQuery: string): any[] {
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
        SELECT
            fts.memory_id as path,
            fts.tactical_summary as intent,
            fts.metadata_json as interaction_protocol,
            fts.rank,
            'ENGRAM' as type,
            mem.metadata_json,
            mem.updated_at,
            beads.baseline_scores_json as gungnir_score_json
        FROM hall_episodic_fts AS fts
        JOIN hall_episodic_memory AS mem ON mem.memory_id = fts.memory_id
        LEFT JOIN hall_beads AS beads ON beads.bead_id = mem.bead_id
        WHERE hall_episodic_fts MATCH ?
        ORDER BY rank
    `).all(safeQuery) as any[];

    const lessonResults = db.prepare(`
        SELECT
            fts.lesson_id as path,
            fts.title as intent,
            fts.content as interaction_protocol,
            fts.rank,
            'LESSON' as type,
            l.metadata_json,
            l.updated_at
        FROM hall_lessons_fts AS fts
        JOIN hall_lessons AS l ON l.lesson_id = fts.lesson_id
        WHERE hall_lessons_fts MATCH ?
        ORDER BY rank
    `).all(safeQuery) as any[];

    const documentResults = db.prepare(`
        SELECT fts.path, fts.title as intent, COALESCE(fts.summary, fts.content) as interaction_protocol, docs.metadata_json, docs.updated_at, fts.rank, 'DOC' as type
        FROM hall_documents_fts AS fts
        LEFT JOIN hall_documents AS docs ON docs.path = fts.path
        WHERE hall_documents_fts MATCH ?
        ORDER BY rank
    `).all(safeQuery) as any[];

    return [...codeResults, ...loreResults, ...episodicResults, ...lessonResults, ...documentResults]
        .sort((a, b) => scoreIndexedSearchResult(a, originalQuery) - scoreIndexedSearchResult(b, originalQuery));
}

function buildSafeFtsQueries(query: string): string[] {
    const tokens = query
        .split(/[^A-Za-z0-9_]+/g)
        .map((token) => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        return [];
    }

    const primaryTokens = tokens.filter((token) => token.length >= 3 && /[A-Za-z]/.test(token));
    const fallbackTokens = primaryTokens.length > 0
        ? primaryTokens
        : tokens.filter((token) => token.length >= 2 && /[A-Za-z]/.test(token));
    const safeTokens = fallbackTokens.length > 0 ? fallbackTokens : tokens;
    const quotedTokens = safeTokens.map((token) => `"${token.replace(/"/g, '""')}"`);
    const strictQuery = quotedTokens.join(' ');
    const broadQuery = quotedTokens.join(' OR ');

    return strictQuery === broadQuery ? [strictQuery] : [strictQuery, broadQuery];
}
