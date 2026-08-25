import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildKernelMcpChildEnv,
    neutralizeKernelMcpProcessEnv,
    resolveKernelMcpLaunchRoots,
} from '../../../bin/cstar-kernel-mcp-env.js';
import {
    buildWardenSubprocessEnv,
    handleWarden,
    resolveWardenPython,
} from '../../../src/tools/cstar-kernel-mcp/tools/warden.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NATIVE_TEMP_ROOT = process.platform === 'linux' ? '/tmp' : os.tmpdir();

describe('CStar kernel environment containment', () => {
    it('constructs the kernel child environment from an explicit allowlist', () => {
        const env = buildKernelMcpChildEnv({
            HOME: '/home/operator',
            PATH: '/usr/bin:/bin',
            CODEX_HOME: '/home/operator/.codex',
            CSTAR_MCP_CALLER_THREAD_ID: 'thread-safe-id',
            CSTAR_MCP_CALLER_TRANSPORT: 'direct-stdio',
            CSTAR_PROJECT_ROOT: '/tmp/hostile-root',
            CSTAR_CODE_ROOT: '/tmp/hostile-code-root',
            CSTAR_CONTROL_ROOT: '/tmp/hostile-control-root',
            NODE_OPTIONS: '--require=/tmp/hostile-preload.cjs',
            API_KEY: 'must-not-cross',
            GOOGLE_API_KEY: 'must-not-cross',
            CSTAR_MONGO_URI: 'mongodb://secret@host/db',
            AUGURY_TOKEN_PATH_ROOT: '/tmp/hostile-tokenpath',
            PERSONA_SECRET: 'must-not-cross',
            NODE_TEST_CONTEXT: 'hostile-test-bypass',
            CSTAR_FORGE_TEST_MODE: '1',
            CSTAR_FORGE_RUNTIME_TEST_BYPASS: '1',
        }, {
            CSTAR_CODE_ROOT: PROJECT_ROOT,
            CSTAR_CONTROL_ROOT: PROJECT_ROOT,
            CSTAR_PROJECT_ROOT: PROJECT_ROOT,
            CSTAR_WORKSPACE_ROOT: PROJECT_ROOT,
        });

        assert.equal(env.HOME, '/home/operator');
        assert.equal(env.CODEX_HOME, '/home/operator/.codex');
        assert.equal(env.CSTAR_MCP_CALLER_THREAD_ID, 'thread-safe-id');
        assert.equal(env.CSTAR_MCP_CALLER_TRANSPORT, 'direct-stdio');
        assert.equal(env.CSTAR_CODE_ROOT, PROJECT_ROOT);
        assert.equal(env.CSTAR_CONTROL_ROOT, PROJECT_ROOT);
        assert.equal(env.CSTAR_PROJECT_ROOT, PROJECT_ROOT);
        assert.equal(env.CSTAR_WORKSPACE_ROOT, PROJECT_ROOT);
        assert.equal(env.CSTAR_KERNEL_MCP, '1');
        for (const key of [
            'NODE_OPTIONS', 'API_KEY', 'GOOGLE_API_KEY', 'CSTAR_MONGO_URI',
            'AUGURY_TOKEN_PATH_ROOT', 'PERSONA_SECRET',
            'NODE_TEST_CONTEXT', 'CSTAR_FORGE_TEST_MODE',
            'CSTAR_FORGE_RUNTIME_TEST_BYPASS',
        ]) {
            assert.equal(env[key], undefined, `${key} must not cross the kernel boundary`);
        }
    });

    it('removes every non-allowlisted key from an existing process environment object', () => {
        const target: NodeJS.ProcessEnv = {
            HOME: '/home/operator',
            PATH: '/usr/bin',
            PRIVATE_KEY: 'must-not-cross',
            ACCESS_TOKEN: 'must-not-cross',
            CODEX_THREAD_ID: 'ambient-host-thread',
        };
        neutralizeKernelMcpProcessEnv(target, {
            CSTAR_CODE_ROOT: PROJECT_ROOT,
            CSTAR_CONTROL_ROOT: PROJECT_ROOT,
            CSTAR_PROJECT_ROOT: PROJECT_ROOT,
            CSTAR_WORKSPACE_ROOT: PROJECT_ROOT,
        });
        assert.equal(target.PRIVATE_KEY, undefined);
        assert.equal(target.ACCESS_TOKEN, undefined);
        assert.equal(target.CODEX_THREAD_ID, '');
        assert.equal(target.CSTAR_CODE_ROOT, PROJECT_ROOT);
        assert.equal(target.CSTAR_CONTROL_ROOT, PROJECT_ROOT);
        assert.equal(target.CSTAR_PROJECT_ROOT, PROJECT_ROOT);
    });

    it('requires an existing private canonical control root and Hall store', () => {
        const control = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-control-root-'));
        fs.chmodSync(control, 0o700);
        const stats = path.join(control, '.stats');
        fs.mkdirSync(stats, { mode: 0o700 });
        const hall = path.join(stats, 'pennyone.db');
        fs.writeFileSync(hall, 'synthetic hall fixture', { mode: 0o600 });
        try {
            const roots = resolveKernelMcpLaunchRoots({
                codeRoot: PROJECT_ROOT,
                controlRoot: control,
            });
            assert.equal(roots.codeRoot, fs.realpathSync(PROJECT_ROOT));
            assert.equal(roots.controlRoot, control);
            assert.equal(roots.hallPath, hall);

            assert.throws(
                () => resolveKernelMcpLaunchRoots({ codeRoot: PROJECT_ROOT, controlRoot: undefined }),
                /kernel_control_root_missing/,
            );
            assert.throws(
                () => resolveKernelMcpLaunchRoots({ codeRoot: PROJECT_ROOT, controlRoot: 'relative' }),
                /kernel_control_root_not_absolute/,
            );

            fs.chmodSync(control, 0o777);
            assert.throws(
                () => resolveKernelMcpLaunchRoots({ codeRoot: PROJECT_ROOT, controlRoot: control }),
                /kernel_control_root_permissions_unsafe/,
            );
            fs.chmodSync(control, 0o700);

            const link = `${control}-link`;
            fs.symlinkSync(control, link);
            try {
                assert.throws(
                    () => resolveKernelMcpLaunchRoots({ codeRoot: PROJECT_ROOT, controlRoot: link }),
                    /kernel_control_root_symlink_forbidden|kernel_control_root_not_canonical/,
                );
            } finally {
                fs.rmSync(link, { force: true });
            }
        } finally {
            fs.rmSync(control, { recursive: true, force: true });
        }
    });

    it('constructs a no-secret Python warden environment and requires a bounded interpreter', () => {
        const env = buildWardenSubprocessEnv(PROJECT_ROOT);
        assert.deepEqual(Object.keys(env).sort(), [
            'PYTHONDONTWRITEBYTECODE', 'PYTHONHASHSEED', 'PYTHONNOUSERSITE', 'PYTHONPATH',
            ...(process.platform === 'linux' ? ['TEMP', 'TMP', 'TMPDIR'] : []),
        ].sort());
        assert.equal(env.PYTHONPATH, PROJECT_ROOT);

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-warden-python-'));
        const interpreter = process.platform === 'win32'
            ? path.join(root, '.venv', 'Scripts', 'python.exe')
            : path.join(root, '.venv', 'bin', 'python');
        fs.mkdirSync(path.dirname(interpreter), { recursive: true });
        fs.writeFileSync(interpreter, 'synthetic interpreter fixture', { mode: 0o700 });
        try {
            assert.equal(resolveWardenPython(root, { CSTAR_PYTHON_EXECUTABLE: interpreter }), interpreter);
            assert.throws(
                () => resolveWardenPython(root, { CSTAR_PYTHON_EXECUTABLE: 'python3' }),
                /cstar_warden_python_interpreter_outside_project_venv/,
            );
            const outside = path.join(root, 'python');
            fs.writeFileSync(outside, 'hostile interpreter fixture', { mode: 0o700 });
            assert.throws(
                () => resolveWardenPython(root, { CSTAR_PYTHON_EXECUTABLE: outside }),
                /cstar_warden_python_interpreter_outside_project_venv/,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps launcher and warden subprocess construction on exact environments', () => {
        const launcher = fs.readFileSync(path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js'), 'utf-8');
        const warden = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src', 'tools', 'cstar-kernel-mcp', 'tools', 'warden.ts'),
            'utf-8',
        );
        const kernel = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts'), 'utf-8');
        assert.match(launcher, /buildKernelMcpChildEnv\(process\.env/);
        assert.doesNotMatch(launcher, /\.\.\.process\.env/);
        assert.match(warden, /extendEnv:\s*false/);
        assert.match(warden, /path\.join\(CODE_ROOT, 'scripts', 'run_warden\.py'\)/);
        assert.match(warden, /buildWardenSubprocessEnv\(CODE_ROOT\)/);
        assert.match(warden, /path\.join\(root, '\.agents', 'tech_debt_ledger\.json'\)/);
        assert.doesNotMatch(warden, /env:\s*\{\s*\.\.\.process\.env/);
        assert.doesNotMatch(kernel, /dotenv|\.env['"]/);
    });

    it('rejects a symlinked bounty ledger before reading outside the project root', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-warden-ledger-'));
        const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.json`);
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        fs.writeFileSync(outside, JSON.stringify({ top_targets: ['must-not-be-read'] }));
        fs.symlinkSync(outside, path.join(root, '.agents', 'tech_debt_ledger.json'));
        const getRoot = mock.method(registry, 'getRoot', () => root);
        try {
            const result = await handleWarden({ action: 'bounties' });
            assert.equal(result.isError, true);
            assert.match(result.content[0].text, /path_symlink_forbidden/);
        } finally {
            getRoot.mock.restore();
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { force: true });
        }
    });
});
