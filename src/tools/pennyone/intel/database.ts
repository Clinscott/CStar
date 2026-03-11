import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { AgentPing } from '../types.ts';
import { registry } from '../pathRegistry.ts';
import { createGungnirMatrix, getGungnirOverall, type GungnirMatrix } from '../../../types/gungnir.ts';
import {
    HallBeadRecord,
    HallBeadStatus,
    HallFileRecord,
    HallMountedSpokeRecord,
    HallMountedSpokeStatus,
    HallRepositoryRecord,
    HallRepositorySummary,
    HallScanRecord,
    HallSkillObservation,
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
    HallSkillProposalRecord,
    HallValidationRun,
    buildHallRepositoryId,
    normalizeHallPath,
} from '../../../types/hall.ts';
import { getSovereignBeadOverallScore, materializeSovereignBead, type SovereignBead } from '../../../types/bead.ts';

let db: Database.Database | undefined;
let currentDbPath: string | undefined;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? {});
}

function getLegacyState(rootPath: string): {
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

function ensureHallSchema(database: Database.Database, rootPath: string): void {
    const normalizedRoot = normalizeHallPath(rootPath);
    const repoId = buildHallRepositoryId(normalizedRoot);
    const legacyState = getLegacyState(rootPath);
    const framework = legacyState.framework ?? {};
    const now = Date.now();

    database.exec(`
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
            intent_summary TEXT,
            interaction_summary TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(scan_id, path),
            FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_files_repo_path ON hall_files(repo_id, path);

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
                  AND b.status IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW')
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
    ensureColumn(database, 'hall_beads', 'superseded_by', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'summary', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'promotion_note', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'promoted_at', 'INTEGER');
    ensureColumn(database, 'hall_skill_proposals', 'promoted_by', 'TEXT');
    ensureColumn(database, 'hall_skill_proposals', 'metadata_json', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'summary', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'latest_question', 'TEXT');
    ensureColumn(database, 'hall_planning_sessions', 'metadata_json', 'TEXT');

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
                  AND b.status IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW')
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

    const existingRepository = database.prepare(`
        SELECT repo_id
        FROM hall_repositories
        WHERE repo_id = ?
        LIMIT 1
    `).get(repoId) as { repo_id: string } | undefined;

    if (!existingRepository) {
        database.prepare(`
            INSERT INTO hall_repositories (
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
}

/**
 * Get the database instance.
 * @returns {Database.Database} The db instance
 */
export function getDb(): Database.Database {
    const statsDir = path.join(registry.getRoot(), '.stats');
    const dbPath = path.join(statsDir, 'pennyone.db');

    // [Ω] BIFROST FIX: If the root has changed (e.g. during tests), close old db
    if (db && currentDbPath !== dbPath) {
        db.close();
        db = undefined;
    }

    if (db) return db;

    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }

    db = new Database(dbPath);
    currentDbPath = dbPath;

    // [Ω] Gungnir Schema: Spokes, Sessions & Pings
    db.exec(`
        CREATE TABLE IF NOT EXISTS spokes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            root_path TEXT UNIQUE NOT NULL,
            git_url TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spoke_id INTEGER,
            agent_id TEXT NOT NULL,
            start_timestamp INTEGER NOT NULL,
            end_timestamp INTEGER,
            total_pings INTEGER DEFAULT 0,
            FOREIGN KEY(spoke_id) REFERENCES spokes(id)
        );

        CREATE TABLE IF NOT EXISTS pings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            agent_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_path TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_pings_session ON pings(session_id);
        CREATE INDEX IF NOT EXISTS idx_pings_path ON pings(target_path);
        CREATE INDEX IF NOT EXISTS idx_sessions_spoke ON sessions(spoke_id);

        CREATE TABLE IF NOT EXISTS mission_traces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mission_id TEXT,
            file_path TEXT,
            target_metric TEXT,
            initial_score REAL,
            final_score REAL,
            justification TEXT,
            status TEXT,
            timestamp INTEGER
        );

        -- [🔱] THE WELL OF MIMIR: FTS5 Engine for Sovereign Search
        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
            path,
            intent,
            interaction_protocol,
            tokenize='porter unicode61'
        );

        -- [📜] THE CHRONICLES: Historical Memory & Dev Journal
        CREATE VIRTUAL TABLE IF NOT EXISTS chronicles_fts USING fts5(
            source_file,
            header,
            content,
            timestamp,
            tokenize='porter unicode61'
        );

        -- [🔒] THE FLOCK OF MUNINN: Task Leases for Concurrent Agent Execution
        CREATE TABLE IF NOT EXISTS task_leases (
            target_path TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            lease_expiry INTEGER NOT NULL
        );

        -- [🧵] THE LEDGER OF THE NORNS: Task Beads
        CREATE TABLE IF NOT EXISTS norn_beads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            agent_id TEXT,
            timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
        );

        -- [🔱] THE MEMORY SCRIBE: Skill Feedback Loop
        CREATE TABLE IF NOT EXISTS skill_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            skill TEXT NOT NULL,
            observation TEXT NOT NULL
        );
    `);

    ensureHallSchema(db, registry.getRoot());

    return db;
}

export interface MissionTrace {
    id?: number | string;
    mission_id: string;
    file_path: string;
    target_metric: string;
    initial_score: number;
    final_score?: number;
    justification: string;
    status: string;
    timestamp?: number;
}

function mapValidationRowToMissionTrace(row: Record<string, unknown>): MissionTrace {
    const benchmark = parseJson<Record<string, unknown>>(row.benchmark_json as string | null, {});
    const preScores = parseJson<Record<string, unknown>>(row.pre_scores_json as string | null, {});
    const postScores = parseJson<Record<string, unknown>>(row.post_scores_json as string | null, {});
    const validationId = String(row.validation_id ?? '');
    const compatibilityId = Number(row.compatibility_id ?? row.legacy_trace_id ?? 0);
    const missionId = benchmark.mission_id ? String(benchmark.mission_id) : row.scan_id ? String(row.scan_id) : validationId;

    return {
        id: compatibilityId || validationId,
        mission_id: missionId,
        file_path: String(row.target_path ?? ''),
        target_metric: String(benchmark.target_metric ?? 'overall'),
        initial_score: Number(preScores.overall ?? 0),
        final_score: Number(postScores.overall ?? 0),
        justification: String(row.notes ?? ''),
        status: String(row.verdict ?? 'INCONCLUSIVE'),
        timestamp: Number(row.created_at ?? 0),
    };
}

/**
 * Attempts to acquire an exclusive task lease for a target file.
 * @param {string} targetPath - The file to lock
 * @param {string} agentId - The ID of the agent requesting the lease
 * @param {number} durationMs - How long the lease is valid (default 5 mins)
 * @returns {boolean} True if lease acquired, false if held by another agent
 */
export function acquireLease(targetPath: string, agentId: string, durationMs: number = 300000): boolean {
    const database = getDb();
    const now = Date.now();
    const expiry = now + durationMs;
    const normalizedPath = targetPath.replace(/\\/g, '/');

    try {
        // Clean up expired leases first
        database.prepare('DELETE FROM task_leases WHERE lease_expiry < ?').run(now);

        // Attempt to insert a new lease
        database.prepare('INSERT INTO task_leases (target_path, agent_id, lease_expiry) VALUES (?, ?, ?)')
            .run(normalizedPath, agentId, expiry);
        return true;
    } catch (err: any) {
        // If constraint fails, it means an active lease exists
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            // Check if WE already hold the lease and just need to renew it
            const existing = database.prepare('SELECT agent_id FROM task_leases WHERE target_path = ?').get(normalizedPath) as { agent_id: string };
            if (existing && existing.agent_id === agentId) {
                database.prepare('UPDATE task_leases SET lease_expiry = ? WHERE target_path = ?').run(expiry, normalizedPath);
                return true;
            }
            return false;
        }
        throw err;
    }
}

/**
 * Releases a task lease.
 * @param {string} targetPath - The file to unlock
 * @param {string} agentId - The ID of the agent releasing the lease
 */
export function releaseLease(targetPath: string, agentId: string): void {
    const database = getDb();
    const normalizedPath = targetPath.replace(/\\/g, '/');
    database.prepare('DELETE FROM task_leases WHERE target_path = ? AND agent_id = ?').run(normalizedPath, agentId);
}

/**
 * Persists a Mission Trace to the database.
 * @param {MissionTrace} trace - The trace data
 */
export async function saveTrace(trace: MissionTrace) {
    const rootPath = normalizeHallPath(registry.getRoot());
    upsertHallRepository({
        root_path: rootPath,
        name: path.basename(rootPath),
        status: 'DORMANT',
        active_persona: 'ALFRED',
        baseline_gungnir_score: 0,
        intent_integrity: 0,
        metadata: { source: 'compat_trace' },
        created_at: trace.timestamp || Date.now(),
        updated_at: trace.timestamp || Date.now(),
    });

    saveHallValidationRun({
        validation_id: `compat-trace:${trace.mission_id}:${normalizeHallPath(trace.file_path)}:${trace.timestamp || Date.now()}`,
        repo_id: buildHallRepositoryId(rootPath),
        target_path: trace.file_path,
        verdict: (trace.status || 'INCONCLUSIVE') as HallValidationRun['verdict'],
        sprt_verdict: 'compat_trace',
        pre_scores: { overall: trace.initial_score },
        post_scores: { overall: trace.final_score || 0 },
        benchmark: { target_metric: trace.target_metric, mission_id: trace.mission_id },
        notes: trace.justification,
        created_at: trace.timestamp || Date.now(),
    });
}

/**
 * Registers a spoke in the database if it doesn't exist.
 * @param {string} targetRepo - The target repository path
 * @returns {number} The spoke ID
 */
export function registerSpoke(targetRepo: string): number {
    const database = getDb();
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const spokeName = path.basename(normalizedRepo);

    // Check if spoke already exists by path or name
    const spoke = database.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?').get(normalizedRepo, spokeName) as { id: number } | undefined;

    if (!spoke) {
        // Use INSERT OR IGNORE just in case of race conditions
        const stmt = database.prepare('INSERT OR IGNORE INTO spokes (name, root_path) VALUES (?, ?)');
        const result = stmt.run(spokeName, normalizedRepo);
        
        if (result.changes === 0) {
            // If nothing inserted, it existed (race condition), fetch it
            const existing = database.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?').get(normalizedRepo, spokeName) as { id: number };
            return existing.id;
        }
        return result.lastInsertRowid as number;
    }
    return spoke.id;
}

/**
 * Persists an AgentPing to the SQLite database.
 * @param {AgentPing} ping - The ping object
 * @param {string} targetRepo - The target repository path
 */
export async function savePing(ping: AgentPing, targetRepo: string) {
    // [Ω] Gungnir Security: Anti-Injection Sanitization
    const sanitizedAgentId = ping.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const validActions = ['SEARCH', 'READ', 'EDIT', 'EVALUATE', 'THINK'];
    const sanitizedAction = validActions.includes(ping.action) ? ping.action : 'THINK';

    const spokeId = registerSpoke(targetRepo);
    const database = getDb();

    // 1. Find or create the current active session for this agent in this spoke
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    let session = database.prepare('SELECT id FROM sessions WHERE agent_id = ? AND spoke_id = ? AND start_timestamp > ? ORDER BY id DESC LIMIT 1')
        .get(sanitizedAgentId, spokeId, oneHourAgo) as { id: number } | undefined;

    if (!session) {
        const stmt = database.prepare('INSERT INTO sessions (agent_id, spoke_id, start_timestamp) VALUES (?, ?, ?)');
        const result = stmt.run(sanitizedAgentId, spokeId, ping.timestamp);
        session = { id: result.lastInsertRowid as number };
    }

    // 2. Insert the ping (Strictly using placeholders)
    const insertPing = database.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)');
    insertPing.run(session.id, sanitizedAgentId, sanitizedAction, ping.target_path, ping.timestamp);

    // 3. Update session stats
    database.prepare('UPDATE sessions SET total_pings = total_pings + 1, end_timestamp = ? WHERE id = ?')
        .run(ping.timestamp, session.id);
}

/**
 * [O.D.I.N.]: "Retrieving the scrolls of past campaigns."
 * @param {string} targetRepo - The target repository path
 * @returns {Record<string, unknown>[]} The session summaries
 */
export function getSessionsWithSummaries(targetRepo: string): Record<string, unknown>[] {
    const database = getDb();
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');

    const sessions = database.prepare(`
        SELECT s.*, sp.name as spoke_name,
        (SELECT target_path FROM pings WHERE session_id = s.id GROUP BY target_path ORDER BY COUNT(*) DESC LIMIT 1) as primary_target
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        WHERE sp.root_path = ?
        ORDER BY s.start_timestamp DESC
    `).all(normalizedRepo) as Record<string, unknown>[];

    return sessions.map(s => {
        const start = s.start_timestamp as number;
        const end = s.end_timestamp as number | null;
        const duration = end ? Math.round((end - start) / 1000) : 0;
        const primaryTarget = s.primary_target as string | undefined;
        const targetFile = primaryTarget ? path.basename(primaryTarget) : 'unknown';

        return {
            ...s,
            summary: `Agent ${s.agent_id} performed ${s.total_pings} actions over ${duration}s. Primary focus: ${targetFile}.`
        };
    });
}

/**
 * Retrieves mission traces for a specific file in chronological order.
 * @param {string} filePath - The file path to query
 * @returns {MissionTrace[]} The traces
 */
export function getTracesForFile(filePath: string): MissionTrace[] {
    const database = getDb();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const rows = database.prepare(`
        SELECT rowid AS compatibility_id, *
        FROM hall_validation_runs 
        WHERE target_path LIKE ? 
        ORDER BY created_at ASC
    `).all(`%${normalizedPath}%`) as Array<Record<string, unknown>>;
    return rows.map(mapValidationRowToMissionTrace);
}

/**
 * Retrieves all pings for a specific session in chronological order.
 * @param {number} sessionId - The session ID
 * @param {string} targetRepo - The target repository path
 * @param _targetRepo
 * @returns {AgentPing[]} The pings
 */
export function getSessionPings(sessionId: number, _targetRepo: string): AgentPing[] {
    const database = getDb();
    return database.prepare('SELECT agent_id, action, target_path, timestamp FROM pings WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId) as AgentPing[];
}

/**
 * Updates the FTS index for a file's intent.
 * @param {string} filePath - The file path
 * @param {string} intent - The analyzed intent
 * @param {string} protocol - The interaction protocol
 */
export function updateFtsIndex(filePath: string, intent: string, protocol: string) {
    const database = getDb();
    const normalizedPath = filePath.replace(/\\/g, '/');

    // UPSERT pattern for FTS5 (Delete then Insert is safest for FTS)
    database.prepare('DELETE FROM intents_fts WHERE path = ?').run(normalizedPath);
    database.prepare('INSERT INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)')
        .run(normalizedPath, intent, protocol);
}

/**
 * Updates the Chronicle index for a specific lore chunk.
 * @param {string} sourceFile - The source file (dev_journal.qmd, memory.qmd)
 * @param {string} header - The header/date of the entry
 * @param {string} content - The entry content
 * @param {string} timestamp - Optional timestamp string
 */
export function updateChronicleIndex(sourceFile: string, header: string, content: string, timestamp: string = '') {
    const database = getDb();
    // We use a simple hash of source+header to prevent duplicates for the same entry
    const entryId = `${sourceFile}#${header}`;
    database.prepare('DELETE FROM chronicles_fts WHERE source_file = ? AND header = ?').run(sourceFile, header);
    database.prepare('INSERT INTO chronicles_fts (source_file, header, content, timestamp) VALUES (?, ?, ?, ?)')
        .run(sourceFile, header, content, timestamp);
}

/**
 * Performs a high-fidelity FTS5 search across file intents and chronicles.
 * @param {string} query - The search query
 * @returns {any[]} The matching results
 */
export function searchIntents(query: string): any[] {
    const database = getDb();
    
    // Sanitize query for FTS5 (escape single quotes)
    const safeQuery = query.replace(/'/g, ' ');

    // 1. Search Code Intents
    const codeResults = database.prepare(`
        SELECT path, intent, interaction_protocol, rank, 'CODE' as type
        FROM intents_fts 
        WHERE intents_fts MATCH ? 
        ORDER BY rank
    `).all(safeQuery) as any[];

    // 2. Search Chronicles
    const loreResults = database.prepare(`
        SELECT source_file as path, header as intent, content as interaction_protocol, rank, 'LORE' as type
        FROM chronicles_fts 
        WHERE chronicles_fts MATCH ? 
        ORDER BY rank
    `).all(safeQuery) as any[];

    // 3. Unify and Sort by Rank
    return [...codeResults, ...loreResults].sort((a, b) => a.rank - b.rank);
}

/**
 * Retrieves the most recent sessions across all spokes.
 * @param {number} limit - The number of sessions to retrieve
 * @returns {any[]} The recent sessions
 */
export function getRecentSessions(limit: number = 20): any[] {
    const database = getDb();
    return database.prepare(`
        SELECT s.*, sp.name as spoke_name, sp.root_path as spoke_path
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        ORDER BY s.start_timestamp DESC
        LIMIT ?
    `).all(limit);
}

/**
 * Retrieves all pings for a specific session.
 * @param {number} sessionId - The session ID
 * @returns {any[]} The pings in chronological order
 */
export function getPingsForSession(sessionId: number): any[] {
    const database = getDb();
    return database.prepare(`
        SELECT * FROM pings 
        WHERE session_id = ? 
        ORDER BY timestamp ASC
    `).all(sessionId);
}

function getLegacyTableColumns(tableName: string): string[] {
    const database = getDb();
    return (database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((row) => row.name);
}

function ensureColumn(database: Database.Database, tableName: string, columnName: string, columnSql: string): void {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
        return;
    }
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

export function upsertHallRepository(record: Omit<HallRepositoryRecord, 'repo_id'> & { repo_id?: string }): HallRepositoryRecord {
    const database = getDb();
    const normalizedRoot = normalizeHallPath(record.root_path);
    const now = Math.max(record.updated_at, record.created_at, Date.now());
    const materialized: HallRepositoryRecord = {
        ...record,
        repo_id: record.repo_id ?? buildHallRepositoryId(normalizedRoot),
        root_path: normalizedRoot,
        created_at: record.created_at || now,
        updated_at: now,
    };

    database.prepare(`
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
    const database = getDb();
    database.prepare(`
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
    const database = getDb();
    const materializedMatrix = record.matrix ? createGungnirMatrix(record.matrix) : undefined;
    database.prepare(`
        INSERT INTO hall_files (
            repo_id, scan_id, path, content_hash, language, gungnir_score,
            matrix_json, intent_summary, interaction_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id, path) DO UPDATE SET
            content_hash = excluded.content_hash,
            language = excluded.language,
            gungnir_score = excluded.gungnir_score,
            matrix_json = excluded.matrix_json,
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
        record.intent_summary ?? null,
        record.interaction_summary ?? null,
        record.created_at,
    );
}

export function upsertHallBead(record: HallBeadRecord): void {
    const database = getDb();
    database.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, rationale, contract_refs_json,
            baseline_scores_json, acceptance_criteria, status, assigned_agent, source_kind, triage_reason,
            resolution_note, resolved_validation_id, superseded_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bead_id) DO UPDATE SET
            scan_id = excluded.scan_id,
            legacy_id = excluded.legacy_id,
            target_kind = excluded.target_kind,
            target_ref = excluded.target_ref,
            target_path = excluded.target_path,
            rationale = excluded.rationale,
            contract_refs_json = excluded.contract_refs_json,
            baseline_scores_json = excluded.baseline_scores_json,
            acceptance_criteria = excluded.acceptance_criteria,
            status = excluded.status,
            assigned_agent = excluded.assigned_agent,
            source_kind = excluded.source_kind,
            triage_reason = excluded.triage_reason,
            resolution_note = excluded.resolution_note,
            resolved_validation_id = excluded.resolved_validation_id,
            superseded_by = excluded.superseded_by,
            updated_at = excluded.updated_at
    `).run(
        record.bead_id,
        record.repo_id,
        record.scan_id ?? null,
        record.legacy_id ?? null,
        record.target_kind ?? (record.target_path ? 'FILE' : 'OTHER'),
        record.target_ref ? (record.target_ref.includes('/') ? normalizeHallPath(record.target_ref) : record.target_ref) : null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        record.rationale,
        stringifyJson(record.contract_refs ?? []),
        stringifyJson(record.baseline_scores ?? {}),
        record.acceptance_criteria ?? null,
        record.status,
        record.assigned_agent ?? null,
        record.source_kind ?? null,
        record.triage_reason ?? null,
        record.resolution_note ?? null,
        record.resolved_validation_id ?? null,
        record.superseded_by ?? null,
        record.created_at,
        record.updated_at,
    );
}

export function saveHallValidationRun(record: HallValidationRun): void {
    const database = getDb();
    database.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, scan_id, bead_id, target_path, verdict, sprt_verdict,
            pre_scores_json, post_scores_json, benchmark_json, notes, created_at, legacy_trace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(validation_id) DO UPDATE SET
            verdict = excluded.verdict,
            sprt_verdict = excluded.sprt_verdict,
            pre_scores_json = excluded.pre_scores_json,
            post_scores_json = excluded.post_scores_json,
            benchmark_json = excluded.benchmark_json,
            notes = excluded.notes
    `).run(
        record.validation_id,
        record.repo_id,
        record.scan_id ?? null,
        record.bead_id ?? null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        record.verdict,
        record.sprt_verdict ?? null,
        stringifyJson(record.pre_scores),
        stringifyJson(record.post_scores),
        stringifyJson(record.benchmark),
        record.notes ?? null,
        record.created_at,
        record.legacy_trace_id ?? null,
    );
}

export function saveHallSkillObservation(record: HallSkillObservation): void {
    const database = getDb();
    database.prepare(`
        INSERT INTO hall_skill_observations (
            observation_id, repo_id, skill_id, outcome, observation, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(observation_id) DO UPDATE SET
            outcome = excluded.outcome,
            observation = excluded.observation,
            metadata_json = excluded.metadata_json
    `).run(
        record.observation_id,
        record.repo_id,
        record.skill_id,
        record.outcome,
        record.observation,
        record.created_at,
        stringifyJson(record.metadata),
    );
}

export function saveHallPlanningSession(record: HallPlanningSessionRecord): void {
    const database = getDb();
    database.prepare(`
        INSERT INTO hall_planning_sessions (
            session_id, repo_id, skill_id, status, user_intent, normalized_intent,
            summary, latest_question, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            status = excluded.status,
            user_intent = excluded.user_intent,
            normalized_intent = excluded.normalized_intent,
            summary = excluded.summary,
            latest_question = excluded.latest_question,
            updated_at = excluded.updated_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.session_id,
        record.repo_id,
        record.skill_id,
        record.status,
        record.user_intent,
        record.normalized_intent,
        record.summary ?? null,
        record.latest_question ?? null,
        record.created_at,
        record.updated_at,
        stringifyJson(record.metadata),
    );
}

export function saveHallSkillProposal(record: HallSkillProposalRecord): void {
    const database = getDb();
    database.prepare(`
        INSERT INTO hall_skill_proposals (
            proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
            proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
            created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
            skill_id = excluded.skill_id,
            bead_id = excluded.bead_id,
            validation_id = excluded.validation_id,
            target_path = excluded.target_path,
            contract_path = excluded.contract_path,
            proposal_path = excluded.proposal_path,
            status = excluded.status,
            summary = excluded.summary,
            promotion_note = excluded.promotion_note,
            promoted_at = excluded.promoted_at,
            promoted_by = excluded.promoted_by,
            updated_at = excluded.updated_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.proposal_id,
        record.repo_id,
        record.skill_id,
        record.bead_id ?? null,
        record.validation_id ?? null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        record.contract_path ? normalizeHallPath(record.contract_path) : null,
        record.proposal_path ? normalizeHallPath(record.proposal_path) : null,
        record.status,
        record.summary ?? null,
        record.promotion_note ?? null,
        record.promoted_at ?? null,
        record.promoted_by ?? null,
        record.created_at,
        record.updated_at,
        stringifyJson(record.metadata),
    );
}

export function getHallSkillProposal(proposalId: string): HallSkillProposalRecord | null {
    const database = getDb();
    const row = database.prepare(`
        SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
               proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
               created_at, updated_at, metadata_json
        FROM hall_skill_proposals
        WHERE proposal_id = ?
        LIMIT 1
    `).get(proposalId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        proposal_id: String(row.proposal_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallSkillProposalRecord['status'],
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        validation_id: row.validation_id ? String(row.validation_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        contract_path: row.contract_path ? String(row.contract_path) : undefined,
        proposal_path: row.proposal_path ? String(row.proposal_path) : undefined,
        summary: row.summary ? String(row.summary) : undefined,
        promotion_note: row.promotion_note ? String(row.promotion_note) : undefined,
        promoted_at: row.promoted_at ? Number(row.promoted_at) : undefined,
        promoted_by: row.promoted_by ? String(row.promoted_by) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    };
}

export function getHallPlanningSession(sessionId: string): HallPlanningSessionRecord | null {
    const database = getDb();
    const row = database.prepare(`
        SELECT session_id, repo_id, skill_id, status, user_intent, normalized_intent,
               summary, latest_question, created_at, updated_at, metadata_json
        FROM hall_planning_sessions
        WHERE session_id = ?
        LIMIT 1
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        session_id: String(row.session_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallPlanningSessionStatus,
        user_intent: String(row.user_intent),
        normalized_intent: String(row.normalized_intent),
        summary: row.summary ? String(row.summary) : undefined,
        latest_question: row.latest_question ? String(row.latest_question) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    };
}

export function saveHallMountedSpoke(record: HallMountedSpokeRecord): void {
    const database = getDb();
    database.prepare(`
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
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = database.prepare(`
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
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = database.prepare(`
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
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const result = database.prepare(`
        DELETE FROM hall_mounted_spokes
        WHERE repo_id = ? AND (slug = ? OR spoke_id = ?)
    `).run(repoId, slugOrId, slugOrId);

    return result.changes > 0;
}

export function listHallSkillProposals(
    rootPath: string = registry.getRoot(),
    options: {
        skill_id?: string;
        statuses?: HallSkillProposalRecord['status'][];
    } = {},
): HallSkillProposalRecord[] {
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
               proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
               created_at, updated_at, metadata_json
        FROM hall_skill_proposals
        WHERE repo_id = ?
    `;

    if (options.skill_id) {
        sql += ' AND skill_id = ?';
        params.push(options.skill_id);
    }
    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }
    sql += ' ORDER BY created_at DESC';

    const rows = database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        proposal_id: String(row.proposal_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallSkillProposalRecord['status'],
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        validation_id: row.validation_id ? String(row.validation_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        contract_path: row.contract_path ? String(row.contract_path) : undefined,
        proposal_path: row.proposal_path ? String(row.proposal_path) : undefined,
        summary: row.summary ? String(row.summary) : undefined,
        promotion_note: row.promotion_note ? String(row.promotion_note) : undefined,
        promoted_at: row.promoted_at ? Number(row.promoted_at) : undefined,
        promoted_by: row.promoted_by ? String(row.promoted_by) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    }));
}

export function listHallPlanningSessions(
    rootPath: string = registry.getRoot(),
    options: {
        statuses?: HallPlanningSessionStatus[];
    } = {},
): HallPlanningSessionRecord[] {
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT session_id, repo_id, skill_id, status, user_intent, normalized_intent,
               summary, latest_question, created_at, updated_at, metadata_json
        FROM hall_planning_sessions
        WHERE repo_id = ?
    `;

    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }

    sql += ' ORDER BY updated_at DESC';
    const rows = database.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        session_id: String(row.session_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallPlanningSessionStatus,
        user_intent: String(row.user_intent),
        normalized_intent: String(row.normalized_intent),
        summary: row.summary ? String(row.summary) : undefined,
        latest_question: row.latest_question ? String(row.latest_question) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    }));
}

export function getHallValidationRun(validationId: string): HallValidationRun | null {
    const database = getDb();
    const row = database.prepare(`
        SELECT validation_id, repo_id, scan_id, bead_id, target_path, verdict, sprt_verdict,
               pre_scores_json, post_scores_json, benchmark_json, notes, created_at, legacy_trace_id
        FROM hall_validation_runs
        WHERE validation_id = ?
        LIMIT 1
    `).get(validationId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        validation_id: String(row.validation_id),
        repo_id: String(row.repo_id),
        scan_id: row.scan_id ? String(row.scan_id) : undefined,
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        verdict: row.verdict as HallValidationRun['verdict'],
        sprt_verdict: row.sprt_verdict ? String(row.sprt_verdict) : undefined,
        pre_scores: parseJson<Record<string, unknown>>(row.pre_scores_json as string | null, {}),
        post_scores: parseJson<Record<string, unknown>>(row.post_scores_json as string | null, {}),
        benchmark: parseJson<Record<string, unknown>>(row.benchmark_json as string | null, {}),
        notes: row.notes ? String(row.notes) : undefined,
        created_at: Number(row.created_at ?? 0),
        legacy_trace_id: row.legacy_trace_id ? Number(row.legacy_trace_id) : undefined,
    };
}

export function getHallSummary(rootPath: string = registry.getRoot()): HallRepositorySummary | null {
    const database = getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const row = database.prepare('SELECT * FROM hall_repository_projection WHERE root_path = ?').get(normalizedRoot) as
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
    const database = getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const row = database.prepare(`
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
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = (scanId
        ? database.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND scan_id = ?
            ORDER BY path ASC
        `).all(repoId, scanId)
        : database.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, intent_summary, interaction_summary, created_at
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
        intent_summary: row.intent_summary ? String(row.intent_summary) : undefined,
        interaction_summary: row.interaction_summary ? String(row.interaction_summary) : undefined,
        created_at: Number(row.created_at ?? 0),
    }));
}

export function getLatestHallScanId(rootPath: string = registry.getRoot()): string | undefined {
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = database.prepare(`
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
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const normalizedPath = normalizeHallPath(filePath);
    const activeScanId = scanId ?? getLatestHallScanId(rootPath);
    const row = (activeScanId
        ? database.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, intent_summary, interaction_summary, created_at
            FROM hall_files
            WHERE repo_id = ? AND scan_id = ? AND path = ?
            LIMIT 1
        `).get(repoId, activeScanId, normalizedPath)
        : database.prepare(`
            SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                   matrix_json, intent_summary, interaction_summary, created_at
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
        intent_summary: row.intent_summary ? String(row.intent_summary) : undefined,
        interaction_summary: row.interaction_summary ? String(row.interaction_summary) : undefined,
        created_at: Number(row.created_at ?? 0),
    };
}

export function getHallBeads(
    rootPath: string = registry.getRoot(),
    statuses?: HallBeadStatus[],
): SovereignBead[] {
    const database = getDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, rationale, contract_refs_json,
               baseline_scores_json, acceptance_criteria, status, assigned_agent, source_kind, triage_reason,
               resolution_note, resolved_validation_id, superseded_by, created_at, updated_at
        FROM hall_beads
        WHERE repo_id = ?
    `;

    if (statuses && statuses.length > 0) {
        sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
    }

    const rows = database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    const statusRank: Record<HallBeadStatus, number> = {
        OPEN: 0,
        IN_PROGRESS: 1,
        READY_FOR_REVIEW: 2,
        NEEDS_TRIAGE: 3,
        BLOCKED: 4,
        RESOLVED: 5,
        ARCHIVED: 6,
        SUPERSEDED: 7,
    };

    return rows
        .map((row) =>
            materializeSovereignBead({
                bead_id: String(row.bead_id),
                repo_id: String(row.repo_id),
                scan_id: row.scan_id ? String(row.scan_id) : undefined,
                legacy_id: row.legacy_id ? Number(row.legacy_id) : undefined,
                target_kind: row.target_kind ? (String(row.target_kind) as HallBeadRecord['target_kind']) : undefined,
                target_ref: row.target_ref ? String(row.target_ref) : undefined,
                target_path: row.target_path ? String(row.target_path) : undefined,
                rationale: String(row.rationale),
                contract_refs: parseJson<string[]>(row.contract_refs_json as string | null, []),
                baseline_scores: parseJson<Record<string, unknown>>(row.baseline_scores_json as string | null, {}),
                acceptance_criteria: row.acceptance_criteria ? String(row.acceptance_criteria) : undefined,
                status: row.status as HallBeadStatus,
                assigned_agent: row.assigned_agent ? String(row.assigned_agent) : undefined,
                source_kind: row.source_kind ? String(row.source_kind) : undefined,
                triage_reason: row.triage_reason ? String(row.triage_reason) : undefined,
                resolution_note: row.resolution_note ? String(row.resolution_note) : undefined,
                resolved_validation_id: row.resolved_validation_id ? String(row.resolved_validation_id) : undefined,
                superseded_by: row.superseded_by ? String(row.superseded_by) : undefined,
                created_at: Number(row.created_at ?? 0),
                updated_at: Number(row.updated_at ?? 0),
            }),
        )
        .sort((left, right) => {
            const statusDelta = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
            if (statusDelta !== 0) {
                return statusDelta;
            }
            const scoreDelta = getSovereignBeadOverallScore(left) - getSovereignBeadOverallScore(right);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }
            return left.created_at - right.created_at;
        });
}

export function migrateLegacyHallRecords(rootPath: string = registry.getRoot()): {
    repository: HallRepositoryRecord;
    scans: number;
    beads: number;
    validation_runs: number;
} {
    const database = getDb();
    const normalizedRoot = normalizeHallPath(rootPath);
    const repository = upsertHallRepository({
        root_path: normalizedRoot,
        name: path.basename(normalizedRoot),
        status: getLegacyState(rootPath).framework?.status ?? 'DORMANT',
        active_persona: getLegacyState(rootPath).framework?.active_persona ?? 'ALFRED',
        baseline_gungnir_score: Number(getLegacyState(rootPath).framework?.gungnir_score ?? 0),
        intent_integrity: Number(getLegacyState(rootPath).framework?.intent_integrity ?? 0),
        metadata: {
            source: 'migration',
        },
        created_at: Number(getLegacyState(rootPath).framework?.last_awakening ?? 0),
        updated_at: Date.now(),
    });

    let scans = 0;
    let beads = 0;
    let validationRuns = 0;

    const beadColumns = getLegacyTableColumns('norn_beads');
    if (beadColumns.length > 0) {
        const rows = database.prepare('SELECT * FROM norn_beads').all() as Array<Record<string, unknown>>;
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

    const traceColumns = getLegacyTableColumns('mission_traces');
    if (traceColumns.length > 0) {
        const rows = database.prepare('SELECT * FROM mission_traces ORDER BY timestamp ASC').all() as Array<Record<string, unknown>>;
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

/**
 * Closes the active database connection.
 */
export function closeDb(): void {
    if (db) {
        db.close();
        db = undefined;
        currentDbPath = undefined;
    }
}


