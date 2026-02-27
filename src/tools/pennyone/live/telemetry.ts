import { Request, Response } from 'express';
import { SubspaceRelay } from './socket.js';
import { recordPing } from './recorder.js';
import { AgentPing } from '../types.js';

/**
 * Path Normalization Mandate:
 * Sanitize incoming paths to match matrix-graph.json format (Forward-slash absolute).
 */
export function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

export async function handleTelemetryPing(req: Request, res: Response, relay: SubspaceRelay, targetRepo: string) {
    const ping: AgentPing = req.body;

    if (!ping.agent_id || !ping.target_path) {
        return res.status(400).json({ error: "Missing agent_id or target_path" });
    }

    ping.target_path = normalizePath(ping.target_path);

    // 1. Broadcast to Matrix
    relay.broadcast('AGENT_TRACE', ping);

    // 2. Record to Session Ledger
    await recordPing(ping, targetRepo);

    res.status(200).json({ status: "Telemetry received" });
}
