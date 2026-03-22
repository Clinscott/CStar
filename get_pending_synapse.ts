import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

const pending = db.prepare("SELECT id, prompt FROM synapse WHERE status = 'PENDING'").all();
console.log(JSON.stringify(pending, null, 2));

db.close();
