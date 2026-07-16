import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

function isWindowsInteropPath(value) {
    return /^[a-z]:[\\/]/i.test(value) || /^\/mnt\/[a-z](?:\/|$)/i.test(value);
}

export function buildStableTempEnv(baseEnv = process.env, options = {}) {
    const env = { ...baseEnv };
    const projectRoot = options.projectRoot ?? PROJECT_ROOT;
    const launchCwd = options.launchCwd ?? process.cwd();
    if (process.platform !== 'win32') {
        const requestedTmp = env.TMPDIR;
        const stableTmp = requestedTmp
            && path.isAbsolute(requestedTmp)
            && !isWindowsInteropPath(requestedTmp)
            ? requestedTmp
            : '/tmp';
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
    return env;
}

export function resolveTsxLaunch(projectRoot = PROJECT_ROOT, args = []) {
    const localTsxLoader = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    if (fs.existsSync(localTsxLoader)) {
        return {
            // The tsx CLI spins up an IPC socket that can be blocked by sandboxed environments.
            // Launching Node directly with the local tsx loader keeps Hall/bootstrap access available.
            command: process.execPath,
            args: ['--import', localTsxLoader, ...args],
        };
    }

    return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['tsx', ...args],
    };
}

function pythonResolutionError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function resolveExecutableFile(candidate, invalidCode) {
    try {
        const launchPath = path.resolve(candidate);
        const resolvedTarget = fs.realpathSync(launchPath);
        if (!fs.statSync(resolvedTarget).isFile()) {
            throw pythonResolutionError(invalidCode);
        }
        fs.accessSync(launchPath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
        // Preserve the venv launcher path. Returning its realpath would invoke the
        // base interpreter directly and discard pyvenv.cfg/sys.prefix semantics.
        return launchPath;
    } catch (error) {
        if (error?.code === invalidCode) {
            throw error;
        }
        throw pythonResolutionError(invalidCode);
    }
}

export function resolveProjectPython(projectRoot = PROJECT_ROOT, env = process.env) {
    if (Object.hasOwn(env, 'CSTAR_PYTHON_EXECUTABLE')) {
        const explicit = env.CSTAR_PYTHON_EXECUTABLE;
        if (typeof explicit !== 'string' || explicit.trim() === '' || !path.isAbsolute(explicit)) {
            throw pythonResolutionError('CSTAR_PYTHON_EXECUTABLE_INVALID');
        }
        return resolveExecutableFile(explicit, 'CSTAR_PYTHON_EXECUTABLE_INVALID');
    }

    const windows = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    const unix = path.join(projectRoot, '.venv', 'bin', 'python');
    if (process.platform === 'win32' && fs.existsSync(windows)) {
        return resolveExecutableFile(windows, 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE');
    }
    if (process.platform !== 'win32' && fs.existsSync(unix)) {
        return resolveExecutableFile(unix, 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE');
    }
    if (fs.existsSync(unix)) {
        return resolveExecutableFile(unix, 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE');
    }
    if (fs.existsSync(windows)) {
        return resolveExecutableFile(windows, 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE');
    }
    throw pythonResolutionError('CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE');
}
