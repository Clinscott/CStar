import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

console.log("TABLES:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);

console.log("\nPLANNING SESSIONS:");
try {
    const sessions = db.prepare("SELECT * FROM hall_planning_sessions").all();
    console.log(sessions);
} catch (e) {
    console.log("hall_planning_sessions table not found or error.");
}

console.log("\nSYNAPSE RECORDS:");
try {
    const synapse = db.prepare("SELECT id, prompt FROM synapse").all();
    console.log(synapse);
} catch (e) {
    console.log("synapse table not found or error.");
}

db.close();
