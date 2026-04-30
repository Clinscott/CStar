import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nORCH BEADS:");
const beads = db.prepare("SELECT id, title, rationale, status FROM hall_beads WHERE id LIKE '%orch%'").all();
console.log(beads);

db.close();
