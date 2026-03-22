import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("Purging structural fallbacks from intents_fts...");
db.prepare("DELETE FROM intents_fts WHERE intent LIKE 'The % sector implements logic focusing on %'").run();
console.log("Purge complete.");

db.close();
