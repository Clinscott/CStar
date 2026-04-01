#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT, buildStableTempEnv, resolveTsxLaunch } from './runtime-env.mjs';

const launch = resolveTsxLaunch(PROJECT_ROOT, process.argv.slice(2));
const result = spawnSync(launch.command, launch.args, {
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
