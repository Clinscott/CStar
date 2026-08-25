#!/usr/bin/env node

/**
 * CStar MCP direct-stdio bridge.
 *
 * The former loopback TCP proxy exposed mutation-capable tools to any local
 * process that could connect to the daemon. Direct stdio preserves the host
 * connection boundary and the caller thread binding needed by operator grants.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildKernelMcpChildEnv } from './cstar-kernel-mcp-env.js';
import { childExitCode, installChildSignalRelay } from './cstar-kernel-mcp-process.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIRECT_LAUNCHER = join(ROOT, 'bin', 'cstar-kernel-mcp.js');
const MODE = (process.env.CSTAR_KERNEL_MCP_TRANSPORT ?? 'direct').trim().toLowerCase();
const THREAD_ID_PATTERN = /^[0-9a-f-]{36}$/i;

function log(message) {
    process.stderr.write(`[cstar-kernel-bridge] ${message}\n`);
}

if (MODE === 'tcp') {
    log('unauthenticated_tcp_transport_disabled; use direct stdio');
    process.exitCode = 2;
} else if (MODE !== 'direct' && MODE !== 'auto') {
    log(`invalid transport mode ${JSON.stringify(MODE)}; expected direct`);
    process.exitCode = 2;
} else {
    if (MODE === 'auto') {
        log('legacy auto mode resolves to direct stdio');
    }
    const hostThreadId = process.env.CODEX_THREAD_ID?.trim() ?? '';
    const inheritedThreadId = process.env.CSTAR_MCP_CALLER_THREAD_ID?.trim() ?? '';
    const callerThreadId = THREAD_ID_PATTERN.test(hostThreadId)
        ? hostThreadId
        : THREAD_ID_PATTERN.test(inheritedThreadId)
            ? inheritedThreadId
            : '';
    const child = spawn(process.execPath, [DIRECT_LAUNCHER], {
        cwd: ROOT,
        stdio: 'inherit',
        env: buildKernelMcpChildEnv(process.env, {
            CSTAR_PROJECT_ROOT: process.env.CSTAR_PROJECT_ROOT ?? ROOT,
            CSTAR_WORKSPACE_ROOT: process.env.CSTAR_WORKSPACE_ROOT ?? ROOT,
            CSTAR_MCP_CALLER_THREAD_ID: callerThreadId,
            CSTAR_MCP_CALLER_TRANSPORT: 'direct-stdio',
        }),
    });
    installChildSignalRelay(child, { log });
    child.on('error', (error) => {
        log(`direct launcher error: ${error.message}`);
        process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
        process.exitCode = childExitCode(code, signal);
    });
}
