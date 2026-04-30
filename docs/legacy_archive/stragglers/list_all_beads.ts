import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const root = '/home/morderith/Corvus';
const dbPaths = [
    path.join(root, 'CStar/.stats/pennyone.db'),
    path.join(root, 'CStar/.agents/skills/.stats/pennyone.db'),
    path.join(root, 'CStar/src/core/.stats/pennyone.db'),
    path.join(root, 'CStar/src/tools/pennyone/.stats/pennyone.db')
];

for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
        console.log(`\n--- DB: ${dbPath} ---`);
        try {
            const db = new Database(dbPath);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
            if (tables.includes('hall_beads')) {
                const beads = db.prepare("SELECT bead_id, status FROM hall_beads").all();
                console.log(`Beads Found (${beads.length}):`);
                beads.forEach(b => console.log(`  - ${b.bead_id}: ${b.status}`));
            } else {
                console.log("No hall_beads table.");
            }
            db.close();
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    } else {
        // console.log(`\nNot found: ${dbPath}`);
    }
}
