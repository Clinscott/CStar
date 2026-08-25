#!/usr/bin/env node

/**
 * [CSTAR_KERNEL] MCP bootstrap.
 * Replaces this launcher with the TypeScript MCP entry under Node's --import
 * loader path so stdio file descriptors stay attached to the host.
 * Bounded redacted errors are appended to the project-local MCP log.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import fs from 'node:fs';
import {
    buildKernelMcpChildEnv,
    resolveKernelMcpLaunchRoots,
} from './cstar-kernel-mcp-env.js';
import {
    formatBootstrapErrorRecord,
    logBootstrapError,
} from './cstar-kernel-mcp-bootstrap-log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DERIVED_CODE_ROOT = join(__dirname, '..');
let bootstrapLogRoot = null;

try {
    if (process.argv.slice(2).length !== 0) {
        throw new Error('cstar_kernel_launcher_arguments_forbidden');
    }
    const roots = resolveKernelMcpLaunchRoots({
        codeRoot: DERIVED_CODE_ROOT,
        controlRoot: process.env.CSTAR_CONTROL_ROOT,
    });
    const { codeRoot: CODE_ROOT, controlRoot: CONTROL_ROOT } = roots;
    bootstrapLogRoot = CONTROL_ROOT;

    const tsxLoader = join(CODE_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    if (!fs.existsSync(tsxLoader)) {
        throw new Error(`tsx loader not found at ${tsxLoader}. Run npm install.`);
    }

    const args = [
        '--import',
        tsxLoader,
        join(CODE_ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts'),
    ];

    const env = buildKernelMcpChildEnv(process.env, {
        CSTAR_CODE_ROOT: CODE_ROOT,
        CSTAR_CONTROL_ROOT: CONTROL_ROOT,
        CSTAR_PROJECT_ROOT: CONTROL_ROOT,
        CSTAR_WORKSPACE_ROOT: CONTROL_ROOT,
    });
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        env,
        cwd: CODE_ROOT,
    });

    child.on('exit', (code) => {
        process.exit(code ?? 0);
    });

    child.on('error', (err) => {
        logBootstrapError(CONTROL_ROOT, err);
        process.exit(1);
    });
} catch (error) {
    if (bootstrapLogRoot) {
        logBootstrapError(bootstrapLogRoot, error);
    } else {
        process.stderr.write(formatBootstrapErrorRecord(error));
    }
    process.exit(1);
}
