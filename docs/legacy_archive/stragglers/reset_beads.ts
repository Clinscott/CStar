import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

db.prepare("UPDATE hall_beads SET status = 'SET'").run();
console.log("All beads reset to SET.");

db.close();
