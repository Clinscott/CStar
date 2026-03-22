import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

const all = db.prepare("SELECT id, status FROM synapse").all();
console.log(JSON.stringify(all, null, 2));

db.close();
