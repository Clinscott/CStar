import fs from 'fs/promises';
import path from 'path';
import { AgentPing } from '../types.js';

let sessionFile: string | null = null;

/**
 * Record a ping to the chronological session ledger.
 */
export async function recordPing(ping: AgentPing, targetRepo: string) {
    const sessionsDir = path.join(targetRepo, '.stats', 'sessions');

    if (!sessionFile) {
        await fs.mkdir(sessionsDir, { recursive: true });
        const ts = new Date().getTime();
        sessionFile = path.join(sessionsDir, `session_${ping.agent_id}_${ts}.json`);
        // Initialize as an empty array
        await fs.writeFile(sessionFile, '[]', 'utf-8');
    }

    try {
        const content = await fs.readFile(sessionFile, 'utf-8');
        const ledger = JSON.parse(content);
        ledger.push(ping);
        await fs.writeFile(sessionFile, JSON.stringify(ledger, null, 2), 'utf-8');
    } catch (err) {
        console.error(`[ALFRED]: "Failed to append telemetry to ledger, sir."`, err);
    }
}
