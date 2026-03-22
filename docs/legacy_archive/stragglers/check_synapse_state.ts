import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

const maxId = db.prepare("SELECT MAX(id) as maxId FROM synapse").get() as { maxId: number };
const nonCompleted = db.prepare("SELECT id, status FROM synapse WHERE status != 'COMPLETED'").all();

console.log(`Max ID: ${maxId.maxId}`);
console.log(`Non-completed records: ${JSON.stringify(nonCompleted, null, 2)}`);

db.close();
