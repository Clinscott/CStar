import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    buildKernelMcpChildEnv,
    KERNEL_MCP_INACTIVE_HOST_ENV,
    KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS,
} from '../../bin/cstar-kernel-mcp-env.js';
import {
    detectHostProvider,
    isHostSessionActive,
    isInteractiveHostSession,
} from '../../src/core/host_session.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PROJECT_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
const PYTHON_EXECUTABLE = fs.existsSync(PROJECT_PYTHON)
    ? PROJECT_PYTHON
    : (process.env.PYTHON ?? 'python3');

describe('CStar MCP launcher environment', () => {
    it('scrubs passive Codex state and seeds inactive host authority sentinels', () => {
        const inherited = {
            GEMINI_CLI_ACTIVE: 'true',
            GEMINI_CLI: '1',
            GEMINI_CLI_SUBAGENTS: 'true',
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
            CODEX_SUBAGENTS: 'true',
            CODEX_CI: '1',
            CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'desktop',
            CODEX_MANAGED_BY_NPM: '1',
            CODEX_MANAGED_PACKAGE_ROOT: '/tmp/codex',
            CODEX_SQLITE_HOME: '/tmp/codex-state',
            CODEX_SANDBOX_NETWORK_DISABLED: '1',
            CORVUS_HOST_PROVIDER: 'codex',
            DROID_CLI_ACTIVE: 'true',
            CLAUDE_CLI_ACTIVE: 'true',
            CLAUDECODE: '1',
            CLAUDE_SUBAGENTS: 'true',
            AGENT_MODE: 'interactive',
            CORVUS_HOST_SESSION_ACTIVE: '1',
            CSTAR_KERNEL_MCP: '0',
            CSTAR_KERNEL_DISABLE_WATCH: '0',
            KEEP_ME: 'preserved',
        };

        const child = buildKernelMcpChildEnv(inherited, {
            CODEX_SHELL: '1',
            CSTAR_PROJECT_ROOT: '/tmp/cstar',
        });

        for (const [key, value] of Object.entries(KERNEL_MCP_INACTIVE_HOST_ENV)) {
            assert.equal(child[key], value, `${key} must be explicitly inactive`);
        }
        for (const key of KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS) {
            assert.equal(key in child, false, `${key} must be scrubbed`);
        }
        assert.equal(child.CSTAR_KERNEL_MCP, '1');
        assert.equal(child.CSTAR_KERNEL_DISABLE_WATCH, '1');
        assert.equal(child.CSTAR_PROJECT_ROOT, '/tmp/cstar');
        assert.equal(child.KEEP_ME, 'preserved');
        assert.equal(child.CODEX_SANDBOX_NETWORK_DISABLED, '1');
        assert.equal(detectHostProvider(child), null);
        assert.equal(isHostSessionActive(child), false);
        assert.equal(isInteractiveHostSession(child), false);
        assert.equal(inherited.CODEX_SHELL, '1', 'source environment must not be mutated');
    });

    it('does not load dotenv, mutate host state, or start the server on a library import', () => {
        const tsxLoader = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
        const entryUrl = pathToFileURL(path.join(PROJECT_ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts')).href;
        const probeScript = [
            `await import(${JSON.stringify(entryUrl)});`,
            `const keys = ${JSON.stringify(['GEMINI_CLI_ACTIVE', 'CODEX_CI', 'CORVUS_HOST_SESSION_ACTIVE', 'CSTAR_KERNEL_MCP'])};`,
            'const result = Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]));',
            "process.stdout.write('MCP_ENV_PROBE:' + JSON.stringify(result) + '\\n');",
        ].join('\n');
        const env = {
            ...process.env,
            CODEX_CI: 'preserve-import-state',
            CORVUS_HOST_SESSION_ACTIVE: '1',
        };
        delete env.GEMINI_CLI_ACTIVE;
        delete env.CSTAR_KERNEL_MCP;

        const probe = spawnSync(process.execPath, [
            '--import', tsxLoader,
            '--input-type=module',
            '--eval', probeScript,
        ], {
            cwd: PROJECT_ROOT,
            env,
            encoding: 'utf-8',
            timeout: 3000,
        });

        assert.equal(probe.error, undefined);
        assert.equal(probe.status, 0, probe.stderr);
        const line = probe.stdout.split('\n').find((entry) => entry.startsWith('MCP_ENV_PROBE:'));
        assert.ok(line, probe.stdout);
        const observed = JSON.parse(line.slice('MCP_ENV_PROBE:'.length)) as Record<string, string | null>;
        assert.deepEqual(observed, {
            GEMINI_CLI_ACTIVE: null,
            CODEX_CI: 'preserve-import-state',
            CORVUS_HOST_SESSION_ACTIVE: '1',
            CSTAR_KERNEL_MCP: null,
        });
    });

    it('re-neutralizes the actual launched TypeScript MCP child after dotenv', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-mcp-node-probe-'));
        const probeOutput = path.join(tempRoot, 'environment.json');
        const probeModule = path.join(tempRoot, 'capture-on-exit.mjs');
        const entryPath = path.join(PROJECT_ROOT, 'src', 'tools', 'cstar-kernel-mcp.ts');
        const tsxLoader = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
        const probeKeys = [
            ...Object.keys(KERNEL_MCP_INACTIVE_HOST_ENV),
            'CSTAR_KERNEL_MCP',
            'CSTAR_KERNEL_DISABLE_WATCH',
            ...KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS,
            'CODEX_SANDBOX_NETWORK_DISABLED',
        ];
        fs.writeFileSync(probeModule, [
            "import fs from 'node:fs';",
            "import path from 'node:path';",
            'if (path.resolve(process.argv[1] ?? "") === path.resolve(process.env.MCP_ENV_PROBE_ENTRY ?? "")) {',
            '  process.once("exit", () => {',
            '    const keys = JSON.parse(process.env.MCP_ENV_PROBE_KEYS);',
            '    const result = Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]));',
            '    fs.writeFileSync(process.env.MCP_ENV_PROBE_OUTPUT, JSON.stringify(result));',
            '  });',
            '}',
        ].join('\n'), 'utf-8');

        const env = {
            ...process.env,
            CSTAR_KERNEL_MCP: '0',
            CSTAR_KERNEL_DISABLE_WATCH: '0',
            GEMINI_CLI_SUBAGENTS: 'true',
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-launched-child',
            CODEX_SUBAGENTS: 'true',
            CODEX_CI: '1',
            CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'desktop',
            CODEX_MANAGED_BY_NPM: '1',
            CODEX_MANAGED_PACKAGE_ROOT: '/tmp/codex',
            CODEX_SQLITE_HOME: '/tmp/codex-state',
            CODEX_SANDBOX_NETWORK_DISABLED: '1',
            CLAUDE_SUBAGENTS: 'true',
            AGENT_MODE: 'interactive',
            CORVUS_HOST_SESSION_ACTIVE: '1',
            MCP_ENV_PROBE_ENTRY: entryPath,
            MCP_ENV_PROBE_KEYS: JSON.stringify(probeKeys),
            MCP_ENV_PROBE_OUTPUT: probeOutput,
        };
        delete env.GEMINI_CLI_ACTIVE;

        const child = spawn(process.execPath, [
            '--import', pathToFileURL(probeModule).href,
            '--import', tsxLoader,
            entryPath,
        ], {
            cwd: PROJECT_ROOT,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding('utf-8');
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });

        try {
            child.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'environment-probe', version: '1.0.0' },
                },
            }) + '\n');
            const startedAt = Date.now();
            while (!stdout.split('\n').some((line) => {
                try { return JSON.parse(line).id === 1; } catch { return false; }
            })) {
                assert.equal(child.exitCode, null, stderr);
                assert.ok(Date.now() - startedAt < 5000, `MCP initialize timed out: ${stderr}`);
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            const exitPromise = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
            child.kill('SIGTERM');
            const [exitCode] = await exitPromise;
            assert.equal(exitCode, 0, stderr);

            const observed = JSON.parse(fs.readFileSync(probeOutput, 'utf-8')) as Record<string, string | null>;
            for (const [key, value] of Object.entries(KERNEL_MCP_INACTIVE_HOST_ENV)) {
                assert.equal(observed[key], value, key);
            }
            for (const key of KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS) {
                assert.equal(observed[key], null, key);
            }
            assert.equal(observed.CSTAR_KERNEL_MCP, '1');
            assert.equal(observed.CSTAR_KERNEL_DISABLE_WATCH, '1');
            assert.equal(observed.CODEX_SANDBOX_NETWORK_DISABLED, '1');
        } finally {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('keeps Python dotenv/bootstrap and EnvAdapter headless', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-mcp-python-env-'));
        const activeDotenv = [
            'GEMINI_CLI_ACTIVE=true',
            'GEMINI_CLI=1',
            'GEMINI_CLI_SUBAGENTS=true',
            'CODEX_SHELL=1',
            'CODEX_THREAD_ID=dotenv-thread',
            'CODEX_SUBAGENTS=true',
            'CODEX_CI=1',
            'CODEX_INTERNAL_ORIGINATOR_OVERRIDE=desktop',
            'CODEX_MANAGED_BY_NPM=1',
            'CODEX_MANAGED_PACKAGE_ROOT=/tmp/codex',
            'CODEX_SQLITE_HOME=/tmp/codex-state',
            'CLAUDE_CLI_ACTIVE=true',
            'CLAUDECODE=1',
            'CLAUDE_SUBAGENTS=true',
            'DROID_CLI_ACTIVE=true',
            'CORVUS_HOST_PROVIDER=codex',
            'AGENT_MODE=interactive',
            'CORVUS_HOST_SESSION_ACTIVE=1',
        ].join('\n');
        fs.writeFileSync(path.join(tempRoot, '.env'), `${activeDotenv}\n`, 'utf-8');

        const pythonScript = [
            'import json, os',
            'from pathlib import Path',
            'from src.core.bootstrap import load_bootstrap_environment',
            'from src.core.engine.env_adapter import EnvAdapter',
            'from src.core.mcp_environment import KERNEL_MCP_INACTIVE_HOST_ENV, KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS',
            'load_bootstrap_environment(Path(os.environ["MCP_PROBE_ROOT"]))',
            'keys = list(KERNEL_MCP_INACTIVE_HOST_ENV) + list(KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS) + ["CODEX_SANDBOX_NETWORK_DISABLED"]',
            'print(json.dumps({"env": {key: os.environ.get(key) for key in keys}, "capability": EnvAdapter().capability.name}, sort_keys=True))',
        ].join('\n');
        const pythonEnv = { ...process.env, CSTAR_KERNEL_MCP: '1', MCP_PROBE_ROOT: tempRoot };
        for (const key of Object.keys(pythonEnv)) {
            if (key.startsWith('CODEX_') || key in KERNEL_MCP_INACTIVE_HOST_ENV) {
                delete pythonEnv[key];
            }
        }
        pythonEnv.CSTAR_KERNEL_MCP = '1';
        pythonEnv.MCP_PROBE_ROOT = tempRoot;
        pythonEnv.CODEX_SANDBOX_NETWORK_DISABLED = '1';

        try {
            const probe = spawnSync(PYTHON_EXECUTABLE, ['-c', pythonScript], {
                cwd: PROJECT_ROOT,
                env: pythonEnv,
                encoding: 'utf-8',
                timeout: 3000,
            });

            assert.equal(probe.error, undefined);
            assert.equal(probe.status, 0, probe.stderr);
            const observed = JSON.parse(probe.stdout.trim()) as {
                env: Record<string, string | null>;
                capability: string;
            };
            assert.equal(observed.capability, 'HEADLESS');
            for (const [key, value] of Object.entries(KERNEL_MCP_INACTIVE_HOST_ENV)) {
                assert.equal(observed.env[key], value, key);
            }
            for (const key of KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS) {
                assert.equal(observed.env[key], null, key);
            }
            assert.equal(observed.env.CODEX_SANDBOX_NETWORK_DISABLED, '1');
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('gives Python CORVUS_HOST_SESSION_ACTIVE=0 precedence over active host flags', () => {
        const script = [
            'from src.core.engine.env_adapter import EnvAdapter',
            'print(EnvAdapter().capability.name)',
        ].join('\n');
        const probe = spawnSync(PYTHON_EXECUTABLE, ['-c', script], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                CORVUS_HOST_SESSION_ACTIVE: '0',
                GEMINI_CLI_SUBAGENTS: 'true',
                CODEX_SUBAGENTS: 'true',
                CODEX_SHELL: '1',
                CODEX_THREAD_ID: 'active-thread',
                AGENT_MODE: 'interactive',
            },
            encoding: 'utf-8',
            timeout: 3000,
        });

        assert.equal(probe.error, undefined);
        assert.equal(probe.status, 0, probe.stderr);
        assert.equal(probe.stdout.trim(), 'HEADLESS');
    });

    for (const launcherPath of [
        'bin/cstar-kernel-mcp.js',
        'bin/cstar-kernel-mcp-bridge.js',
    ]) {
        it(`${launcherPath} uses the shared child-environment boundary`, () => {
            const source = fs.readFileSync(path.join(PROJECT_ROOT, launcherPath), 'utf-8');

            assert.match(source, /import \{ buildKernelMcpChildEnv \}/);
            assert.match(source, /env: buildKernelMcpChildEnv\(|const env = buildKernelMcpChildEnv\(/);
        });
    }

    it('retires the TCP daemon without importing or spawning the kernel', () => {
        const source = fs.readFileSync(
            path.join(PROJECT_ROOT, 'scripts/cstar-mcp-tcp-daemon.js'),
            'utf-8',
        );

        assert.match(source, /unauthenticated_tcp_transport_disabled/);
        assert.doesNotMatch(source, /buildKernelMcpChildEnv|spawn\(|createServer\(/);
    });
});
