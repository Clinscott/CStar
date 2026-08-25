import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MimirClient } from '../../src/core/mimir_client.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../src/core/host_delegation.js';

describe('retired Mimir Synapse compatibility', () => {
    it('does not create or read a Synapse database', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-mimir-'));
        const dbPath = path.join(root, '.stats', 'synapse.db');
        let oracleCalls = 0;
        const response = await new MimirClient({
            projectRoot: root,
            dbPath,
            oracleInvoker: () => { oracleCalls += 1; },
        }).request({ prompt: 'synthetic only', transport_mode: 'synapse_db' });
        assert.equal(response.status, 'error');
        assert.equal(response.error, RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
        assert.equal(oracleCalls, 0);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });
});
