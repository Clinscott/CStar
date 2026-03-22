import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'skills', '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nSET BEADS FROM AGENTS PENNYONE:");
const beads = db.prepare("SELECT bead_id, status FROM hall_beads WHERE status = 'SET'").all();
console.log(beads);

db.close();
