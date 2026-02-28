import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { AgentPing } from '../types.js';

/**
 * [O.D.I.N.]: "The Hall of Records is now forged in stone (SQLite)."
 */

let db: Database.Database | null = null;

export function getDb(targetRepo: string): Database.Database {
    if (db) return db;

    // [Ω] Centralized Database: Always in the Axis (CorvusStar root)
    const statsDir = path.join(process.cwd(), '.stats');
    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }

    const dbPath = path.join(statsDir, 'pennyone.db');
    db = new Database(dbPath);

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
    `);

    return db;
}

/**
 * Registers a spoke in the database if it doesn't exist.
 */
export function registerSpoke(targetRepo: string): number {
    const database = getDb(targetRepo);
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const spokeName = path.basename(normalizedRepo);
    
    let spoke = database.prepare('SELECT id FROM spokes WHERE root_path = ?').get(normalizedRepo) as { id: number } | undefined;
    
    if (!spoke) {
        const stmt = database.prepare('INSERT INTO spokes (name, root_path) VALUES (?, ?)');
        const result = stmt.run(spokeName, normalizedRepo);
        return result.lastInsertRowid as number;
    }
    return spoke.id;
}

/**
 * Persists an AgentPing to the SQLite database.
 */
export async function savePing(ping: AgentPing, targetRepo: string) {
    // [Ω] Gungnir Security: Anti-Injection Sanitization
    const sanitizedAgentId = ping.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const validActions = ['SEARCH', 'READ', 'EDIT', 'EVALUATE', 'THINK'];
    const sanitizedAction = validActions.includes(ping.action) ? ping.action : 'THINK';

    const spokeId = registerSpoke(targetRepo);
    const database = getDb(targetRepo);

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
 */
export function getSessionsWithSummaries(targetRepo: string) {
    const database = getDb(targetRepo);
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    
    const sessions = database.prepare(`
        SELECT s.*, sp.name as spoke_name,
        (SELECT target_path FROM pings WHERE session_id = s.id GROUP BY target_path ORDER BY COUNT(*) DESC LIMIT 1) as primary_target
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        WHERE sp.root_path = ?
        ORDER BY s.start_timestamp DESC
    `).all(normalizedRepo) as any[];

    return sessions.map(s => {
        const duration = s.end_timestamp ? Math.round((s.end_timestamp - s.start_timestamp) / 1000) : 0;
        const targetFile = s.primary_target ? path.basename(s.primary_target) : "unknown";
        
        return {
            ...s,
            summary: `Agent ${s.agent_id} performed ${s.total_pings} actions over ${duration}s. Primary focus: ${targetFile}.`
        };
    });
}

/**
 * Retrieves all pings for a specific session in chronological order.
 */
export function getSessionPings(sessionId: number, targetRepo: string): AgentPing[] {
    const database = getDb(targetRepo);
    return database.prepare('SELECT agent_id, action, target_path, timestamp FROM pings WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId) as AgentPing[];
}
