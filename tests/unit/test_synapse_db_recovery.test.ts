import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { ensureHealthySynapseDb } from '../../src/core/synapse_db.js';
import { MimirClient } from '../../src/core/mimir_client.js';

describe('Synapse DB recovery', () => {
    it('backs up and rebuilds a malformed synapse database', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-synapse-recovery-'));
        const dbPath = path.join(tmpRoot, '.agents', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, 'not a sqlite database', 'utf-8');

        const result = ensureHealthySynapseDb(dbPath);

        assert.equal(result.recovered, true);
        assert.ok(result.backupPath);
        assert.equal(fs.existsSync(result.backupPath ?? ''), true);

        const db = new Database(dbPath, { readonly: true });
        try {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='synapse'").all();
            assert.equal(tables.length, 1);
        } finally {
            db.close();
        }
    });

    it('lets Mimir continue after rebuilding a malformed synapse database', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-synapse-recovery-client-'));
        const dbPath = path.join(tmpRoot, '.agents', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, 'not a sqlite database', 'utf-8');

        const client = new MimirClient({
            projectRoot: tmpRoot,
            hostSessionActive: false,
            oracleInvoker: async (synapseId) => {
                const db = new Database(dbPath);
                try {
                    db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?')
                        .run('Recovered synapse response', 'COMPLETED', synapseId);
                } finally {
                    db.close();
                }
            },
        });

        const response = await client.request({
            prompt: 'Recover the synapse store.',
            caller: { source: 'test-suite' },
        });

        assert.equal(response.status, 'success');
        assert.equal(response.trace.transport_mode, 'synapse_db');
        assert.equal(response.raw_text, 'Recovered synapse response');
    });
});
