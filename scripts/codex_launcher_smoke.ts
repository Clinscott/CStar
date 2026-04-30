import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const launcherPath = path.join(os.homedir(), '.local', 'bin', 'corvus-codex');
const stateLogPath = path.join(process.cwd(), '.agents', 'state', 'codex-launcher-smoke.jsonl');

async function appendLog(entry: Record<string, unknown>): Promise<void> {
    const fs = await import('node:fs/promises');
    try {
        await fs.mkdir(path.dirname(stateLogPath), { recursive: true });
        await fs.appendFile(stateLogPath, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch {
        // Logging must not break the smoke check.
    }
}

async function main(): Promise<void> {
    const startedAt = Date.now();
    try {
        const { stdout, stderr } = await execFileAsync(launcherPath, ['--version'], {
            cwd: process.cwd(),
            timeout: 20000,
            env: process.env,
        });
        const combined = `${stderr}\n${stdout}`;
        if (!/codex-cli\s+\S+/.test(combined)) {
            throw new Error(`Unexpected corvus-codex --version output: ${combined.trim()}`);
        }

        await appendLog({
            ts: new Date().toISOString(),
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            launcher_path: launcherPath,
            output: combined.trim(),
        });
        console.log('[corvus:codex:smoke] corvus-codex --version passed.');
        console.log(combined.trim());
    } catch (error: any) {
        await appendLog({
            ts: new Date().toISOString(),
            status: 'fail',
            duration_ms: Date.now() - startedAt,
            launcher_path: launcherPath,
            error: error?.message ?? String(error),
        });
        console.error(`[corvus:codex:smoke][fail] ${error?.message ?? String(error)}`);
        process.exitCode = 1;
    }
}

await main();
