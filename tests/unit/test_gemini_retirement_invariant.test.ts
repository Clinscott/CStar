import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { requestHostDelegatedExecution } from '../../src/core/host_delegation.js';
import {
    detectHostProvider,
    getHostProviderBanner,
    isHostSessionActive,
    resolveHostProvider,
} from '../../src/core/host_session.js';
import { MimirClient } from '../../src/core/mimir_client.js';
import { parseOracleProvider } from '../../src/node/core/commands/oracle.js';

const ROOT = process.cwd();
const AUTOMATION_DIRS = [
    path.join(ROOT, '.github', 'commands'),
    path.join(ROOT, '.github', 'workflows'),
];
const RETIRED_RUNTIME_FILES = [
    'src/core/host_delegation.ts',
    'src/core/engine/injector.py',
    'src/core/engine/orchestrator.py',
    'src/core/host_session.py',
    'src/core/host_session.ts',
    'src/core/mimir_client.py',
    'src/core/mimir_client.ts',
    'src/games/odin_protocol/engine/gm_client.py',
    'src/node/core/commands/oracle.ts',
    'src/node/core/one_mind_broker/fulfillment.ts',
    'src/node/core/runtime/dispatcher.ts',
    'src/node/core/runtime/host_workflows/research.ts',
    'src/node/core/state.ts',
];
const ZERO_RETIRED_INGRESS_FILES = [
    '.agents/state/terminal.json',
    '.mcp.json',
    'plugins/corvus-star/.mcp.json',
    'src/core/bootstrap.py',
    'src/core/engine/env_adapter.py',
];
const RETIRED_MODEL_DIAGNOSTICS = [
    'scripts/test_adc.js',
    'src/tools/debug/check_pro.py',
    'src/tools/list_models.py',
    'tests/empire_tests/specs/check_pro.qmd',
    'tests/empire_tests/test_check_pro_empire.py',
];
const RETIRED_KEY_PROPAGATION_FILES = [
    'src/core/engine/wardens/huginn.py',
    'src/core/engine/wardens/shadow_forge.py',
    'src/tools/debug/verify_fish.py',
];

function trackedAutomationNames(): string[] {
    return AUTOMATION_DIRS.flatMap((directory) => (
        fs.existsSync(directory)
            ? fs.readdirSync(directory).map((name) => path.relative(ROOT, path.join(directory, name)))
            : []
    ));
}

describe('Gemini retirement invariant', () => {
    it('keeps retired Gemini commands and workflows absent', () => {
        const legacyAutomation = trackedAutomationNames()
            .filter((name) => /(^|\/)gemini[^/]*\.(toml|ya?ml)$/i.test(name))
            .sort();

        assert.deepEqual(legacyAutomation, []);
    });

    it('makes legacy markers and a retired provider override inert', () => {
        const retiredEnvironments = [
            { GEMINI_CLI_ACTIVE: 'true' },
            { GEMINI_CLI: '1' },
            { CORVUS_HOST_PROVIDER: 'gemini' },
            { CORVUS_HOST_SESSION_ACTIVE: 'true' },
        ];

        for (const env of retiredEnvironments) {
            assert.equal(detectHostProvider(env), null);
            assert.equal(resolveHostProvider(env), null);
            assert.equal(isHostSessionActive(env), false);
        }
        assert.equal(getHostProviderBanner(null), ' ◤ HOST INTEGRATION INACTIVE ◢ ');
        assert.throws(() => parseOracleProvider('gemini'), /Expected one of codex, claude/i);
    });

    it('preserves positively identified current providers', () => {
        assert.equal(resolveHostProvider({ CODEX_SHELL: '1', GEMINI_CLI_ACTIVE: 'true' }), 'codex');
        assert.equal(resolveHostProvider({ CORVUS_HOST_PROVIDER: 'claude' }), 'claude');
        assert.equal(resolveHostProvider({ DROID_CLI_ACTIVE: 'true' }), 'droid');
    });

    it('returns a typed error without spawning when only retired host state exists', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-host-'));
        let execCalls = 0;
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {
                CORVUS_HOST_PROVIDER: 'gemini',
                CORVUS_HOST_SESSION_ACTIVE: 'true',
                CORVUS_DISABLE_LOCAL_LLM_FALLBACK: '1',
            },
            hostSessionActive: true,
            hostExecRunner: async () => {
                execCalls += 1;
                return { stdout: 'unexpected', stderr: '' };
            },
        });

        try {
            const response = await client.request({
                prompt: 'Do not execute a retired provider.',
                transport_mode: 'host_session',
                caller: { source: 'test:gemini-retirement' },
            });

            assert.equal(response.status, 'error');
            assert.match(response.error ?? '', /retired or unsupported/i);
            assert.equal(execCalls, 0);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('does not block an explicitly selected Synapse transport', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-host-synapse-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CORVUS_HOST_PROVIDER: 'gemini' },
            hostSessionActive: true,
            oracleInvoker: async () => undefined,
            pollAttempts: 1,
            pollIntervalMs: 0,
        });

        try {
            const response = await client.request({
                prompt: 'Use the deterministic database transport.',
                transport_mode: 'synapse_db',
                caller: { source: 'test:gemini-retirement' },
            });

            assert.notEqual(response.trace.transport_mode, 'host_session');
            assert.doesNotMatch(response.error ?? '', /retired or unsupported/i);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('rejects retired delegated execution before spawning', async () => {
        let execCalls = 0;

        await assert.rejects(
            requestHostDelegatedExecution(
                {
                    request_id: 'retired-provider-1',
                    repo_root: ROOT,
                    boundary: 'subagent',
                    task_kind: 'research',
                    prompt: 'Do not execute.',
                },
                { GEMINI_CLI_ACTIVE: 'true' },
                {
                    execRunner: async () => {
                        execCalls += 1;
                        return { stdout: 'unexpected', stderr: '' };
                    },
                },
            ),
            /Host Agent session inactive/i,
        );
        assert.equal(execCalls, 0);
    });

    it('keeps the active runtime free of retired provider execution text', () => {
        for (const relativePath of RETIRED_RUNTIME_FILES) {
            const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
            assert.doesNotMatch(content, /gemini|antigravity|\bagy\b|google[-_ ]?(genai|generative)/i);
        }
        assert.equal(fs.existsSync(path.join(ROOT, 'src/core/mimir_client.js')), false);
        assert.equal(fs.existsSync(path.join(ROOT, 'src/tools/gemini_search.py')), false);
    });

    it('keeps repository launch and environment ingress free of retired provider activation', () => {
        for (const relativePath of ZERO_RETIRED_INGRESS_FILES) {
            const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
            assert.doesNotMatch(content, /gemini|antigravity|\bagy\b|google[-_. ]?(genai|generative)/i);
        }

        const bootstrapContent = fs.readFileSync(path.join(ROOT, 'scripts/env_bootstrap.ts'), 'utf8');
        assert.match(bootstrapContent, /RETIRED_ENV_KEYS/);
        assert.doesNotMatch(bootstrapContent, /['"]GEMINI_CLI_ACTIVE['"]\s*:\s*['"]true['"]/);
    });

    it('keeps standalone model diagnostics and the direct Node SDK absent', () => {
        for (const relativePath of RETIRED_MODEL_DIAGNOSTICS) {
            assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false);
        }

        const packageManifest = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string> };
        assert.equal(packageManifest.dependencies?.['@google/genai'], undefined);

        const packageLock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
        assert.doesNotMatch(packageLock, /@google\/genai/);

        const sharedFixtures = fs.readFileSync(path.join(ROOT, 'tests/conftest.py'), 'utf8');
        const personaTests = fs.readFileSync(
            path.join(ROOT, 'tests/empire_tests/test_contextual_persona.py'),
            'utf8',
        );
        const testManifest = fs.readFileSync(path.join(ROOT, 'tests/all_tests.txt'), 'utf8');
        assert.doesNotMatch(sharedFixtures, /mock_genai_client/);
        assert.doesNotMatch(personaTests, /check_pro\.py/);
        assert.doesNotMatch(testManifest, /test_check_pro_empire\.py/);
    });

    it('keeps retired model credentials out of active wardens and diagnostics', () => {
        for (const relativePath of RETIRED_KEY_PROPAGATION_FILES) {
            const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
            assert.doesNotMatch(
                content,
                /\b(?:GOOGLE|GEMINI|MUNINN)_API_KEY\b|google\.generativeai/i,
            );
        }

        const shadowForge = fs.readFileSync(
            path.join(ROOT, 'src/core/engine/wardens/shadow_forge.py'),
            'utf8',
        );
        assert.doesNotMatch(shadowForge, /\b[A-Z][A-Z0-9_]*_API_KEY\b/);
    });
});
