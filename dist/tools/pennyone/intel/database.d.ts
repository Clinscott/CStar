import Database from 'better-sqlite3';
import { AgentPing } from '../types.js';
/**
 * Get the database instance.
 * @returns {Database.Database} The db instance
 */
export declare function getDb(): Database.Database;
export interface MissionTrace {
    mission_id: string;
    file_path: string;
    target_metric: string;
    initial_score: number;
    final_score?: number;
    justification: string;
    status: string;
    timestamp?: number;
}
/**
 * Attempts to acquire an exclusive task lease for a target file.
 * @param {string} targetPath - The file to lock
 * @param {string} agentId - The ID of the agent requesting the lease
 * @param {number} durationMs - How long the lease is valid (default 5 mins)
 * @returns {boolean} True if lease acquired, false if held by another agent
 */
export declare function acquireLease(targetPath: string, agentId: string, durationMs?: number): boolean;
/**
 * Releases a task lease.
 * @param {string} targetPath - The file to unlock
 * @param {string} agentId - The ID of the agent releasing the lease
 */
export declare function releaseLease(targetPath: string, agentId: string): void;
/**
 * Persists a Mission Trace to the database.
 * @param {MissionTrace} trace - The trace data
 */
export declare function saveTrace(trace: MissionTrace): Promise<void>;
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
 * @returns {Record<string, unknown>[]} The session summaries
 */
export declare function getSessionsWithSummaries(targetRepo: string): Record<string, unknown>[];
/**
 * Retrieves mission traces for a specific file in chronological order.
 * @param {string} filePath - The file path to query
 * @returns {MissionTrace[]} The traces
 */
export declare function getTracesForFile(filePath: string): MissionTrace[];
/**
 * Retrieves all pings for a specific session in chronological order.
 * @param {number} sessionId - The session ID
 * @param {string} targetRepo - The target repository path
 * @param _targetRepo
 * @returns {AgentPing[]} The pings
 */
export declare function getSessionPings(sessionId: number, _targetRepo: string): AgentPing[];
/**
 * Updates the FTS index for a file's intent.
 * @param {string} filePath - The file path
 * @param {string} intent - The analyzed intent
 * @param {string} protocol - The interaction protocol
 */
export declare function updateFtsIndex(filePath: string, intent: string, protocol: string): void;
/**
 * Updates the Chronicle index for a specific lore chunk.
 * @param {string} sourceFile - The source file (dev_journal.qmd, memory.qmd)
 * @param {string} header - The header/date of the entry
 * @param {string} content - The entry content
 * @param {string} timestamp - Optional timestamp string
 */
export declare function updateChronicleIndex(sourceFile: string, header: string, content: string, timestamp?: string): void;
/**
 * Performs a high-fidelity FTS5 search across file intents and chronicles.
 * @param {string} query - The search query
 * @returns {any[]} The matching results
 */
export declare function searchIntents(query: string): any[];
/**
 * Retrieves the most recent sessions across all spokes.
 * @param {number} limit - The number of sessions to retrieve
 * @returns {any[]} The recent sessions
 */
export declare function getRecentSessions(limit?: number): any[];
/**
 * Retrieves all pings for a specific session.
 * @param {number} sessionId - The session ID
 * @returns {any[]} The pings in chronological order
 */
export declare function getPingsForSession(sessionId: number): any[];
/**
 * Closes the active database connection.
 */
export declare function closeDb(): void;
