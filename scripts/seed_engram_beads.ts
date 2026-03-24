import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

const repoId = 'repo:/home/morderith/Corvus/CStar';
const now = Math.floor(Date.now() / 1000);

const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO hall_beads (
        bead_id, repo_id, target_kind, target_path, rationale, 
        contract_refs_json, acceptance_criteria, status, 
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const beads = [
    {
        id: 'bead_engram_schema',
        target_path: 'src/tools/pennyone/intel/schema.ts',
        rationale: 'Create hall_episodic_fts virtual table in PennyOne schema to allow full-text search over the tactical_summary and metadata of hall_episodic_memory.',
        acceptance_criteria: 'hall_episodic_fts table exists and triggers are set up to keep it synchronized with hall_episodic_memory.'
    },
    {
        id: 'bead_engrave_weave',
        target_path: 'src/node/core/runtime/weaves/engrave.ts',
        rationale: 'Develop the `engrave` process to convert ephemeral .agents/memory/session_*.json files into structured Engram nodes inside the hall_episodic_memory table.',
        acceptance_criteria: 'A script or weave can successfully read a session JSON and INSERT it into hall_episodic_memory, populating the FTS index.'
    },
    {
        id: 'bead_mimir_engram_upgrade',
        target_path: 'src/tools/pennyone/intel/repository_manager.ts',
        rationale: 'Update repository manager and mimir query logic to optionally search the hall_episodic_fts index, enabling episodic recall of past session intents.',
        acceptance_criteria: 'Mimir or the repository manager has a function to search episodic history using MATCH against hall_episodic_fts.'
    }
];

console.log(`Seeding ${beads.length} Engram beads...`);

for (const bead of beads) {
    insertStmt.run(
        bead.id,
        repoId,
        'FILE',
        bead.target_path,
        bead.rationale,
        '[]',
        bead.acceptance_criteria,
        'OPEN',
        now,
        now
    );
    console.log(`Seeded: ${bead.id}`);
}
console.log('Done.');
