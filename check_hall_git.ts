import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.stats', 'pennyone.db');
const db = new Database(dbPath);

console.log("\nHALL_FILES SCHEMA:");
const info = db.prepare("PRAGMA table_info(hall_files)").all();
console.log(info);

console.log("\nTABLES LIST:");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);

db.close();
