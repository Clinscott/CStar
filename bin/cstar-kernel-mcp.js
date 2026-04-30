#!/usr/bin/env node

/**
 * [CSTAR_KERNEL] MCP bootstrap.
 * Replaces this launcher with the TypeScript MCP entry under Node's --import
 * loader path so stdio file descriptors stay attached to the host.
 * Errors are appended to logs/mcp/mcp_bootstrap_error.log for post-mortem.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import fs from 'node:fs';

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
        process.execPath,
        '--import',
        tsxLoader,
        join(ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts'),
    ];

    const env = {
        ...process.env,
        CSTAR_KERNEL_MCP: '1',
        CSTAR_PROJECT_ROOT: process.env.CSTAR_PROJECT_ROOT ?? ROOT,
        CSTAR_WORKSPACE_ROOT: process.env.CSTAR_WORKSPACE_ROOT ?? ROOT,
    };
    process.chdir(ROOT);
    process.execve(process.execPath, args, env);
} catch (error) {
    logBootstrapError(error);
    process.exit(1);
}
