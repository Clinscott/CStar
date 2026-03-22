import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { MimirClient } from  '../../src/core/mimir_client.js';

describe('TypeScript Mimir client bridge (CS-P1-02)', () => {
    it('uses a configured Gemini host bridge when the provider bridge is explicitly configured', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-gemini-configured-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const previousCommand = process.env.CORVUS_GEMINI_HOST_BRIDGE_CMD;
        const previousArgs = process.env.CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON;
        process.env.CORVUS_GEMINI_HOST_BRIDGE_CMD = 'gemini';
        process.env.CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON = JSON.stringify(['-p', '{prompt}', '--cwd', '{project_root}']);

        try {
            const client = new MimirClient({
                projectRoot: tmpRoot,
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
        } finally {
            if (previousCommand === undefined) {
                delete process.env.CORVUS_GEMINI_HOST_BRIDGE_CMD;
            } else {
                process.env.CORVUS_GEMINI_HOST_BRIDGE_CMD = previousCommand;
            }
            if (previousArgs === undefined) {
                delete process.env.CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON;
            } else {
                process.env.CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON = previousArgs;
            }
        }
    });

    it('returns a typed error when the built-in Gemini scaffold yields no output', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-host-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
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
                args: ['-p', 'Explain the current bridge.'],
                cwd: tmpRoot,
            },
        ]);
    });

    it('uses the structured Codex exec bridge when no host-session invoker is supplied', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-codex-default-'));
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const client = new MimirClient({
            projectRoot: tmpRoot,
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

    it('uses the synapse database contract and returns a completed response', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-db-'));
        const dbPath = path.join(tmpRoot, '.agents', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        const client = new MimirClient({
            projectRoot: tmpRoot,
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
