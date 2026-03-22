import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), '.agents', 'synapse.db');
const db = new Database(dbPath);

db.prepare("DELETE FROM synapse WHERE response IS NULL OR response = '' OR response LIKE '[SAMPLING_REQUEST]%'").run();
console.log("Cleaned up invalid synapse records.");

db.close();
