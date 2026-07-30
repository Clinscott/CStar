import path from 'node:path';
import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId, type HallRepositoryRecord, type HallRepositorySummary } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { parseCanonicalPersona } from '../../../core/persona_contract.js';
import { isPersonaProjectionSelfConsistent } from '../persona_provenance.js';

export function getHallSummary(
    repositoryRoot: string = registry.getRoot(),
    hallRoot: string = registry.getRoot(),
): HallRepositorySummary | null {
    const db = database.tryGetReadDb(hallRoot);
    if (!db) return null;
    const normalizedRoot = normalizeHallPath(repositoryRoot);
    const row = db.prepare('SELECT * FROM hall_repository_projection WHERE root_path = ?').get(normalizedRoot) as
        | Record<string, unknown>
        | undefined;
    if (!row) {
        return null;
    }
    const repository = getHallRepositoryRecord(repositoryRoot, hallRoot);
    const candidatePersona = parseCanonicalPersona(repository?.active_persona);
    const activePersona = repository && candidatePersona
        && isPersonaProjectionSelfConsistent(repository.metadata, candidatePersona)
        ? candidatePersona : '';
    return {
        repo_id: String(row.repo_id),
        root_path: String(row.root_path),
        name: String(row.name),
        status: row.status as HallRepositorySummary['status'],
        active_persona: activePersona,
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

export function getHallRepositoryRecord(
    repositoryRoot: string = registry.getRoot(),
    hallRoot: string = registry.getRoot(),
): HallRepositoryRecord | null {
    const db = database.tryGetReadDb(hallRoot);
    if (!db) return null;
    const normalizedRoot = normalizeHallPath(repositoryRoot);
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

export function listHallRepositories(hallRoot: string = registry.getRoot()): HallRepositoryRecord[] {
    const db = database.tryGetReadDb(hallRoot);
    if (!db) return [];
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
    const db = database.getWritableDb();
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
