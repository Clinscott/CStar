#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT, buildStableTempEnv, resolveProjectPython } from './runtime-env.mjs';

const result = spawnSync(resolveProjectPython(PROJECT_ROOT), process.argv.slice(2), {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: buildStableTempEnv(process.env, {
        projectRoot: PROJECT_ROOT,
        launchCwd: process.cwd(),
    }),
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
