import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/tools/pennyone/intel/database.js';
import { AgentPing } from '../src/tools/pennyone/types.js';

/**
 * [ALFRED]: "Migrating the ancient JSON scrolls to the SQLite monolith, sir."
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

async function migrate() {
    const sessionsDir = path.join(PROJECT_ROOT, '.stats', 'sessions');
    const db = getDb(PROJECT_ROOT);

    if (!await fs.stat(sessionsDir).catch(() => null)) {
        console.log("No existing session JSONs found.");
        return;
    }

    const files = await fs.readdir(sessionsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(`Found ${jsonFiles.length} session files to migrate.`);

    for (const file of jsonFiles) {
        try {
            const content = await fs.readFile(path.join(sessionsDir, file), 'utf-8');
            const pings: AgentPing[] = JSON.parse(content);

            if (pings.length === 0) continue;

            // 1. Create a session for this file
            const agentId = pings[0].agent_id;
            const startTs = pings[0].timestamp;
            const endTs = pings[pings.length - 1].timestamp;

            const stmt = db.prepare('INSERT INTO sessions (agent_id, start_timestamp, end_timestamp, total_pings) VALUES (?, ?, ?, ?)');
            const result = stmt.run(agentId, startTs, endTs, pings.length);
            const sessionId = result.lastInsertRowid;

            // 2. Insert all pings
            const insertPing = db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)');
            
            const migratePings = db.transaction((pingList) => {
                for (const p of pingList) {
                    insertPing.run(sessionId, p.agent_id, p.action, p.target_path, p.timestamp);
                }
            });

            migratePings(pings);
            console.log(`Migrated session ${file} (${pings.length} pings).`);

        } catch (err) {
            console.error(`Failed to migrate ${file}:`, err);
        }
    }

    console.log("Migration complete.");
}

migrate().catch(console.error);
