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

function trackedAutomationNames(): string[] {
    return AUTOMATION_DIRS.flatMap((directory) => (
        fs.existsSync(directory)
            ? fs.readdirSync(directory).map((name) => path.relative(ROOT, path.join(directory, name)))
            : []
    ));
}

describe('Gemini CLI retirement invariant', () => {
    it('keeps Gemini CLI commands and workflows absent', () => {
        const legacyAutomation = trackedAutomationNames()
            .filter((name) => /(^|\/)gemini[^/]*\.(toml|ya?ml)$/i.test(name))
            .sort();

        assert.deepEqual(legacyAutomation, []);
    });

    it('makes legacy CLI markers inert while preserving an explicit Gemini bridge provider', () => {
        for (const env of [{ GEMINI_CLI_ACTIVE: 'true' }, { GEMINI_CLI: '1' }]) {
            assert.equal(detectHostProvider(env), null);
            assert.equal(resolveHostProvider(env), null);
            assert.equal(isHostSessionActive(env), false);
        }

        assert.equal(resolveHostProvider({ CORVUS_HOST_PROVIDER: 'gemini' }), 'gemini');
        assert.equal(isHostSessionActive({ CORVUS_HOST_PROVIDER: 'gemini' }), true);
        assert.equal(getHostProviderBanner('gemini'), ' ◤ GEMINI BRIDGE INTEGRATION ACTIVE ◢ ');
        assert.equal(parseOracleProvider('gemini'), 'gemini');
    });

    it('uses only an explicitly configured bridge for Gemini host requests', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-gemini-bridge-'));
        const calls: Array<{ command: string; args: string[] }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {
                CORVUS_HOST_PROVIDER: 'gemini',
                CORVUS_GEMINI_HOST_BRIDGE_CMD: 'gemini-api-bridge',
                CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON: JSON.stringify(['--prompt', '{prompt}']),
                CORVUS_DISABLE_LOCAL_LLM_FALLBACK: '1',
            },
            hostSessionActive: true,
            hostExecRunner: async (command, args) => {
                calls.push({ command, args });
                return { stdout: 'Gemini API bridge response', stderr: '' };
            },
        });

        try {
            const response = await client.request({
                prompt: 'Use the configured Gemini bridge.',
                transport_mode: 'host_session',
                caller: { source: 'test:gemini-cli-retirement' },
            });

            assert.equal(response.status, 'success');
            assert.equal(response.raw_text, 'Gemini API bridge response');
            assert.deepEqual(calls, [{
                command: 'gemini-api-bridge',
                args: ['--prompt', 'Use the configured Gemini bridge.'],
            }]);
            assert.doesNotMatch(calls[0]?.command ?? '', /^(?:gemini|agy)$/i);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('fails closed without spawning Gemini CLI when no bridge is configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-gemini-no-cli-'));
        let execCalls = 0;
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {
                CORVUS_HOST_PROVIDER: 'gemini',
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
                prompt: 'Do not invoke Gemini CLI.',
                transport_mode: 'host_session',
                caller: { source: 'test:gemini-cli-retirement' },
            });

            assert.equal(response.status, 'error');
            assert.match(response.error ?? '', /does not have an executable host-session bridge configured/i);
            assert.equal(execCalls, 0);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('keeps CLI-only markers from enabling delegated execution', async () => {
        let execCalls = 0;

        await assert.rejects(
            requestHostDelegatedExecution(
                {
                    request_id: 'gemini-cli-retired-1',
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

    it('does not forbid non-CLI Gemini SDK or credential surfaces', () => {
        const feature = fs.readFileSync(
            path.join(ROOT, 'tests/features/gemini_cli_retirement.feature'),
            'utf8',
        );

        assert.match(feature, /Gemini API and SDK capability is not part of the CLI retirement/);
        assert.match(feature, /credentials must not be removed merely because they are Gemini credentials/);
    });
});
