#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT, buildStableTempEnv, resolveTsxLaunch } from './runtime-env.mjs';

const launchArgs = process.argv.slice(2);
const launch = resolveTsxLaunch(PROJECT_ROOT, launchArgs);
const runtimeEnv = buildStableTempEnv(process.env, {
    projectRoot: PROJECT_ROOT,
    launchCwd: process.cwd(),
});
if (launchArgs.some((argument) => argument.replaceAll('\\', '/').includes('tests/unit/cstar-kernel-mcp/'))) {
    runtimeEnv.CSTAR_SKIP_COMPAT_KERNEL_IMPORTS = '1';
}
const result = spawnSync(launch.command, launch.args, {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: runtimeEnv,
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
