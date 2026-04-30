import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

const schema = db.prepare("PRAGMA table_info(synapse)").all();
const statuses = db.prepare("SELECT DISTINCT status FROM synapse").all();
const counts = db.prepare("SELECT status, COUNT(*) as count FROM synapse GROUP BY status").all();

console.log(`Schema: ${JSON.stringify(schema, null, 2)}`);
console.log(`Statuses: ${JSON.stringify(statuses, null, 2)}`);
console.log(`Counts: ${JSON.stringify(counts, null, 2)}`);

db.close();
