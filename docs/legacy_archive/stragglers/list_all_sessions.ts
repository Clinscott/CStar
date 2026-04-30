import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nALL PLANNING SESSIONS:");
const sessions = db.prepare("SELECT session_id, user_intent, status, created_at FROM hall_planning_sessions ORDER BY created_at DESC").all();
console.log(sessions);

db.close();
