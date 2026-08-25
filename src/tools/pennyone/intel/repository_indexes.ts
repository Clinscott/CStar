import { database } from './database.js';

export function acquireLease(targetPath: string, agentId: string, durationMs: number = 300000): boolean {
    const db = database.getWritableDb();
    const now = Date.now();
    const expiry = now + durationMs;
    const normalizedPath = targetPath.replace(/\\/g, '/');

    try {
        db.prepare('DELETE FROM task_leases WHERE lease_expiry < ?').run(now);
        db.prepare('INSERT INTO task_leases (target_path, agent_id, lease_expiry) VALUES (?, ?, ?)')
            .run(normalizedPath, agentId, expiry);
        return true;
    } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            const existing = db.prepare('SELECT agent_id FROM task_leases WHERE target_path = ?').get(normalizedPath) as { agent_id: string };
            if (existing && existing.agent_id === agentId) {
                db.prepare('UPDATE task_leases SET lease_expiry = ? WHERE target_path = ?').run(expiry, normalizedPath);
                return true;
            }
            return false;
        }
        throw err;
    }
}

export function releaseLease(targetPath: string, agentId: string): void {
    const db = database.getWritableDb();
    const normalizedPath = targetPath.replace(/\\/g, '/');
    db.prepare('DELETE FROM task_leases WHERE target_path = ? AND agent_id = ?').run(normalizedPath, agentId);
}

export function updateFtsIndex(filePath: string, intent: string, protocol: string) {
    const db = database.getWritableDb();
    const normalizedPath = filePath.replace(/\\/g, '/');

    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
            path UNINDEXED,
            intent,
            interaction_protocol
        )
    `);

    const isStructural = intent.includes('sector implements logic focusing on');
    if (isStructural) {
        const existing = db.prepare('SELECT intent FROM intents_fts WHERE path = ?').get(normalizedPath) as { intent: string } | undefined;
        if (existing && !existing.intent.includes('sector implements logic focusing on')) {
            return;
        }
    }

    db.prepare('DELETE FROM intents_fts WHERE path = ?').run(normalizedPath);
    db.prepare('INSERT INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)')
        .run(normalizedPath, intent, protocol);
}

export function updateChronicleIndex(sourceFile: string, header: string, content: string, timestamp: string = '') {
    const db = database.getWritableDb();
    db.prepare('DELETE FROM chronicles_fts WHERE source_file = ? AND header = ?').run(sourceFile, header);
    db.prepare('INSERT INTO chronicles_fts (source_file, header, content, timestamp) VALUES (?, ?, ?, ?)')
        .run(sourceFile, header, content, timestamp);
}

