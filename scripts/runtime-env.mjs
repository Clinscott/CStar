import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fastGlob from 'fast-glob';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

export function buildStableTempEnv(baseEnv = process.env, options = {}) {
    const env = { ...baseEnv };
    const projectRoot = options.projectRoot ?? PROJECT_ROOT;
    const launchCwd = options.launchCwd ?? process.cwd();
    if (process.platform !== 'win32') {
        const stableTmp = env.TMPDIR || '/tmp';
        env.TMPDIR = stableTmp;
        env.TEMP = stableTmp;
        env.TMP = stableTmp;
    }
    if (!env.CSTAR_PROJECT_ROOT) {
        env.CSTAR_PROJECT_ROOT = projectRoot;
    }
    if (!env.CSTAR_WORKSPACE_ROOT) {
        env.CSTAR_WORKSPACE_ROOT = projectRoot;
    }
    if (!env.CSTAR_LAUNCH_CWD) {
        env.CSTAR_LAUNCH_CWD = launchCwd;
    }
    if (options.testHallRoot && !env.CSTAR_TEST_HALL_ROOT) {
        env.CSTAR_TEST_HALL_ROOT = options.testHallRoot;
        env.CSTAR_TEST_HALL_SUBJECT_ROOT = projectRoot;
    }
    return env;
}

export function resolveTsxLaunch(projectRoot = PROJECT_ROOT, args = []) {
    const localTsxLoader = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    if (fs.existsSync(localTsxLoader)) {
        return {
            // The tsx CLI spins up an IPC socket that can be blocked by sandboxed environments.
            // Launching Node directly with the local tsx loader keeps Hall/bootstrap access available.
            command: process.execPath,
            args: ['--import', pathToFileURL(localTsxLoader).href, ...args],
        };
    }

    return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['tsx', ...args],
    };
}

export function expandTestFileArgs(args = [], projectRoot = PROJECT_ROOT) {
    if (!args.includes('--test')) {
        return [...args];
    }

    return args.flatMap((arg) => {
        const isTestFilePattern = !arg.startsWith('-')
            && fastGlob.isDynamicPattern(arg)
            && /\.(?:[cm]?[jt]s|tsx)$/i.test(arg);
        if (!isTestFilePattern) {
            return [arg];
        }

        return fastGlob.sync(arg, {
            cwd: projectRoot,
            onlyFiles: true,
            unique: true,
        }).sort();
    });
}

export function resolveProjectPython(projectRoot = PROJECT_ROOT) {
    const windows = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    const unix = path.join(projectRoot, '.venv', 'bin', 'python');
    if (process.platform === 'win32' && fs.existsSync(windows)) {
        return windows;
    }
    if (process.platform !== 'win32' && fs.existsSync(unix)) {
        return unix;
    }
    if (fs.existsSync(unix)) {
        return unix;
    }
    if (fs.existsSync(windows)) {
        return windows;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}
