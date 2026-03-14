import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

export function buildStableTempEnv(baseEnv = process.env) {
    const env = { ...baseEnv };
    if (process.platform !== 'win32') {
        const stableTmp = env.TMPDIR || '/tmp';
        env.TMPDIR = stableTmp;
        env.TEMP = stableTmp;
        env.TMP = stableTmp;
    }
    return env;
}

export function resolveTsxLaunch(projectRoot = PROJECT_ROOT, args = []) {
    const localTsx = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    if (fs.existsSync(localTsx)) {
        return {
            command: localTsx,
            args,
        };
    }

    return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['tsx', ...args],
    };
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
