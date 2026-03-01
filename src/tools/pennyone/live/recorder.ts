import { AgentPing } from '../types.js';
import { savePing, saveTrace } from '../intel/database.js';

/**
 * Record a ping to the chronological session ledger (SQLite).
 * @param {AgentPing} ping - The ping object
 * @param {string} targetRepo - The target repository path
 */
export async function recordPing(ping: AgentPing, targetRepo: string) {
    try {
        // 1. Save to SQLite (pennyone.db)
        await savePing(ping, targetRepo);
    } catch (err: any) {
        console.error('[ALFRED]: "Failed to record telemetry to the Hall of Records, sir."', err);
    }
}

/**
 * Record a mission trace to the Hall of Records (SQLite).
 * @param {any} trace - The trace data
 */
export async function recordTrace(trace: any) {
    try {
        await saveTrace(trace);
    } catch (err: any) {
        console.error('[ALFRED]: "Failed to record mission trace, sir."', err);
    }
}
