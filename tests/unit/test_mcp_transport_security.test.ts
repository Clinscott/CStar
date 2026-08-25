import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    childExitCode,
    installChildSignalRelay,
} from '../../bin/cstar-kernel-mcp-process.js';
import { normalizeKernelMcpLoopbackHost } from '../../bin/cstar-kernel-mcp-transport.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

class FakeChild extends EventEmitter {
    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;
    pid = 4242;
    kills: NodeJS.Signals[] = [];

    kill(signal: NodeJS.Signals): boolean {
        this.kills.push(signal);
        return true;
    }
}

function runRejectedTransport(scriptPath: string, host: string) {
    return spawnSync(process.execPath, [path.join(PROJECT_ROOT, scriptPath)], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            CSTAR_KERNEL_MCP_TCP_HOST: host,
            CSTAR_KERNEL_MCP_TRANSPORT: 'tcp',
            CSTAR_KERNEL_MCP_TCP_CONNECT_TIMEOUT_MS: '5000',
        },
        encoding: 'utf-8',
        timeout: 1000,
    });
}

describe('CStar MCP loopback transport boundary', () => {
    it('normalizes only explicit loopback aliases', () => {
        assert.equal(normalizeKernelMcpLoopbackHost('127.0.0.1'), '127.0.0.1');
        assert.equal(normalizeKernelMcpLoopbackHost('::1'), '::1');
        assert.equal(normalizeKernelMcpLoopbackHost('[::1]'), '::1');
        assert.equal(normalizeKernelMcpLoopbackHost(' LOCALHOST '), '127.0.0.1');
    });

    it('rejects wildcard, unspecified, alternate-loopback, remote, and empty hosts', () => {
        for (const host of ['0.0.0.0', '::', '127.0.0.2', '192.0.2.10', 'example.com', '']) {
            assert.throws(
                () => normalizeKernelMcpLoopbackHost(host),
                /CSTAR_KERNEL_MCP_TCP_HOST must be one of 127\.0\.0\.1, ::1, or localhost/,
                host,
            );
        }
    });

    for (const scriptPath of [
        'bin/cstar-kernel-mcp-bridge.js',
        'scripts/cstar-mcp-tcp-daemon.js',
    ]) {
        for (const host of ['0.0.0.0', '192.0.2.10']) {
            it(`${scriptPath} rejects retired TCP mode for ${host} before connect or bind`, () => {
                const result = runRejectedTransport(scriptPath, host);

                assert.equal(result.error, undefined);
                assert.equal(result.status, 2);
                assert.match(
                    result.stderr,
                    /unauthenticated_tcp_transport_disabled/,
                );
                assert.doesNotMatch(result.stderr, /timeout connecting|listening on/);
            });
        }
    }

    it('rejects unknown bridge transport modes', () => {
        const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'bin/cstar-kernel-mcp-bridge.js')], {
            cwd: PROJECT_ROOT,
            env: { ...process.env, CSTAR_KERNEL_MCP_TRANSPORT: 'unknown' },
            encoding: 'utf-8',
            timeout: 1000,
        });

        assert.equal(result.status, 2);
        assert.match(result.stderr, /invalid transport mode/);
    });

    it('does not permit the source launcher to inherit retired TCP identity', () => {
        const source = fs.readFileSync(path.join(PROJECT_ROOT, 'bin/cstar-kernel-mcp.js'), 'utf-8');

        assert.match(source, /parentTransport !== 'direct-stdio'/);
        assert.doesNotMatch(source, /parentTransport !== 'tcp-daemon'/);
        assert.match(source, /const callerTransport = 'direct-stdio'/);
    });
});

describe('CStar MCP retained-child signal ownership', () => {
    it('forwards one termination signal and escalates an unresponsive child', async () => {
        const child = new FakeChild();
        const relay = installChildSignalRelay(child, { graceMs: 5 });

        try {
            relay.forward('SIGTERM');
            relay.forward('SIGINT');
            await delay(20);

            assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']);
        } finally {
            relay.cleanup();
        }
    });

    it('cancels escalation when the child exits during grace', async () => {
        const child = new FakeChild();
        const relay = installChildSignalRelay(child, { graceMs: 5 });

        try {
            relay.forward('SIGINT');
            child.exitCode = 0;
            child.emit('exit', 0, null);
            await delay(20);

            assert.deepEqual(child.kills, ['SIGINT']);
        } finally {
            relay.cleanup();
        }
    });

    it('preserves numeric and signal-derived exit semantics', () => {
        assert.equal(childExitCode(7, null), 7);
        assert.equal(childExitCode(null, 'SIGINT'), 130);
        assert.equal(childExitCode(null, 'SIGTERM'), 143);
        assert.equal(childExitCode(null, 'SIGKILL'), 137);
        assert.equal(childExitCode(null, null), 1);
    });

    for (const launcherPath of [
        'bin/cstar-kernel-mcp.js',
        'bin/cstar-kernel-mcp-bridge.js',
    ]) {
        it(`${launcherPath} installs the bounded child signal relay`, () => {
            const source = fs.readFileSync(path.join(PROJECT_ROOT, launcherPath), 'utf-8');

            assert.match(source, /installChildSignalRelay\(child/);
            assert.match(source, /childExitCode\(code, signal\)/);
        });
    }

    it('TCP daemon cannot spawn the source launcher', () => {
        const source = fs.readFileSync(
            path.join(PROJECT_ROOT, 'scripts', 'cstar-mcp-tcp-daemon.js'),
            'utf-8',
        );

        assert.match(source, /unauthenticated_tcp_transport_disabled/);
        assert.doesNotMatch(source, /spawn\(|createServer\(/);
    });
});
