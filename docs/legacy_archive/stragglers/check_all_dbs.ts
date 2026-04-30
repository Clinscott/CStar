import Database from 'better-sqlite3';
import { join } from 'node:path';
import fs from 'node:fs';

const roots = [
    '/home/morderith/Corvus/CStar/.stats/pennyone.db',
    '/home/morderith/Corvus/CStar/.agents/skills/.stats/pennyone.db'
];

for (const dbPath of roots) {
    if (fs.existsSync(dbPath)) {
        console.log(`\nChecking DB: ${dbPath}`);
        try {
            const db = new Database(dbPath);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log("Tables:", tables.map(t => t.name).join(", "));
            
            if (tables.some(t => t.name === 'hall_beads')) {
                const beads = db.prepare("SELECT bead_id, status FROM hall_beads").all();
                console.log("Beads:", beads);
            } else {
                console.log("No hall_beads table found.");
            }
            db.close();
        } catch (e) {
            console.error(`Error reading ${dbPath}: ${e.message}`);
        }
    } else {
        console.log(`\nDB not found: ${dbPath}`);
    }
}
