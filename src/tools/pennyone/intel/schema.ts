import Database from 'better-sqlite3';
import { normalizeHallPath, buildHallRepositoryId } from  '../../../types/hall.js';
import fs from 'node:fs';
import path from 'node:path';

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
    const statePath = path.join(rootPath, '.agents', 'sovereign_state.json');
    if (!fs.existsSync(statePath)) {
        return {};
    }
    return parseJson(fs.readFileSync(statePath, 'utf-8'), {});
}

export function ensureColumn(database: Database.Database, tableName: string, columnName: string, columnSql: string): void {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
        return;
    }
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

export function ensureHallSchema(database: Database.Database, rootPath: string): void {
    const normalizedRoot = normalizeHallPath(rootPath);
    const repoId = buildHallRepositoryId(normalizedRoot);
    console.log(`[DEBUG] ensureHallSchema: rootPath=${rootPath}, normalizedRoot=${normalizedRoot}, repoId=${repoId}`);
    const legacyState = getLegacyState(rootPath);
    const framework = legacyState.framework ?? {};
    const now = Date.now();

    database.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS hall_repositories (
            repo_id TEXT PRIMARY KEY,
            root_path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'DORMANT',
            active_persona TEXT NOT NULL DEFAULT 'ALFRED',
            baseline_gungnir_score REAL NOT NULL DEFAULT 0,
            intent_integrity REAL NOT NULL DEFAULT 0,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hall_scans (
            scan_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_kind TEXT NOT NULL,
            status TEXT NOT NULL,
            baseline_gungnir_score REAL NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_scans_repo ON hall_scans(repo_id);

        CREATE TABLE IF NOT EXISTS hall_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id TEXT NOT NULL,
            scan_id TEXT NOT NULL,
            path TEXT NOT NULL,
            content_hash TEXT,
            language TEXT,
            gungnir_score REAL NOT NULL DEFAULT 0,
            matrix_json TEXT,
            imports_json TEXT,
            exports_json TEXT,
            intent_summary TEXT,
            interaction_summary TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(scan_id, path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_files_repo_path ON hall_files(repo_id, path);

        CREATE TABLE IF NOT EXISTS hall_episodic_memory (
            memory_id TEXT PRIMARY KEY,
            bead_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            tactical_summary TEXT NOT NULL,
            files_touched_json TEXT,
            successes_json TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_repo ON hall_episodic_memory(repo_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_bead ON hall_episodic_memory(bead_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_beads (
            bead_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_id TEXT,
            legacy_id INTEGER,
            target_kind TEXT NOT NULL DEFAULT 'FILE',
            target_ref TEXT,
            target_path TEXT,
            rationale TEXT NOT NULL,
            contract_refs_json TEXT,
            baseline_scores_json TEXT,
            acceptance_criteria TEXT,
            checker_shell TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN',
            assigned_agent TEXT,
            source_kind TEXT,
            triage_reason TEXT,
            resolution_note TEXT,
            resolved_validation_id TEXT,
            superseded_by TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(repo_id, legacy_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_beads_repo_status ON hall_beads(repo_id, status);

        CREATE TABLE IF NOT EXISTS hall_bead_critiques (
            critique_id TEXT PRIMARY KEY,
            bead_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            agent_expertise TEXT NOT NULL,
            critique TEXT NOT NULL,
            proposed_path TEXT NOT NULL,
            evidence_json TEXT NOT NULL,
            is_architect_approved INTEGER NOT NULL DEFAULT 0,
            architect_feedback TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_critiques_bead ON hall_bead_critiques(bead_id);

        CREATE TABLE IF NOT EXISTS hall_validation_runs (
            validation_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            scan_id TEXT,
            bead_id TEXT,
            target_path TEXT,
            verdict TEXT NOT NULL,
            sprt_verdict TEXT,
            pre_scores_json TEXT,
            post_scores_json TEXT,
            benchmark_json TEXT,
            notes TEXT,
            created_at INTEGER NOT NULL,
            legacy_trace_id INTEGER,
            UNIQUE(repo_id, legacy_trace_id),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_validation_repo ON hall_validation_runs(repo_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_skill_observations (
            observation_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            observation TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE TABLE IF NOT EXISTS hall_skill_proposals (
            proposal_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            bead_id TEXT,
            validation_id TEXT,
            target_path TEXT,
            contract_path TEXT,
            proposal_path TEXT,
            status TEXT NOT NULL,
            summary TEXT,
            promotion_note TEXT,
            promoted_at INTEGER,
            promoted_by TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
            FOREIGN KEY(validation_id) REFERENCES hall_validation_runs(validation_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_skill_proposals_repo
        ON hall_skill_proposals(repo_id, created_at);

        CREATE TABLE IF NOT EXISTS hall_planning_sessions (
            session_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            status TEXT NOT NULL,
            user_intent TEXT NOT NULL,
            normalized_intent TEXT NOT NULL,
            summary TEXT,
            latest_question TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_planning_repo
        ON hall_planning_sessions(repo_id, updated_at);

        CREATE TABLE IF NOT EXISTS hall_git_commits (
            commit_hash TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            author_name TEXT,
            author_email TEXT,
            authored_at INTEGER NOT NULL,
            committer_name TEXT,
            committer_email TEXT,
            committed_at INTEGER NOT NULL,
            message TEXT,
            parent_hashes_json TEXT,
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_git_commits_repo_date ON hall_git_commits(repo_id, committed_at);

        CREATE TABLE IF NOT EXISTS hall_git_diffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commit_hash TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            change_type TEXT NOT NULL,
            old_path TEXT,
            insertions INTEGER DEFAULT 0,
            deletions INTEGER DEFAULT 0,
            patch_text TEXT,
            FOREIGN KEY(commit_hash) REFERENCES hall_git_commits(commit_hash),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_git_diffs_commit ON hall_git_diffs(commit_hash);
        CREATE INDEX IF NOT EXISTS idx_hall_git_diffs_file ON hall_git_diffs(repo_id, file_path);

        CREATE TABLE IF NOT EXISTS hall_mounted_spokes (
            spoke_id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            kind TEXT NOT NULL,
            root_path TEXT NOT NULL,
            remote_url TEXT,
            default_branch TEXT,
            mount_status TEXT NOT NULL,
            trust_level TEXT NOT NULL,
            write_policy TEXT NOT NULL,
            projection_status TEXT NOT NULL,
            last_scan_at INTEGER,
            last_health_at INTEGER,
            metadata_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(repo_id, slug),
            UNIQUE(repo_id, root_path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_mounted_spokes_repo
        ON hall_mounted_spokes(repo_id, slug);

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
        framework.status ?? 'DORMANT',
        framework.active_persona ?? 'ALFRED',
        Number(framework.gungnir_score ?? 0),
        Number(framework.intent_integrity ?? 0),
        stringifyJson({
            source: 'legacy-sovereign-projection',
            sovereign_projection: {
                framework: {
                    last_awakening: Number(framework.last_awakening ?? 0),
                },
                identity: legacyState.identity ?? undefined,
                hall_of_records: legacyState.hall_of_records ?? undefined,
            },
        }),
        Number(framework.last_awakening ?? 0),
        now,
    );
}
