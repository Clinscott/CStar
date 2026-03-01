import { recordPing, recordTrace } from './recorder.js';
/**
 * Path Normalization Mandate:
 * Sanitize incoming paths to match matrix-graph.json format.
 * @param {string} p - The path
 * @returns {string} The normalized path
 */
export function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
/**
 * Handle ping
 * @param {Request} req - Req
 * @param {Response} res - Res
 * @param {SubspaceRelay} relay - Relay
 * @param {string} targetRepo - Repo
 * @returns {Promise<void>}
 */
export async function handleTelemetryPing(req, res, relay, targetRepo) {
    const ping = req.body;
    if (!ping.agent_id || !ping.target_path) {
        return res.status(400).json({ error: 'Missing agent_id or target_path' });
    }
    ping.target_path = normalizePath(ping.target_path);
    // 1. Broadcast to Matrix
    relay.broadcast('AGENT_TRACE', ping);
    // 2. Record to Session Ledger
    await recordPing(ping, targetRepo);
    res.status(200).json({ status: 'Telemetry received' });
}
/**
 * Handle Mission Trace
 * @param {Request} req - Req
 * @param {Response} res - Res
 * @param {SubspaceRelay} relay - Relay
 * @returns {Promise<void>}
 */
export async function handleTelemetryTrace(req, res, relay) {
    const trace = req.body;
    if (!trace.mission_id || !trace.file_path) {
        return res.status(400).json({ error: 'Missing mission_id or file_path' });
    }
    trace.file_path = normalizePath(trace.file_path);
    // 1. Broadcast to Matrix (if needed for real-time alerts)
    relay.broadcast('MISSION_TRACE', trace);
    // 2. Record to Hall of Records
    await recordTrace(trace);
    res.status(200).json({ status: 'Trace recorded' });
}
