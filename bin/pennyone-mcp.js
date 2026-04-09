#!/usr/bin/env node

/**
 * [PENNYONE] MCP Bootstrap Wrapper
 * This script redirects execution to the mcp-server.ts using tsx.
 */

import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { buildStableTempEnv, resolveTsxLaunch } from '../scripts/runtime-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function bootstrap() {
    try {
        const launch = resolveTsxLaunch(ROOT, [join(ROOT, 'src/tools/pennyone/mcp-server.ts')]);
        await execa(launch.command, launch.args, {
            stdio: 'inherit',
            cwd: ROOT,
            env: buildStableTempEnv({ ...process.env, MCP_SERVER: '1' })
        });
    } catch (error) {
        process.exit(error.exitCode || 1);
    }
}

bootstrap();

