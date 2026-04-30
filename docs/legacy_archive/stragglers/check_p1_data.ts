import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nPLANNING SESSIONS:");
const sessions = db.prepare("SELECT * FROM hall_planning_sessions").all();
console.log(sessions);

console.log("\nBEADS:");
const beads = db.prepare("SELECT * FROM hall_beads").all();
console.log(beads);

db.close();
