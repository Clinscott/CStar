import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId, type HallRepositoryRecord, type HallScanRecord, type HallFileRecord } from '../../../types/hall.js';
import { createGungnirMatrix, getGungnirOverall } from '../../../types/gungnir.js';
import { parseCanonicalPersona } from '../../../core/persona_contract.js';
import { isPersonaProjectionSelfConsistent } from '../persona_provenance.js';

function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function preserveSelfConsistentPersonaProjection(
    repoId: string,
    activePersona: string,
    metadata: unknown,
): Record<string, unknown> {
    const incoming = asMetadata(metadata);
    if (Object.prototype.hasOwnProperty.call(incoming, 'persona_projection')) {
        if (!isPersonaProjectionSelfConsistent(incoming, activePersona)) {
            delete incoming.persona_projection;
        }
        return incoming;
    }

    const existing = database.getWritableDb().prepare(`
        SELECT active_persona, metadata_json
        FROM hall_repositories
        WHERE repo_id = ?
        LIMIT 1
    `).get(repoId) as { active_persona?: unknown; metadata_json?: unknown } | undefined;
    const existingPersona = parseCanonicalPersona(existing?.active_persona);
    const incomingPersona = parseCanonicalPersona(activePersona);
    const existingMetadata = parseJson<Record<string, unknown>>(
        typeof existing?.metadata_json === 'string' ? existing.metadata_json : null,
        {},
    );
    if (
        existingPersona && incomingPersona
        && existingPersona === incomingPersona
        && isPersonaProjectionSelfConsistent(existingMetadata, existingPersona)
    ) {
        incoming.persona_projection = existingMetadata.persona_projection;
    }
    return incoming;
}

export function upsertHallRepository(record: Omit<HallRepositoryRecord, 'repo_id'> & { repo_id?: string }): HallRepositoryRecord {
    const db = database.getWritableDb();
    const normalizedRoot = normalizeHallPath(record.root_path);
    const repoId = record.repo_id ?? buildHallRepositoryId(normalizedRoot);
    const now = Math.max(record.updated_at, record.created_at, Date.now());
    const materialized: HallRepositoryRecord = {
        ...record,
        repo_id: repoId,
        root_path: normalizedRoot,
        metadata: preserveSelfConsistentPersonaProjection(repoId, record.active_persona, record.metadata),
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
    const db = database.getWritableDb();
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
    const db = database.getWritableDb();
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
