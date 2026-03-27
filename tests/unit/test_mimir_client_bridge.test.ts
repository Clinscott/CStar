import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';
import { MimirClient } from  '../../src/core/mimir_client.js';
import { listHallOneMindRequests, saveHallOneMindBroker } from '../../src/tools/pennyone/intel/database.js';

describe('TypeScript Mimir client bridge (CS-P1-02)', () => {
    it('uses a configured Gemini host bridge when the provider bridge is explicitly configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-gemini-configured-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {
                CORVUS_GEMINI_HOST_BRIDGE_CMD: 'gemini',
                CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON: JSON.stringify(['-p', '{prompt}', '--cwd', '{project_root}']),
            },
            hostSessionActive: true,
            hostProvider: 'gemini',
            hostExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                return { stdout: 'Gemini host response', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Gemini host response');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0]?.command, 'gemini');
        assert.deepStrictEqual(calls[0]?.args, ['-p', 'Explain the current bridge.', '--cwd', tmpRoot]);
        assert.strictEqual(calls[0]?.cwd, tmpRoot);
    });

    it('uses a configured Codex host bridge when the provider bridge is explicitly configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-configured-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {
                CORVUS_CODEX_HOST_BRIDGE_CMD: 'codex-host-bridge',
                CORVUS_CODEX_HOST_BRIDGE_ARGS_JSON: JSON.stringify(['--prompt', '{prompt}', '--project-root', '{project_root}']),
            },
            hostSessionActive: true,
            hostProvider: 'codex',
            hostExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                return { stdout: 'Configured Codex bridge response', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the configured Codex bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Configured Codex bridge response');
        assert.deepStrictEqual(calls, [
            {
                command: 'codex-host-bridge',
                args: ['--prompt', 'Explain the configured Codex bridge.', '--project-root', tmpRoot],
                cwd: tmpRoot,
            },
        ]);
    });

    it('returns a typed error when the built-in Gemini scaffold yields no output', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-host-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CORVUS_DISABLE_LOCAL_LLM_FALLBACK: '1' },
            hostSessionActive: true,
            hostProvider: 'gemini',
            hostExecRunner: async () => ({ stdout: '', stderr: '' }),
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            system_prompt: 'Respond in one sentence.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'error');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.match(response.error ?? '', /gemini returned no output/i);
    });

    it('uses the Codex host runner when the active provider is codex', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-'));
        const prompts: Array<{ provider: string; prompt: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {},
            hostSessionActive: true,
            hostProvider: 'codex',
            hostSessionInvoker: async (prompt, provider) => {
                prompts.push({ provider, prompt });
                return 'Codex host response';
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Codex host response');
        assert.deepStrictEqual(prompts, [{ provider: 'codex', prompt: 'Explain the current bridge.' }]);
    });

    it('uses the built-in Claude CLI scaffold when no explicit bridge is configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-claude-default-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {},
            hostSessionActive: true,
            hostProvider: 'claude',
            hostExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                return { stdout: 'Claude host response', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Claude host response');
        assert.deepStrictEqual(calls, [
            {
                command: 'claude',
                args: ['-p', 'Explain the current bridge.'],
                cwd: tmpRoot,
            },
        ]);
    });

    it('uses the built-in Gemini CLI scaffold when no explicit bridge is configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-gemini-default-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {},
            hostSessionActive: true,
            hostProvider: 'gemini',
            hostExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                return { stdout: 'Gemini host response', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Gemini host response');
        assert.deepStrictEqual(calls, [
            {
                command: 'gemini',
                args: ['--approval-mode', 'plan', '-p', 'Explain the current bridge.'],
                cwd: tmpRoot,
            },
        ]);
    });

    it('uses the structured Codex exec bridge when no host-session invoker is supplied', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-default-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {},
            hostSessionActive: true,
            hostProvider: 'codex',
            codexExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                const outputIndex = args.indexOf('--output-last-message');
                assert.ok(outputIndex >= 0);
                const outputPath = args[outputIndex + 1];
                assert.ok(outputPath);
                fs.writeFileSync(outputPath, 'Codex host response', 'utf-8');
                return { stdout: 'noisy stdout', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Codex host response');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0]?.command, 'codex');
        assert.ok(calls[0]?.args.includes('--skip-git-repo-check'));
        assert.ok(calls[0]?.args.includes('--cd'));
        assert.ok(calls[0]?.args.includes(tmpRoot));
        assert.ok(calls[0]?.args.includes('-c'));
        assert.ok(calls[0]?.args.includes('model_reasoning_effort="low"'));
    });

    it('returns a typed host-session timeout when Codex stalls', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-timeout-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CORVUS_DISABLE_LOCAL_LLM_FALLBACK: '1' },
            hostSessionActive: true,
            hostProvider: 'codex',
            hostSessionTimeoutMs: 5,
            codexExecRunner: async (_command, _args, options) =>
                await new Promise((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        const error = new Error('aborted');
                        error.name = 'AbortError';
                        reject(error);
                    });
                }),
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'error');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.match(response.error ?? '', /timed out after 5ms/i);
    });

    it('prefers direct host-session transport in auto mode when running inside an interactive Codex session without a broker', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-auto-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            hostSessionInvoker: async () => {
                return 'Codex interactive direct response';
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Codex interactive direct response');
    });

    it('prefers synapse_db in auto mode when running inside an interactive Codex session with an explicit broker', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-auto-broker-'));
        const dbPath = path.join(tmpRoot, '.agents', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const now = Date.now();
        saveHallOneMindBroker({
            repo_id: buildHallRepositoryId(normalizeHallPath(tmpRoot)),
            status: 'READY',
            binding_state: 'BOUND',
            fulfillment_ready: true,
            provider: 'codex',
            session_id: 'thread-1',
            control_plane: 'hall',
            metadata: { source: 'unit-test' },
            created_at: now,
            updated_at: now,
        }, tmpRoot);

        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            oracleInvoker: async (synapseId) => {
                const db = new Database(dbPath);
                try {
                    db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?')
                        .run('Codex interactive synapse response', 'COMPLETED', synapseId);
                } finally {
                    db.close();
                }
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'synapse_db');
        assert.strictEqual(response.raw_text, 'Codex interactive synapse response');
        const hallRequests = listHallOneMindRequests(tmpRoot);
        assert.strictEqual(hallRequests[0]?.request_status, 'COMPLETED');
        assert.strictEqual(hallRequests[0]?.metadata?.synapse_id !== undefined, true);
    });

    it('uses the env-detected Codex provider before the Gemini fallback when hostSessionActive is true', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-detected-'));
        const prompts: Array<{ provider: string; prompt: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            hostSessionActive: true,
            hostSessionInvoker: async (prompt, provider) => {
                prompts.push({ provider, prompt });
                return 'Codex detected response';
            },
        });

        const response = await client.request({
            prompt: 'Explain the detected bridge.',
            transport_mode: 'host_session',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.deepStrictEqual(prompts, [{ provider: 'codex', prompt: 'Explain the detected bridge.' }]);
    });

    it('uses codex exec as the host CLI inference surface inside an interactive Codex session without a broker', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-interactive-guard-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1', CORVUS_DISABLE_LOCAL_LLM_FALLBACK: '1' },
            hostSessionActive: true,
            hostProvider: 'codex',
            codexExecRunner: async (command, args, options) => {
                calls.push({ command, args, cwd: options.cwd });
                const outputIndex = args.indexOf('--output-last-message');
                const outputPath = args[outputIndex + 1];
                fs.writeFileSync(outputPath, 'Codex interactive exec response', 'utf-8');
                return { stdout: '', stderr: '' };
            },
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.strictEqual(response.raw_text, 'Codex interactive exec response');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0]?.command, 'codex');
    });

    it('uses the synapse database contract and returns a completed response', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-db-'));
        const dbPath = path.join(tmpRoot, '.agents', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        const client = new MimirClient({
            projectRoot: tmpRoot,
            env: {},
            hostSessionActive: false,
            oracleInvoker: async (synapseId) => {
                const db = new Database(dbPath);
                try {
                    const row = db
                        .prepare('SELECT prompt FROM synapse WHERE id = ?')
                        .get(synapseId) as { prompt: string } | undefined;
                    assert.ok(row);
                    db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?')
                        .run(`Completed: ${row.prompt}`, 'COMPLETED', synapseId);
                } finally {
                    db.close();
                }
            },
        });

        const response = await client.request({
            prompt: 'Trace the hall.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'synapse_db');
        assert.strictEqual(response.trace.cached, false);
        assert.strictEqual(response.raw_text, 'Completed: Trace the hall.');
    });
});
