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

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../');
const ENTRY_POINT = join(PROJECT_ROOT, 'cstar.ts');

async function bootstrap() {
    try {
        // [Ω] Execute the TypeScript core with all arguments passed through
        // We use 'npx tsx' to ensure it's available in the environment
        await execa('npx', ['tsx', ENTRY_POINT, ...process.argv.slice(2)], {
            stdio: 'inherit',
            cwd: PROJECT_ROOT,
            env: { ...process.env, CSTAR_BINARY: '1' }
        });
    } catch (error) {
        // The child process handles its own errors; we just exit with the same code
        process.exit(error.exitCode || 1);
    }
}

bootstrap();
