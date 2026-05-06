import fs from 'node:fs';
import path from 'node:path';
import { database } from '../src/tools/pennyone/intel/database.ts';
import { registry } from '../src/tools/pennyone/pathRegistry.ts';
import crypto from 'node:crypto';

registry.setRoot(process.cwd());
const memoryDir = path.join(process.cwd(), '.agents', 'memory');

if (!fs.existsSync(memoryDir)) {
    console.log(`No memory directory found at ${memoryDir}`);
    process.exit(0);
}

const files = fs.readdirSync(memoryDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));

let engravedCount = 0;

for (const file of files) {
    const filePath = path.join(memoryDir, file);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.trim()) continue;

        const sessionEvents = JSON.parse(content);
        if (!Array.isArray(sessionEvents) || sessionEvents.length === 0) continue;

        const sessionId = file.replace('.json', '');
        const memoryId = `engram_${sessionId}_${crypto.randomBytes(4).toString('hex')}`;
        const repoId = `repo:${process.cwd()}`;
        
        let tacticalSummary = `Session History for ${sessionId}`;
        let filesTouched: string[] = [];
        let beadId = `bead_engram_migrated_${sessionId}`;

        for (const event of sessionEvents) {
            if (event.task && !tacticalSummary.includes(event.task)) {
                tacticalSummary += `\n- Task: ${event.task}`;
            }
            if (event.target && !filesTouched.includes(event.target)) {
                filesTouched.push(event.target);
            }
            if (event.bead_id) {
                beadId = event.bead_id;
            }
        }

        const beadStmt = database.getDb().prepare(`
            INSERT OR IGNORE INTO hall_beads (
                bead_id, repo_id, target_kind, rationale, status, created_at, updated_at
            ) VALUES (?, ?, 'MIGRATION', 'Migrated legacy session memory', 'CLOSED', ?, ?)
        `);
        beadStmt.run(beadId, repoId, Date.now(), Date.now());

        const stmt = database.getDb().prepare(`
            INSERT OR REPLACE INTO hall_episodic_memory (
                memory_id, bead_id, repo_id, tactical_summary, files_touched_json, 
                successes_json, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            memoryId,
            beadId,
            repoId,
            tacticalSummary.trim(),
            JSON.stringify(filesTouched),
            JSON.stringify([]),
            JSON.stringify({ source: file, original_events: sessionEvents.length }),
            Date.now(),
            Date.now()
        );
        engravedCount++;
        console.log(`Engraved ${file} -> ${memoryId}`);
    } catch (err) {
        console.error(`Failed to engrave ${file}:`, err);
    }
}

console.log(`Successfully engraved ${engravedCount} sessions into hall_episodic_memory.`);
