import Database from 'better-sqlite3';

const db = new Database('.stats/pennyone.db');

console.log('--- FORCING SCHEMA MIGRATION ---');

db.exec(`
    CREATE TABLE IF NOT EXISTS mission_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT,
        file_path TEXT,
        target_metric TEXT,
        initial_score REAL,
        final_score REAL,
        justification TEXT,
        status TEXT,
        timestamp INTEGER
    );
`);

const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mission_traces'").get();
console.log('Result:', table);
