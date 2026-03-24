import Database from 'better-sqlite3';
import { join } from 'node:path';
import fs from 'node:fs';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const planPath = join(process.cwd(), 'chant_upgrade_plan.json');

const db = new Database(dbPath);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

const repoId = 'repo:/home/morderith/Corvus/CStar';
const now = Math.floor(Date.now() / 1000);

const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO hall_beads (
        bead_id, repo_id, target_kind, target_path, rationale, 
        contract_refs_json, acceptance_criteria, status, 
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

console.log(`Seeding ${plan.beads.length} beads from ${planPath}...`);

for (const bead of plan.beads) {
    insertStmt.run(
        bead.id,
        repoId,
        'FILE',
        bead.targets ? bead.targets[0] : null,
        bead.description || bead.title,
        JSON.stringify(bead.targets || []),
        bead.acceptance_criteria ? bead.acceptance_criteria.join('\n') : null,
        bead.status || 'OPEN',
        now,
        now
    );
    console.log(`- Seeded: ${bead.id} (${bead.status})`);
}

db.close();
console.log("Seeding complete.");
