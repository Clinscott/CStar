import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { AgentPing } from '../types.js';
import { registry } from '../pathRegistry.js';

let db: Database.Database | undefined;
let currentDbPath: string | undefined;

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

    return db;
}

export interface MissionTrace {
    mission_id: string;
    file_path: string;
    target_metric: string;
    initial_score: number;
    final_score?: number;
    justification: string;
    status: string;
    timestamp?: number;
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
    const database = getDb();
    const stmt = database.prepare(`
        INSERT INTO mission_traces (
            mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        trace.mission_id,
        trace.file_path,
        trace.target_metric,
        trace.initial_score,
        trace.final_score || 0,
        trace.justification,
        trace.status,
        trace.timestamp || Date.now()
    );
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
    // Use like matching to handle absolute/relative path variations
    const normalizedPath = filePath.replace(/\\/g, '/');
    return database.prepare(`
        SELECT * FROM mission_traces 
        WHERE file_path LIKE ? 
        ORDER BY timestamp ASC
    `).all(`%${normalizedPath}%`) as MissionTrace[];
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


