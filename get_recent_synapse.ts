import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

const recent = db.prepare("SELECT id, prompt, response, status FROM synapse ORDER BY id DESC LIMIT 10").all();
console.log(JSON.stringify(recent, null, 2));

db.close();
