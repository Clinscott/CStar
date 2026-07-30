import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MimirClient } from '../../src/core/mimir_client.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../src/core/host_delegation.js';

describe('retired TypeScript Mimir compatibility', () => {
    it('returns a stable no-effect error without invoking any dependency', async () => {
        let effects = 0;
        const forbidden = () => {
            effects += 1;
            throw new Error('must not run');
        };
        const client = new MimirClient({
            projectRoot: '/synthetic/repo',
            env: { SYNTHETIC_SECRET: 'must-not-be-read' },
            hostProvider: 'codex',
            hostSessionInvoker: forbidden,
            oracleInvoker: forbidden,
            hostExecRunner: forbidden,
        });
        const response = await client.request({
            prompt: 'synthetic only',
            correlation_id: 'synthetic-correlation',
            execution_surface: 'codex_exec_cli',
        });
        assert.equal(response.status, 'error');
        assert.equal(response.error, RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
        assert.deepEqual(response.trace, {
            correlation_id: 'synthetic-correlation',
            transport_mode: 'host_session',
        });
        assert.equal(effects, 0);
    });

    it('keeps convenience methods import-compatible and local', async () => {
        const client = new MimirClient();
        assert.equal(await client.think('synthetic'), null);
        assert.equal(await client.getFileIntent('/synthetic/file.ts'), null);
        const sampled = await client.sampleMind({ prompt: 'synthetic' });
        assert.equal(sampled.status, 'error');
        assert.equal(sampled.error, RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
        assert.equal(sampled.data.raw, null);
    });
});
