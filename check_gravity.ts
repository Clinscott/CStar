import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'gravity.db');
const db = new Database(dbPath);

console.log("\nGRAVITY TABLES:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);

if (tables.some(t => t.name === 'file_gravity')) {
    console.log("\nFILE_GRAVITY SCHEMA:");
    const info = db.prepare("PRAGMA table_info(file_gravity)").all();
    console.log(info);
}

db.close();
