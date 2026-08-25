import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const BRIDGE = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp-bridge.js');
const DAEMON = path.join(PROJECT_ROOT, 'scripts', 'cstar-mcp-tcp-daemon.js');

function runRetired(script: string) {
    return spawnSync(process.execPath, [script], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
            CSTAR_KERNEL_MCP_TCP_HOST: '127.0.0.1',
            CSTAR_KERNEL_MCP_TCP_PORT: '65534',
        },
        encoding: 'utf-8',
        timeout: 2000,
    });
}

describe('CStar MCP retired TCP transport boundary', () => {
    it('fails closed at both compatibility entrypoints without connecting', () => {
        for (const script of [BRIDGE, DAEMON]) {
            const result = runRetired(script);
            assert.equal(result.error, undefined);
            assert.equal(result.status, 2);
            assert.match(result.stderr, /unauthenticated_tcp_transport_disabled/);
            assert.doesNotMatch(result.stderr, /timeout|ECONNREFUSED|listening/);
        }
    });

    it('maps legacy auto mode to a real direct-stdio MCP session', async () => {
        const child = spawn(process.execPath, [BRIDGE], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CSTAR_KERNEL_MCP_TRANSPORT: 'auto',
                CSTAR_PROJECT_ROOT: PROJECT_ROOT,
                CSTAR_WORKSPACE_ROOT: PROJECT_ROOT,
                CODEX_THREAD_ID: '019f5390-a2db-7b91-bc89-e1392960fb3a',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });

        try {
            child.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'retired-tcp-integration', version: '1.0.0' },
                },
            }) + '\n');
            const startedAt = Date.now();
            while (!stdout.split('\n').some((line) => {
                try { return JSON.parse(line).id === 1; } catch { return false; }
            })) {
                assert.equal(child.exitCode, null, stderr);
                assert.ok(Date.now() - startedAt < 10_000, `direct MCP initialize timed out: ${stderr}`);
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            assert.match(stderr, /legacy auto mode resolves to direct stdio/);
            assert.doesNotMatch(stderr, /TCP daemon|connect(?:ing)? to/);
        } finally {
            child.stdin.end();
            if (child.exitCode === null && child.signalCode === null) {
                child.kill('SIGTERM');
                await once(child, 'exit');
            }
        }
    });
});
