import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

console.log("\nBLUEPRINT SYNAPSE RECORDS:");
const records = db.prepare("SELECT id, prompt FROM synapse WHERE prompt LIKE '%ORCHESTRATOR_BLUEPRINT%'").all();
console.log(records);

db.close();
