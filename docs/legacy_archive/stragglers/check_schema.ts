import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nHALL_BEADS SCHEMA:");
const info = db.prepare("PRAGMA table_info(hall_beads)").all();
console.log(info);

db.close();
