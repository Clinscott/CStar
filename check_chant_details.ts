import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nSKILL OBSERVATIONS FOR ORCHESTRATOR CHANT:");
const observations = db.prepare("SELECT * FROM hall_skill_observations WHERE observation LIKE '%orchestrator%'").all();
console.log(observations);

console.log("\nEPISODIC MEMORY:");
const memories = db.prepare("SELECT * FROM hall_episodic_memory").all();
console.log(memories);

db.close();
