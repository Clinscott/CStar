import { Request, Response } from 'express';
import { SubspaceRelay } from './socket.js';
/**
 * Path Normalization Mandate:
 * Sanitize incoming paths to match matrix-graph.json format.
 * @param {string} p - The path
 * @returns {string} The normalized path
 */
export declare function normalizePath(p: string): string;
/**
 * Handle ping
 * @param {Request} req - Req
 * @param {Response} res - Res
 * @param {SubspaceRelay} relay - Relay
 * @param {string} targetRepo - Repo
 * @returns {Promise<void>}
 */
export declare function handleTelemetryPing(req: Request, res: Response, relay: SubspaceRelay, targetRepo: string): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Handle Mission Trace
 * @param {Request} req - Req
 * @param {Response} res - Res
 * @param {SubspaceRelay} relay - Relay
 * @returns {Promise<void>}
 */
export declare function handleTelemetryTrace(req: Request, res: Response, relay: SubspaceRelay): Promise<Response<any, Record<string, any>> | undefined>;
