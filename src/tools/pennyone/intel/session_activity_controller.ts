import path from 'node:path';
import type { AgentPing } from '../types.js';
import { database } from './database.js';

export function registerSpoke(targetRepo: string): number {
    const db = database.getWritableDb();
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const spokeName = path.basename(normalizedRepo);

    db.exec(`
        CREATE TABLE IF NOT EXISTS spokes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE
        )
    `);

    const spoke = db.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?')
        .get(normalizedRepo, spokeName) as { id: number } | undefined;
    if (spoke) return spoke.id;

    const result = db.prepare('INSERT OR IGNORE INTO spokes (name, root_path) VALUES (?, ?)')
        .run(spokeName, normalizedRepo);
    if (result.changes !== 0) return result.lastInsertRowid as number;

    const existing = db.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?')
        .get(normalizedRepo, spokeName) as { id: number };
    return existing.id;
}

export async function savePing(ping: AgentPing, targetRepo: string): Promise<void> {
    const sanitizedAgentId = ping.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const validActions = ['SEARCH', 'READ', 'EDIT', 'EVALUATE', 'THINK'];
    const sanitizedAction = validActions.includes(ping.action) ? ping.action : 'THINK';
    const spokeId = registerSpoke(targetRepo);
    const db = database.getWritableDb();
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    let session = db.prepare('SELECT id FROM sessions WHERE agent_id = ? AND spoke_id = ? AND start_timestamp > ? ORDER BY id DESC LIMIT 1')
        .get(sanitizedAgentId, spokeId, oneHourAgo) as { id: number } | undefined;
    if (!session) {
        const result = db.prepare('INSERT INTO sessions (agent_id, spoke_id, start_timestamp) VALUES (?, ?, ?)')
            .run(sanitizedAgentId, spokeId, ping.timestamp);
        session = { id: result.lastInsertRowid as number };
    }

    db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)')
        .run(session.id, sanitizedAgentId, sanitizedAction, ping.target_path, ping.timestamp);
    db.prepare('UPDATE sessions SET total_pings = total_pings + 1, end_timestamp = ? WHERE id = ?')
        .run(ping.timestamp, session.id);
}

export function getSessionsWithSummaries(targetRepo: string): Record<string, unknown>[] {
    const db = database.getReadDb();
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const sessions = db.prepare(`
        SELECT s.*, sp.name as spoke_name,
        (SELECT target_path FROM pings WHERE session_id = s.id GROUP BY target_path ORDER BY COUNT(*) DESC LIMIT 1) as primary_target
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        WHERE sp.root_path = ?
        ORDER BY s.start_timestamp DESC
    `).all(normalizedRepo) as Record<string, unknown>[];

    return sessions.map((session) => {
        const start = session.start_timestamp as number;
        const end = session.end_timestamp as number | null;
        const duration = end ? Math.round((end - start) / 1000) : 0;
        const primaryTarget = session.primary_target as string | undefined;
        const targetFile = primaryTarget ? path.basename(primaryTarget) : 'unknown';
        return {
            ...session,
            summary: `Agent ${session.agent_id} performed ${session.total_pings} actions over ${duration}s. Primary focus: ${targetFile}.`,
        };
    });
}

export function getSessionPings(sessionId: number, _targetRepo: string): AgentPing[] {
    return database.getReadDb()
        .prepare('SELECT agent_id, action, target_path, timestamp FROM pings WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId) as AgentPing[];
}

export function getRecentSessions(limit = 20): any[] {
    return database.getReadDb().prepare(`
        SELECT s.*, sp.name as spoke_name, sp.root_path as spoke_path
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        ORDER BY s.start_timestamp DESC
        LIMIT ?
    `).all(limit);
}

export function getPingsForSession(sessionId: number): any[] {
    return database.getReadDb().prepare(`
        SELECT * FROM pings
        WHERE session_id = ?
        ORDER BY timestamp ASC
    `).all(sessionId);
}
