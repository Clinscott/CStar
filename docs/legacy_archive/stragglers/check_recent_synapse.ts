import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

console.log("\nRECENT SYNAPSE RECORDS:");
const records = db.prepare("SELECT id, prompt FROM synapse ORDER BY id DESC LIMIT 5").all();
console.log(records);

db.close();
