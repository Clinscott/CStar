import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ERROR = 'legacy_cstar_mcp_tcp_transport_retired_use_direct_stdio';
const ENTRIES = [
    path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp-bridge.js'),
    path.join(PROJECT_ROOT, 'scripts', 'cstar-mcp-tcp-daemon.js'),
];

async function invoke(entry: string) {
    const child = spawn(process.execPath, [entry], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
            CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
            CSTAR_KERNEL_MCP_TCP_PORT: '65534',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    return { exitCode, stdout, stderr };
}

describe('retired CStar MCP TCP transport', () => {
    for (const entry of ENTRIES) {
        it(`${path.basename(entry)} fails before transport or process activity`, async () => {
            const result = await invoke(entry);
            assert.equal(result.exitCode, 1);
            assert.equal(result.stdout, '');
            assert.equal(result.stderr, `${ERROR}\n`);

            const source = fs.readFileSync(entry, 'utf8');
            assert.doesNotMatch(source, /node:(?:net|child_process)|createServer|createConnection|listen\(|spawn\(/);
        });
    }
});
