import type Database from 'better-sqlite3';
import { normalizeHallPath, buildHallRepositoryId } from '../../../types/hall.js';
import path from 'node:path';
import { HALL_SCHEMA_CORE_SQL } from './schema_tables_core.js';
import { HALL_SCHEMA_RUNTIME_SQL } from './schema_tables_runtime.js';
import { HALL_SCHEMA_LEGACY_SQL } from './schema_tables_legacy.js';

function shouldEmitPennyOneDebugLogs(): boolean {
    return process.env.CSTAR_DEBUG_LOGS === '1';
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? {});
}

export function getLegacyState(rootPath: string): {
    framework?: {
        status?: 'AWAKE' | 'DORMANT' | 'AGENT_LOOP';
        active_persona?: string;
        gungnir_score?: number;
        intent_integrity?: number;
        last_awakening?: number;
    };
    identity?: Record<string, unknown>;
    hall_of_records?: {
        description?: string;
        primary_assets?: Record<string, unknown>;
    };
} {
    void rootPath;
    throw new Error('legacy_sovereign_state_reader_retired_use_cstar_hall_surfaces');
}

export function ensureColumn(database: Database.Database, tableName: string, columnName: string, columnSql: string): void {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
        return;
    }
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

function ensureVirtualTable(database: Database.Database, tableName: string, createSql: string): void {
    try {
        database.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`).get();
    } catch {
        database.exec(`DROP TABLE IF EXISTS ${tableName};`);
        database.exec(createSql);
    }
}

export function ensureHallSchema(database: Database.Database, rootPath: string): void {
    const normalizedRoot = normalizeHallPath(rootPath);
    const repoId = buildHallRepositoryId(normalizedRoot);
    if (shouldEmitPennyOneDebugLogs()) {
        console.log(`[DEBUG] ensureHallSchema: rootPath=${rootPath}, normalizedRoot=${normalizedRoot}, repoId=${repoId}`);
    }
    const now = Date.now();

    database.exec('PRAGMA foreign_keys = ON;');
    database.exec(HALL_SCHEMA_CORE_SQL);
    database.exec(HALL_SCHEMA_RUNTIME_SQL);
    database.exec(HALL_SCHEMA_LEGACY_SQL);

    ensureColumn(database, 'hall_beads', 'target_kind', "TEXT NOT NULL DEFAULT 'FILE'");
    ensureColumn(database, 'hall_beads', 'target_ref', 'TEXT');
    ensureColumn(database, 'hall_beads', 'source_kind', 'TEXT');
    ensureColumn(database, 'hall_beads', 'triage_reason', 'TEXT');
    ensureColumn(database, 'hall_beads', 'resolution_note', 'TEXT');
    ensureColumn(database, 'hall_beads', 'resolved_validation_id', 'TEXT');
    ensureColumn(database, 'hall_beads', 'checker_shell', 'TEXT');
    ensureColumn(database, 'hall_beads', 'superseded_by', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'summary', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'promotion_note', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'promoted_at', 'INTEGER');
    ensureColumn(database, 'hall_skill_proposals', 'promoted_by', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'metadata_json', 'TEXT');
    ensureColumn(database, 'hall_files', 'imports_json', 'TEXT');
    ensureColumn(database, 'hall_files', 'exports_json', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'summary', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'latest_question', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'architect_opinion', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'current_bead_id', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'metadata_json', 'TEXT');
    ensureColumn(database, 'hall_beads', 'architect_opinion', 'TEXT');
    ensureColumn(database, 'hall_beads', 'critique_payload_json', 'TEXT');
    ensureColumn(database, 'hall_beads', 'metadata_json', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'validation_id', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'validation_verdict', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'validation_notes_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'validation_authority', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'validation_evidence_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'provider', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'requested_model', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'actual_model', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'model_source', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'reasoning_profile', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'adapter_version', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'attempt_budget_class', "TEXT NOT NULL DEFAULT 'provider_or_unknown'");
    ensureColumn(database, 'hall_forge_attempts', 'provider_evidence_valid', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(database, 'hall_forge_attempts', 'provider_requests_started', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'provider_requests_completed', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'provider_requests_ambiguous', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'live_spend', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'live_spend_unknown', 'INTEGER NOT NULL DEFAULT 1');
    ensureColumn(database, 'hall_forge_attempts', 'known_spend_observed', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(database, 'hall_forge_attempts', 'live_source_collection', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'workspace_commit_present', 'INTEGER');
    ensureColumn(database, 'hall_forge_attempts', 'failure_evidence_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_attempts', 'failure_signature_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'operator_record_set_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'operator_record_count', 'INTEGER');
    ensureColumn(database, 'hall_forge_requests', 'requester_thread_id', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'requester_turn_id', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'requester_record_set_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'authorization_profile', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'authorization_binding_sha256', 'TEXT');
    ensureColumn(database, 'hall_forge_requests', 'authorization_challenge_sha256', 'TEXT');
    // Forge authorization migration belongs to the explicit Forge lifecycle;
    // ordinary Hall mutations must not consume or prepare one-use grants.
    ensureColumn(database, 'hall_mounted_spokes', 'last_health_attempt_at', 'INTEGER');
    ensureColumn(database, 'hall_validation_runs', 'authority_class', "TEXT NOT NULL DEFAULT 'legacy_unverified'");
    ensureColumn(database, 'hall_validation_runs', 'evidence_sha256', 'TEXT');
    ensureColumn(database, 'hall_validation_runs', 'validator_identity', 'TEXT');
    ensureColumn(database, 'hall_validation_runs', 'validator_identity_source', 'TEXT');
    ensureColumn(database, 'hall_validation_runs', 'evidence_manifest_json', 'TEXT');

    ensureVirtualTable(
        database,
        'intents_fts',
        `
            CREATE VIRTUAL TABLE intents_fts USING fts5(
                path UNINDEXED,
                intent,
                interaction_protocol
            );
        `,
    );

    ensureVirtualTable(
        database,
        'chronicles_fts',
        `
            CREATE VIRTUAL TABLE chronicles_fts USING fts5(
                source_file UNINDEXED,
                header,
                content,
                timestamp UNINDEXED
            );
        `,
    );

    ensureVirtualTable(
        database,
        'hall_documents_fts',
        `
            CREATE VIRTUAL TABLE hall_documents_fts USING fts5(
                path UNINDEXED,
                title,
                summary,
                content
            );
        `,
    );

    database.exec(`
        DROP VIEW IF EXISTS hall_repository_projection;
        CREATE VIEW hall_repository_projection AS
        SELECT
            r.repo_id,
            r.root_path,
            r.name,
            r.status,
            r.active_persona,
            r.baseline_gungnir_score,
            r.intent_integrity,
            (
                SELECT s.scan_id
                FROM hall_scans s
                WHERE s.repo_id = r.repo_id
                ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                LIMIT 1
            ) AS last_scan_id,
            (
                SELECT s.status
                FROM hall_scans s
                WHERE s.repo_id = r.repo_id
                ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                LIMIT 1
            ) AS last_scan_status,
            (
                SELECT COALESCE(s.completed_at, s.started_at)
                FROM hall_scans s
                WHERE s.repo_id = r.repo_id
                ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                LIMIT 1
            ) AS last_scan_at,
            (
                SELECT COUNT(*)
                FROM hall_beads b
                WHERE b.repo_id = r.repo_id
                  AND b.status IN ('OPEN', 'SET-PENDING', 'SET', 'IN_PROGRESS', 'READY_FOR_REVIEW')
            ) AS open_beads,
            (
                SELECT COUNT(*)
                FROM hall_validation_runs v
                WHERE v.repo_id = r.repo_id
            ) AS validation_runs,
            (
                SELECT MAX(v.created_at)
                FROM hall_validation_runs v
                WHERE v.repo_id = r.repo_id
            ) AS last_validation_at
        FROM hall_repositories r;
    `);

    database.prepare(`
        INSERT OR IGNORE INTO hall_repositories (
            repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
            intent_integrity, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        repoId,
        normalizedRoot,
        path.basename(normalizedRoot),
        'DORMANT',
        '',
        0,
        0,
        stringifyJson({
            source: 'hall-schema-bootstrap',
        }),
        now,
        now,
    );
}
