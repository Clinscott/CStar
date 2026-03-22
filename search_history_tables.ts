import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nSEARCHING FOR HISTORY TABLES:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%history%' OR name LIKE '%git%' OR name LIKE '%commit%'").all();
console.log(tables);

db.close();
