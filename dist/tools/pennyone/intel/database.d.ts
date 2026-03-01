import Database from 'better-sqlite3';
import { AgentPing } from '../types.js';
/**
 * @param {string} _targetRepo - The target repository path
 * @returns {Database.Database} The db instance
 */
export declare function getDb(_targetRepo?: string): Database.Database;
/**
 * Persists a Mission Trace to the database.
 * @param {any} trace - The trace data
 */
export declare function saveTrace(trace: any): Promise<void>;
/**
 * Registers a spoke in the database if it doesn't exist.
 * @param {string} targetRepo - The target repository path
 * @returns {number} The spoke ID
 */
export declare function registerSpoke(targetRepo: string): number;
/**
 * Persists an AgentPing to the SQLite database.
 * @param {AgentPing} ping - The ping object
 * @param {string} targetRepo - The target repository path
 */
export declare function savePing(ping: AgentPing, targetRepo: string): Promise<void>;
/**
 * [O.D.I.N.]: "Retrieving the scrolls of past campaigns."
 * @param {string} targetRepo - The target repository path
 * @returns {any[]} The session summaries
 */
export declare function getSessionsWithSummaries(targetRepo: string): {
    summary: string;
}[];
/**
 * Retrieves mission traces for a specific file in chronological order.
 * @param {string} filePath - The file path to query
 * @returns {any[]} The traces
 */
export declare function getTracesForFile(filePath: string): any[];
/**
 * Retrieves all pings for a specific session in chronological order.
 * @param {number} sessionId - The session ID
 * @param {string} targetRepo - The target repository path
 * @returns {AgentPing[]} The pings
 */
export declare function getSessionPings(sessionId: number, targetRepo: string): AgentPing[];
