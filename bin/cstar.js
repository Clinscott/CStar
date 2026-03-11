#!/usr/bin/env node

/**
 * [GUNGNIR] TypeScript Bootstrap Wrapper
 * This script redirects execution to the root cstar.ts using tsx.
 * This maintains compatibility with the global 'cstar' link while
 * enabling robust, typed development.
 */

import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../');
const ENTRY_POINT = join(PROJECT_ROOT, 'cstar.ts');

// [🔱] THE AWAKENING: Load global environment
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

function resolveTsxLaunch() {
    const localTsx = join(
        PROJECT_ROOT,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
    );

    if (fs.existsSync(localTsx)) {
        return {
            command: localTsx,
            args: [ENTRY_POINT, ...process.argv.slice(2)],
        };
    }

    return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['tsx', ENTRY_POINT, ...process.argv.slice(2)],
    };
}

async function bootstrap() {
    try {
        const launchCwd = process.cwd();
        const launch = resolveTsxLaunch();
        // [Ω] Execute the TypeScript core with all arguments passed through
        await execa(launch.command, launch.args, {
            stdio: 'inherit',
            cwd: launchCwd,
            env: { 
                ...process.env, 
                CSTAR_BINARY: '1',
                CSTAR_PROJECT_ROOT: PROJECT_ROOT,
                CSTAR_LAUNCH_CWD: launchCwd,
            }
        });
    } catch (error) {
        // The child process handles its own errors; we just exit with the same code
        process.exit(error.exitCode || 1);
    }
}

bootstrap();

