#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    PROJECT_ROOT,
    buildStableTempEnv,
    expandTestFileArgs,
    resolveTsxLaunch,
} from './runtime-env.mjs';

const cliArgs = process.argv.slice(2);
const launch = resolveTsxLaunch(PROJECT_ROOT, expandTestFileArgs(cliArgs, PROJECT_ROOT));
const ownsTestHall = cliArgs.includes('--test') && !process.env.CSTAR_TEST_HALL_ROOT;
const testHallRoot = ownsTestHall
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-node-tests-'))
    : process.env.CSTAR_TEST_HALL_ROOT;
let result;

try {
    result = spawnSync(launch.command, launch.args, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
        env: buildStableTempEnv(process.env, {
            projectRoot: PROJECT_ROOT,
            launchCwd: process.cwd(),
            testHallRoot,
        }),
    });
} finally {
    if (ownsTestHall && testHallRoot) {
        fs.rmSync(testHallRoot, { recursive: true, force: true, maxRetries: 3 });
    }
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);
