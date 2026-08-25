#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT, buildStableTempEnv, resolveProjectPython } from './runtime-env.mjs';

let python;
try {
    python = resolveProjectPython(PROJECT_ROOT, process.env);
} catch (error) {
    const code = typeof error?.code === 'string'
        ? error.code
        : 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE';
    process.stderr.write(`[CSTAR PYTHON] ${code}\n`);
    process.exit(2);
}

const result = spawnSync(python, process.argv.slice(2), {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: buildStableTempEnv(process.env, {
        projectRoot: PROJECT_ROOT,
        launchCwd: process.cwd(),
    }),
});

if (result.error) {
    process.stderr.write('[CSTAR PYTHON] CSTAR_PYTHON_SPAWN_FAILED\n');
    process.exit(2);
}

process.exit(result.status ?? 1);
