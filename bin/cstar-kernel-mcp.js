#!/usr/bin/env node

/**
 * [CSTAR_KERNEL] MCP bootstrap.
 * Spawns the TypeScript MCP entry under Node's --import loader with inherited
 * stdio, then exits with the child status. The small parent process is retained
 * so it can establish the fail-closed child environment before launch.
 * Errors are appended to logs/mcp/mcp_bootstrap_error.log for post-mortem.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import fs from 'node:fs';

import { buildKernelMcpChildEnv } from './cstar-kernel-mcp-env.js';
import { childExitCode, installChildSignalRelay } from './cstar-kernel-mcp-process.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const LOG_DIR = join(ROOT, 'logs', 'mcp');
const LOG_PATH = join(LOG_DIR, 'mcp_bootstrap_error.log');

function logBootstrapError(error) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        const stack = error?.stack ?? error?.message ?? String(error);
        fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${stack}\n`, 'utf-8');
    } catch {
        // Logging must not throw further.
    }
}

try {
    const tsxLoader = join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    if (!fs.existsSync(tsxLoader)) {
        throw new Error(`tsx loader not found at ${tsxLoader}. Run npm install.`);
    }

    const args = [
        '--import',
        tsxLoader,
        join(ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts'),
    ];

    const parentTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT?.trim() ?? '';
    const inheritedThreadId = process.env.CSTAR_MCP_CALLER_THREAD_ID?.trim() ?? '';
    const codexThreadId = process.env.CODEX_THREAD_ID?.trim() ?? '';
    if (parentTransport && parentTransport !== 'direct-stdio') {
        throw new Error(`Unsupported inherited CStar MCP caller transport: ${parentTransport}`);
    }
    const callerTransport = 'direct-stdio';
    const callerThreadId = /^[0-9a-f-]{36}$/i.test(codexThreadId)
        ? codexThreadId
        : /^[0-9a-f-]{36}$/i.test(inheritedThreadId)
            ? inheritedThreadId
            : '';
    const env = buildKernelMcpChildEnv(process.env, {
        CSTAR_PROJECT_ROOT: process.env.CSTAR_PROJECT_ROOT ?? ROOT,
        CSTAR_WORKSPACE_ROOT: process.env.CSTAR_WORKSPACE_ROOT ?? ROOT,
        CSTAR_MCP_CALLER_THREAD_ID: callerThreadId,
        CSTAR_MCP_CALLER_TRANSPORT: callerTransport,
    });
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        env: env,
        cwd: ROOT
    });
    installChildSignalRelay(child, { log: (message) => process.stderr.write(`[cstar-kernel] ${message}\n`) });

    child.on('exit', (code, signal) => {
        process.exit(childExitCode(code, signal));
    });

    child.on('error', (err) => {
        logBootstrapError(err);
        process.exit(1);
    });
} catch (error) {
    logBootstrapError(error);
    process.exit(1);
}
