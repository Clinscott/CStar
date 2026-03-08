import { AgentPing } from '../types.js';
/**
 * Record a ping to the chronological session ledger (SQLite).
 * @param {AgentPing} ping - The ping object
 * @param {string} targetRepo - The target repository path
 */
export declare function recordPing(ping: AgentPing, targetRepo: string): Promise<void>;
/**
 * Record a mission trace to the Hall of Records (SQLite).
 * @param {any} trace - The trace data
 */
export declare function recordTrace(trace: any): Promise<void>;
