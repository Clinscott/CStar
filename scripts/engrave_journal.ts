import fs from 'node:fs';
import path from 'node:path';
import { database } from '../src/tools/pennyone/intel/database.ts';
import { registry } from '../src/tools/pennyone/pathRegistry.ts';
import crypto from 'node:crypto';

registry.setRoot(process.cwd());

const journalPath = path.join(process.cwd(), 'docs', 'dev_journal.qmd');
if (!fs.existsSync(journalPath)) {
    console.log(`No dev journal found at ${journalPath}`);
    process.exit(0);
}

const content = fs.readFileSync(journalPath, 'utf-8');
const sessions = content.split(/## \d{4}-\d{2}-\d{2} - Session /);

// The first split part is the header/instructions, skip it.
const sessionEntries = sessions.slice(1);

let engravedCount = 0;
const repoId = `repo:${process.cwd()}`;

console.log(`Found ${sessionEntries.length} potential sessions in journal.`);

for (const entry of sessionEntries) {
    try {
        // Extract Session ID and content
        const lines = entry.split('\n');
        const headerLine = lines[0].trim(); // e.g., "103: Operation PennyOne..."
        const sessionIdMatch = headerLine.match(/^(\d+):/);
        const sessionId = sessionIdMatch ? `session_${sessionIdMatch[1]}` : `session_journal_${engravedCount}`;
        
        const tacticalSummary = entry.trim();
        const memoryId = `engram_journal_${sessionId}_${crypto.randomBytes(4).toString('hex')}`;
        const beadId = `bead_journal_migrated_${sessionId}`;

        // Ensure placeholder bead
        const beadStmt = database.getDb().prepare(`
            INSERT OR IGNORE INTO hall_beads (
                bead_id, repo_id, target_kind, rationale, status, created_at, updated_at
            ) VALUES (?, ?, 'JOURNAL', 'Migrated legacy journal entry', 'CLOSED', ?, ?)
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
            tacticalSummary,
            JSON.stringify([]), // We could parse files from the entry, but for now empty is safer
            JSON.stringify([]),
            JSON.stringify({ source: 'dev_journal.qmd', original_header: headerLine }),
            Date.now(),
            Date.now()
        );
        
        engravedCount++;
        console.log(`Engraved Journal ${sessionId} -> ${memoryId}`);
    } catch (err) {
        console.error(`Failed to engrave journal entry:`, err);
    }
}

console.log(`Successfully engraved ${engravedCount} journal entries into episodic memory.`);
