import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const RECOVERABLE_SQLITE_PATTERNS = [
    /database disk image is malformed/i,
    /file is not a database/i,
    /malformed/i,
    /quick_check failed/i,
    /integrity_check failed/i,
    /btreeinitpage/i,
    /invalid page number/i,
    /freelist/i,
];

function isRecoverableSqliteError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return RECOVERABLE_SQLITE_PATTERNS.some((pattern) => pattern.test(message));
}

function initializeSynapseSchema(dbPath: string): void {
    const db = new Database(dbPath);
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS synapse (
                id INTEGER PRIMARY KEY,
                prompt TEXT,
                response TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } finally {
        db.close();
    }
}

function validateSynapseDb(dbPath: string): void {
    const db = new Database(dbPath, { readonly: true });
    try {
        const quickCheck = db.pragma('quick_check', { simple: true });
        if (typeof quickCheck === 'string' && quickCheck.toLowerCase() !== 'ok') {
            throw new Error(`Synapse quick_check failed: ${quickCheck}`);
        }
        db.prepare('SELECT COUNT(*) AS count FROM synapse').get();
    } finally {
        db.close();
    }
}

export interface SynapseRecoveryResult {
    recovered: boolean;
    backupPath?: string;
}

export function ensureHealthySynapseDb(dbPath: string): SynapseRecoveryResult {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    try {
        initializeSynapseSchema(dbPath);
        validateSynapseDb(dbPath);
        return { recovered: false };
    } catch (error) {
        if (!isRecoverableSqliteError(error)) {
            throw error;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${dbPath}.corrupt-${stamp}.bak`;
        if (fs.existsSync(dbPath)) {
            fs.renameSync(dbPath, backupPath);
        }

        initializeSynapseSchema(dbPath);
        validateSynapseDb(dbPath);
        return { recovered: true, backupPath };
    }
}
