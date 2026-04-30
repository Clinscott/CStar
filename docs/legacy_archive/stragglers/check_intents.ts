import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nINTENTS FTS:");
try {
    const intents = db.prepare("SELECT * FROM intents_fts").all();
    console.log(intents);
} catch (e) {
    console.log("intents_fts table error.");
}

db.close();
