import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nINTENT QUALITY CHECK:");
const samples = db.prepare("SELECT path, intent_summary FROM hall_files WHERE path NOT LIKE '%.qmd' AND path NOT LIKE '%.md' LIMIT 5 OFFSET 100").all();
console.log(JSON.stringify(samples, null, 2));

db.close();
