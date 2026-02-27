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
        // Evict old sessions before creating a new one
        await evictOldSessions(sessionsDir);

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

/**
 * Rolling Eviction Protocol: Keeps only the last 10 session files.
 */
async function evictOldSessions(dir: string) {
    try {
        const files = await fs.readdir(dir);
        if (files.length < 10) return;

        // Stat all files to get modification times
        const fileStats = await Promise.all(
            files.map(async (f) => ({
                name: f,
                time: (await fs.stat(path.join(dir, f))).mtimeMs
            }))
        );

        // Sort by time (oldest first)
        fileStats.sort((a, b) => a.time - b.time);

        // Remove oldest to stay at 9 (leaving room for the new one)
        const toDelete = fileStats.slice(0, fileStats.length - 9);
        for (const f of toDelete) {
            await fs.unlink(path.join(dir, f.name));
        }
    } catch (err) {
        // Silent fail for robustness
    }
}

