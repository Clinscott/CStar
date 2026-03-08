#!/usr/bin/env node

/**
 * [PENNYONE] MCP Bootstrap Wrapper
 * This script redirects execution to the mcp-server.ts using tsx.
 */

import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function bootstrap() {
    try {
        await execa('npx', ['tsx', join(ROOT, 'src/tools/pennyone/mcp-server.js')], {
            stdio: 'inherit',
            cwd: ROOT,
            env: { ...process.env, MCP_SERVER: '1' }
        });
    } catch (error) {
        process.exit(error.exitCode || 1);
    }
}

bootstrap();

