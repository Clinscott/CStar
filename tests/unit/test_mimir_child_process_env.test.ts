import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sanitizeChildProcessEnv } from '../../src/core/child_process_env.js';
import { MimirClient } from '../../src/core/mimir_client.js';

const RETIRED_KEYS = new Set([
    'GEMINI_API_KEY',
    'GEMINI_CLI',
    'GEMINI_CLI_ACTIVE',
    'GEMINI_CLI_SUBAGENTS',
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_API_DAEMON_KEY',
    'GOOGLE_GENAI_ACCESS_TOKEN',
    'GOOGLE_GENAI_API_KEY',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'GOOGLE_GEMINI_API_KEY',
    'GOOGLE_GEMINI_SESSION_TOKEN',
    'MUNINN_API_KEY',
]);
const PRESERVED_ENV: NodeJS.ProcessEnv = {
    PATH: '/test/bin',
    CODEX_SHELL: '1',
    CODEX_THREAD_ID: 'thread-test',
    CLAUDE_SUBAGENTS: 'true',
    DROID_CLI_ACTIVE: 'true',
    OPENAI_API_KEY: 'preserved-openai',
    ANTHROPIC_API_KEY: 'preserved-anthropic',
    MINIMAX_API_KEY: 'preserved-minimax',
    XPREMIUM_OAUTH_STATE: 'preserved-xpremium',
    HERMES_PROFILE: 'preserved-hermes',
    GOOGLE_CLOUD_PROJECT: 'preserved-google-project',
};
const MIXED_CASE_RETIRED_ENV: NodeJS.ProcessEnv = {
    gemini_api_key: 'retired-1',
    Gemini_Cli: 'retired-2',
    gEmInI_cLi_AcTiVe: 'retired-3',
    GEMINI_cli_SUBAGENTS: 'retired-4',
    google_api_key: 'retired-5',
    Google_Application_Credentials: 'retired-6',
    GOOGLE_api_DAEMON_KEY: 'retired-7',
    muninn_api_key: 'retired-8',
    GoOgLe_GeNaI_ApI_kEy: 'retired-9',
    google_genai_access_token: 'retired-10',
    gOoGlE_gEnAi_UsE_vErTeXaI: 'retired-11',
    Google_Gemini_Api_Key: 'retired-12',
    GOOGLE_gemini_session_token: 'retired-13',
};
const TEMP_ROOTS: string[] = [];

afterEach(() => {
    while (TEMP_ROOTS.length > 0) {
        fs.rmSync(TEMP_ROOTS.pop()!, { recursive: true, force: true });
    }
});

function makeTempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    TEMP_ROOTS.push(root);
    return root;
}

function contractEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
        ...PRESERVED_ENV,
        ...MIXED_CASE_RETIRED_ENV,
        ...overrides,
    };
}

function assertChildEnv(childEnv: NodeJS.ProcessEnv): void {
    assert.equal(
        Object.keys(childEnv).some((key) => RETIRED_KEYS.has(key.toUpperCase())),
        false,
    );
    for (const [key, value] of Object.entries(PRESERVED_ENV)) {
        assert.equal(childEnv[key], value);
    }
}

describe('Mimir child-process environment boundary', () => {
    it('sanitizes case-insensitively without mutating the input or process environment', () => {
        const sourceEnv = contractEnv();
        const sourceSnapshot = { ...sourceEnv };
        const processSnapshot = { ...process.env };

        const childEnv = sanitizeChildProcessEnv(sourceEnv);

        assertChildEnv(childEnv);
        assert.notStrictEqual(childEnv, sourceEnv);
        assert.deepStrictEqual(sourceEnv, sourceSnapshot);
        assert.deepStrictEqual({ ...process.env }, processSnapshot);
    });

    it('sanitizes configured bridge child environments', async () => {
        const tmpRoot = makeTempRoot('cstar-mimir-env-configured-');
        const sourceEnv = contractEnv({
            CORVUS_CODEX_HOST_BRIDGE_CMD: 'codex-host-bridge',
            CORVUS_CODEX_HOST_BRIDGE_ARGS_JSON: '["--prompt", "{prompt}"]',
        });
        const sourceSnapshot = { ...sourceEnv };
        const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: sourceEnv,
            hostSessionActive: true,
            hostProvider: 'codex',
            hostExecRunner: async (command, args, options) => {
                calls.push({ command, args, env: options.env });
                return { stdout: 'configured response', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'configured request',
            transport_mode: 'host_session',
            caller: { source: 'test:mimir-child-env' },
        });

        assert.equal(response.status, 'success');
        assert.equal(calls[0]?.command, 'codex-host-bridge');
        assert.deepStrictEqual(calls[0]?.args, ['--prompt', 'configured request']);
        assertChildEnv(calls[0]?.env ?? {});
        assert.deepStrictEqual(sourceEnv, sourceSnapshot);
    });

    for (const provider of ['codex', 'claude'] as const) {
        it(`sanitizes the built-in ${provider} child environment`, async () => {
            const tmpRoot = makeTempRoot(`cstar-mimir-env-${provider}-`);
            const sourceEnv = contractEnv();
            const sourceSnapshot = { ...sourceEnv };
            const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
            const client = new MimirClient({
                projectRoot: tmpRoot,
                env: sourceEnv,
                hostSessionActive: true,
                hostProvider: provider,
                hostExecRunner: async (command, args, options) => {
                    calls.push({ command, args, env: options.env });
                    if (provider === 'codex') {
                        const outputIndex = args.indexOf('--output-last-message');
                        assert.ok(outputIndex >= 0);
                        fs.writeFileSync(args[outputIndex + 1], 'codex response', 'utf-8');
                        return { stdout: '', stderr: '' };
                    }
                    return { stdout: 'claude response', stderr: '' };
                },
            });

            const response = await client.request({
                prompt: 'built-in request',
                transport_mode: 'host_session',
                caller: { source: 'test:mimir-child-env' },
            });

            assert.equal(response.status, 'success');
            assert.equal(calls[0]?.command, provider);
            assertChildEnv(calls[0]?.env ?? {});
            assert.deepStrictEqual(sourceEnv, sourceSnapshot);
        });
    }

    it('sanitizes the Oracle child environment from the injected client environment', async () => {
        const tmpRoot = makeTempRoot('cstar-mimir-env-oracle-');
        const sourceEnv = contractEnv({ CORVUS_HOST_SESSION_ACTIVE: 'false' });
        const sourceSnapshot = { ...sourceEnv };
        const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: sourceEnv,
            hostSessionActive: false,
            pollAttempts: 1,
            pollIntervalMs: 0,
            oracleExecRunner: async (command, args, options) => {
                calls.push({ command, args, env: options.env });
                return { stdout: '', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'oracle request',
            transport_mode: 'synapse_db',
            caller: { source: 'test:mimir-child-env' },
        });

        assert.equal(response.status, 'error');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.command, process.execPath);
        assert.match(calls[0]?.args.join(' ') ?? '', /oracle \d+ --db --silent/);
        assertChildEnv(calls[0]?.env ?? {});
        assert.equal(calls[0]?.env.CORVUS_HOST_SESSION_ACTIVE, 'false');
        assert.deepStrictEqual(sourceEnv, sourceSnapshot);
    });
});
