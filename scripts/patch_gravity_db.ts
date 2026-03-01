import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const statsDir = path.join(process.cwd(), '.stats');
const dbPath = path.join(statsDir, 'gravity.db');

if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    try {
        db.exec('ALTER TABLE file_gravity ADD COLUMN git_churn INTEGER DEFAULT 0');
        db.exec('ALTER TABLE file_gravity ADD COLUMN last_sync INTEGER DEFAULT 0');
        console.log('[ALFRED]: "Gravity DB schema successfully patched with temporal columns."');
    } catch (e: any) {
        if (e.message.includes('duplicate column name')) {
            console.log('[ALFRED]: "Temporal columns already exist in the Gravity DB."');
        } else {
            console.error('[ALFRED]: "Failed to patch Gravity DB:", e.message');
        }
    } finally {
        db.close();
    }
} else {
    console.log('[ALFRED]: "Gravity DB not found. Initializing fresh with temporal support."');
}
