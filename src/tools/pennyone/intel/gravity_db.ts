 
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { registry } from  '../pathRegistry.js';
import { GitChronograph } from  './git_monitor.js';

let db: Database.Database | null = null;
let currentDbPath: string | undefined;

/**
 * Get Gravity DB instance
 * @returns {Database.Database} The db instance
 */
export function getGravityDb(): Database.Database {
    const statsDir = path.join(registry.getRoot(), '.stats');
    const dbPath = path.join(statsDir, 'gravity.db');

    if (db && currentDbPath !== dbPath) {
        db.close();
        db = null;
    }

    if (db) return db;

    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }

    db = new Database(dbPath);
    currentDbPath = dbPath;

    db.exec(`
        CREATE TABLE IF NOT EXISTS file_gravity (
            path TEXT PRIMARY KEY,
            weight INTEGER DEFAULT 0,
            commits_30d INTEGER DEFAULT 0,
            lines_7d INTEGER DEFAULT 0,
            pings_48h INTEGER DEFAULT 0,
            last_sync INTEGER DEFAULT 0
        );
    `);

    return db;
}

/**
 * [ALFRED]: "Fused gravity is the true measure of a module's influence."
 * @param {string} filepath - Path to file
 * @returns {Promise<number>} Fused gravity score
 */
export async function getFileGravity(filepath: string): Promise<number> {
    const database = getGravityDb();
    const normalized = registry.normalize(filepath);
    
    // Weights from the PennyOne v2.0 Blueprint
    const W1 = 1.0; // Agent Pings (48h)
    const W2 = 2.0; // Git Commits (30d)
    const W3 = 0.1; // Lines Modified (7d)

    // 1. Fetch current cached metrics
    const row = database.prepare('SELECT weight, commits_30d, lines_7d, pings_48h, last_sync FROM file_gravity WHERE path = ?').get(normalized) as { weight: number, commits_30d: number, lines_7d: number, pings_48h: number, last_sync: number } | undefined;

    const now = Date.now();
    let commits30d = row ? row.commits_30d : 0;
    let lines7d = row ? row.lines_7d : 0;
    let pings48h = row ? row.pings_48h : 0;

    // 2. Refresh Git Metrics if stale (> 1 hour)
    if (!row || (now - row.last_sync > (60 * 60 * 1000))) {
        const churn = await GitChronograph.getFileChurn(filepath);
        commits30d = churn.commits30d;
        lines7d = churn.lines7d;

        // Refresh Ping Metrics (last 48h)
        try {
            const pennyDbPath = path.join(registry.getRoot(), '.stats', 'pennyone.db');
            if (fs.existsSync(pennyDbPath)) {
                const pennyDb = new Database(pennyDbPath, { readonly: true });
                const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
                const pingRow = pennyDb.prepare('SELECT COUNT(*) as hitCount FROM pings WHERE target_path = ? AND timestamp > ?').get(filepath, fortyEightHoursAgo) as { hitCount: number } | undefined;
                if (pingRow) pings48h = pingRow.hitCount;
                pennyDb.close();
            }
        } catch { /* ignore */ }

        database.prepare(`
            INSERT INTO file_gravity (path, weight, commits_30d, lines_7d, pings_48h, last_sync) 
            VALUES (?, 0, ?, ?, ?, ?) 
            ON CONFLICT(path) DO UPDATE SET 
                commits_30d = ?, 
                lines_7d = ?, 
                pings_48h = ?, 
                last_sync = ?
        `).run(normalized, commits30d, lines7d, pings48h, now, commits30d, lines7d, pings48h, now);
    }

    // Final Gravity Formula (G)
    const manualWeight = row ? row.weight : 0;
    const G = (pings48h * W1) + (commits30d * W2) + (lines7d * W3);
    
    return Math.round(manualWeight + G);
}

/**
 *
 */
/**
 * Set gravity
 * @param {string} filepath - The file
 * @param {number} weight - The weight
 * @returns {void}
 */
export function updateFileGravity(filepath: string, weight: number): void {
    const database = getGravityDb();
    const normalized = registry.normalize(filepath);
    database.prepare(`
        INSERT INTO file_gravity (path, weight) 
        VALUES (?, ?) 
        ON CONFLICT(path) DO UPDATE SET weight = file_gravity.weight + ?
    `).run(normalized, weight, weight);
}

/**
 *
 */
/**
 * Set gravity
 * @param {string} filepath - The file
 * @param {number} weight - The weight
 * @returns {void}
 */
export function setFileGravity(filepath: string, weight: number): void {
    const database = getGravityDb();
    const normalized = registry.normalize(filepath);
    database.prepare(`
        INSERT INTO file_gravity (path, weight) 
        VALUES (?, ?) 
        ON CONFLICT(path) DO UPDATE SET weight = ?
    `).run(normalized, weight, weight);
}

/**
 * Closes the active gravity database connection.
 */
export function closeGravityDb(): void {
    if (db) {
        db.close();
        db = null;
        currentDbPath = undefined;
    }
}


