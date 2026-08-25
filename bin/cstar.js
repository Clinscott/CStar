#!/usr/bin/env node

/**
 * [GUNGNIR] TypeScript Bootstrap Wrapper
 * This script redirects execution to the root cstar.ts using tsx.
 * This maintains compatibility with the global 'cstar' link while
 * enabling robust, typed development.
 */

import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import { buildStableTempEnv, resolveTsxLaunch } from '../scripts/runtime-env.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../');
const ENTRY_POINT = join(PROJECT_ROOT, 'cstar.ts');

const SENSITIVE_ENV_KEY =
    /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|ACCESS_?KEY|AUTH)(?:_|$)/i;

export function buildInspectionCliEnv(sourceEnv = process.env, overrides = {}) {
    const scrubbed = {};
    for (const [key, value] of Object.entries({ ...sourceEnv, ...overrides })) {
        if (!SENSITIVE_ENV_KEY.test(key)) {
            scrubbed[key] = value;
        }
    }
    return buildStableTempEnv(scrubbed);
}

export async function bootstrap() {
    try {
        const launchCwd = process.cwd();
        const launch = resolveTsxLaunch(PROJECT_ROOT, [ENTRY_POINT, ...process.argv.slice(2)]);
        // [Ω] Execute the TypeScript core with all arguments passed through
        await execa(launch.command, launch.args, {
            stdio: 'inherit',
            cwd: launchCwd,
            extendEnv: false,
            env: buildInspectionCliEnv(process.env, {
                CSTAR_BINARY: '1',
                CSTAR_PROJECT_ROOT: PROJECT_ROOT,
                CSTAR_LAUNCH_CWD: launchCwd,
            })
        });
    } catch (error) {
        // The child process handles its own errors; we just exit with the same code
        process.exit(error.exitCode || 1);
    }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    await bootstrap();
}
