import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nORCHESTRATE PLANNING SESSIONS:");
const sessions = db.prepare("SELECT session_id, user_intent, status FROM hall_planning_sessions WHERE user_intent LIKE '%orchestrate%' OR user_intent LIKE '%orchestrator%'").all();
console.log(sessions);

db.close();
