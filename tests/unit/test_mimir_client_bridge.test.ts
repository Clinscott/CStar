import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { MimirClient } from '../../src/core/mimir_client.ts';

describe('TypeScript Mimir client bridge (CS-P1-02)', () => {
    it('uses the host-session contract when the host is active', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mimir-host-'));
        const client = new MimirClient({
            projectRoot: tmpRoot,
            hostSessionActive: true,
        });

        const response = await client.request({
            prompt: 'Explain the current bridge.',
            system_prompt: 'Respond in one sentence.',
            caller: { source: 'test-suite' },
        });

        assert.strictEqual(response.status, 'success');
        assert.strictEqual(response.trace.transport_mode, 'host_session');
        assert.match(response.raw_text ?? '', /\[SAMPLING_REQUEST\]/);
        assert.match(response.raw_text ?? '', /SYSTEM:/);
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
