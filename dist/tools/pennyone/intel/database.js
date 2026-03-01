/* eslint-disable @typescript-eslint/no-unused-vars */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { registry } from '../pathRegistry.js';
let db;
/**
 * @param {string} _targetRepo - The target repository path
 * @returns {Database.Database} The db instance
 */
export function getDb(_targetRepo) {
    if (db)
        return db;
    // [Ω] Centralized Database: Always in the Axis (CorvusStar root)
    const statsDir = path.join(registry.getRoot(), '.stats');
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
    `);
    return db;
}
/**
 * Persists a Mission Trace to the database.
 * @param {any} trace - The trace data
 */
export async function saveTrace(trace) {
    const database = getDb();
    const stmt = database.prepare(`
        INSERT INTO mission_traces (
            mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(trace.mission_id, trace.file_path, trace.target_metric, trace.initial_score, trace.final_score || 0, trace.justification, trace.status, trace.timestamp || Date.now());
}
/**
 * Registers a spoke in the database if it doesn't exist.
 * @param {string} targetRepo - The target repository path
 * @returns {number} The spoke ID
 */
export function registerSpoke(targetRepo) {
    const database = getDb(targetRepo);
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const spokeName = path.basename(normalizedRepo);
    const spoke = database.prepare('SELECT id FROM spokes WHERE root_path = ?').get(normalizedRepo);
    if (!spoke) {
        const stmt = database.prepare('INSERT INTO spokes (name, root_path) VALUES (?, ?)');
        const result = stmt.run(spokeName, normalizedRepo);
        return result.lastInsertRowid;
    }
    return spoke.id;
}
/**
 * Persists an AgentPing to the SQLite database.
 * @param {AgentPing} ping - The ping object
 * @param {string} targetRepo - The target repository path
 */
export async function savePing(ping, targetRepo) {
    // [Ω] Gungnir Security: Anti-Injection Sanitization
    const sanitizedAgentId = ping.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const validActions = ['SEARCH', 'READ', 'EDIT', 'EVALUATE', 'THINK'];
    const sanitizedAction = validActions.includes(ping.action) ? ping.action : 'THINK';
    const spokeId = registerSpoke(targetRepo);
    const database = getDb(targetRepo);
    // 1. Find or create the current active session for this agent in this spoke
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let session = database.prepare('SELECT id FROM sessions WHERE agent_id = ? AND spoke_id = ? AND start_timestamp > ? ORDER BY id DESC LIMIT 1')
        .get(sanitizedAgentId, spokeId, oneHourAgo);
    if (!session) {
        const stmt = database.prepare('INSERT INTO sessions (agent_id, spoke_id, start_timestamp) VALUES (?, ?, ?)');
        const result = stmt.run(sanitizedAgentId, spokeId, ping.timestamp);
        session = { id: result.lastInsertRowid };
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
 * @returns {any[]} The session summaries
 */
export function getSessionsWithSummaries(targetRepo) {
    const database = getDb(targetRepo);
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const sessions = database.prepare(`
        SELECT s.*, sp.name as spoke_name,
        (SELECT target_path FROM pings WHERE session_id = s.id GROUP BY target_path ORDER BY COUNT(*) DESC LIMIT 1) as primary_target
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        WHERE sp.root_path = ?
        ORDER BY s.start_timestamp DESC
    `).all(normalizedRepo);
    return sessions.map(s => {
        const duration = s.end_timestamp ? Math.round((s.end_timestamp - s.start_timestamp) / 1000) : 0;
        const targetFile = s.primary_target ? path.basename(s.primary_target) : 'unknown';
        return {
            ...s,
            summary: `Agent ${s.agent_id} performed ${s.total_pings} actions over ${duration}s. Primary focus: ${targetFile}.`
        };
    });
}
/**
 * Retrieves mission traces for a specific file in chronological order.
 * @param {string} filePath - The file path to query
 * @returns {any[]} The traces
 */
export function getTracesForFile(filePath) {
    const database = getDb();
    // Use like matching to handle absolute/relative path variations
    const normalizedPath = filePath.replace(/\\/g, '/');
    return database.prepare(`
        SELECT * FROM mission_traces 
        WHERE file_path LIKE ? 
        ORDER BY timestamp ASC
    `).all(`%${normalizedPath}%`);
}
/**
 * Retrieves all pings for a specific session in chronological order.
 * @param {number} sessionId - The session ID
 * @param {string} targetRepo - The target repository path
 * @returns {AgentPing[]} The pings
 */
export function getSessionPings(sessionId, targetRepo) {
    const database = getDb(targetRepo);
    return database.prepare('SELECT agent_id, action, target_path, timestamp FROM pings WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId);
}
