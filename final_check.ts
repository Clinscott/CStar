import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

console.log("\nFINAL STATUS CHECK:");
const summary = db.prepare("SELECT status, COUNT(*) as count FROM synapse GROUP BY status").all();
console.log(summary);

const pending = db.prepare("SELECT id, prompt FROM synapse WHERE status = 'PENDING'").all();
console.log(`\nPENDING RECORDS: ${pending.length}`);
if (pending.length > 0) {
    console.log("Next pending ID:", pending[0].id);
}

db.close();
