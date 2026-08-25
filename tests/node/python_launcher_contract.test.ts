import { afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

import { resolveProjectPython } from '../../scripts/runtime-env.mjs';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RUN_PYTHON = path.join(PROJECT_ROOT, 'scripts', 'run-python.mjs');
const roots: string[] = [];

afterEach(() => {
    while (roots.length > 0) {
        fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
});

function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-python-launcher-'));
    roots.push(root);
    return root;
}

function executableAt(target: string): string {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(process.execPath, target);
    fs.chmodSync(target, 0o755);
    return fs.realpathSync(target);
}

function isolatedEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const env = { ...process.env, ...overrides };
    delete env.CSTAR_PYTHON_EXECUTABLE;
    return { ...env, ...overrides };
}

describe('CStar Python launcher contract', () => {
    it('uses a valid explicit executable before a project-local environment', () => {
        const root = tempRoot();
        const local = executableAt(path.join(root, '.venv', 'bin', 'python'));
        const explicit = executableAt(path.join(root, 'explicit-python'));

        assert.notEqual(local, explicit);
        assert.equal(resolveProjectPython(root, { CSTAR_PYTHON_EXECUTABLE: explicit }), explicit);
    });

    it('rejects invalid explicit overrides without falling through to a local environment', () => {
        const root = tempRoot();
        executableAt(path.join(root, '.venv', 'bin', 'python'));

        for (const value of ['', 'python3', path.join(root, 'missing-python')]) {
            assert.throws(
                () => resolveProjectPython(root, { CSTAR_PYTHON_EXECUTABLE: value }),
                (error: NodeJS.ErrnoException) => error.code === 'CSTAR_PYTHON_EXECUTABLE_INVALID',
            );
        }
    });

    it('selects only the project-local environment when no override is present', () => {
        const root = tempRoot();
        const local = executableAt(path.join(root, '.venv', 'bin', 'python'));
        assert.equal(resolveProjectPython(root, {}), local);
    });

    it('validates symlink targets while preserving the virtual-environment launch path', () => {
        if (process.platform === 'win32') return;

        const root = tempRoot();
        const target = executableAt(path.join(root, 'base-python'));
        const launcher = path.join(root, '.venv', 'bin', 'python');
        fs.mkdirSync(path.dirname(launcher), { recursive: true });
        fs.symlinkSync(target, launcher);

        assert.equal(resolveProjectPython(root, {}), path.resolve(launcher));
        assert.notEqual(resolveProjectPython(root, {}), fs.realpathSync(launcher));
    });

    it('fails closed when neither an override nor project-local environment exists', () => {
        assert.throws(
            () => resolveProjectPython(tempRoot(), {}),
            (error: NodeJS.ErrnoException) => error.code === 'CSTAR_PYTHON_EXECUTABLE_UNAVAILABLE',
        );
    });

    it('does not spawn a child for an invalid explicit override', async () => {
        const result = await execa(process.execPath, [RUN_PYTHON, '-c', 'raise SystemExit(0)'], {
            cwd: PROJECT_ROOT,
            env: isolatedEnv({ CSTAR_PYTHON_EXECUTABLE: path.join(tempRoot(), 'missing-python') }),
            reject: false,
        });

        assert.equal(result.exitCode, 2);
        assert.equal(result.stderr, '[CSTAR PYTHON] CSTAR_PYTHON_EXECUTABLE_INVALID');
    });

    it('spawns one explicit executable and preserves its exit status', async () => {
        const result = await execa(process.execPath, [RUN_PYTHON, '-e', 'process.exit(7)'], {
            cwd: PROJECT_ROOT,
            env: isolatedEnv({ CSTAR_PYTHON_EXECUTABLE: process.execPath }),
            reject: false,
        });

        assert.equal(result.exitCode, 7);
        assert.equal(result.stderr, '');
    });
});
