import fs from 'fs/promises';
import path from 'path';
import { AgentPing } from '../types.js';
import { savePing } from '../intel/database.js';

/**
 * Record a ping to the chronological session ledger (SQLite).
 */
export async function recordPing(ping: AgentPing, targetRepo: string) {
    const statsDir = path.join(targetRepo, '.stats');

    try {
        // 1. Save to SQLite
        await savePing(ping, targetRepo);

        // 2. Global Gravity (Legacy sync for backward compatibility with current analyzer)
        await updateGravity(ping.target_path, statsDir);

    } catch (err) {
        console.error(`[ALFRED]: "Failed to record telemetry to the Hall of Records, sir."`, err);
    }
}

/**
 * Update the 'Agent Gravity' hotspots.
 * Still maintained as JSON for fast lookup during static scans.
 */
async function updateGravity(filePath: string, statsDir: string) {
    const gravityPath = path.join(statsDir, 'gravity.json');
    let gravityData: Record<string, number> = {};

    try {
        const raw = await fs.readFile(gravityPath, 'utf-8');
        gravityData = JSON.parse(raw);
    } catch (e) {
        // First gravity point
    }

    gravityData[filePath] = (gravityData[filePath] || 0) + 1;
    await fs.writeFile(gravityPath, JSON.stringify(gravityData, null, 2), 'utf-8');
}

