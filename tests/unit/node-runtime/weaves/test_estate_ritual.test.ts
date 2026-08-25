import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { EstateRitualWeave } from '../../../../src/node/core/runtime/weaves/estate_ritual.js';

describe('Estate ritual compatibility tombstone', () => {
    it('cannot pull repositories, ingest, or auto-execute', async () => {
        const dispatch = mock.fn(async () => {
            throw new Error('retired ritual attempted downstream dispatch');
        });
        const result = await new EstateRitualWeave({ dispatch } as any).execute({
            weave_id: 'weave:estate-ritual',
            payload: { include_spokes: true, auto_execute: true },
        }, {
            workspace_root: '/tmp/cstar-estate-ritual',
            env: {},
        } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /permanently decommissioned/i);
        assert.equal(dispatch.mock.callCount(), 0);
        assert.deepEqual(result.metadata, {
            adapter: 'compatibility:estate-ritual-rejected',
            execution_attempted: false,
            git_update_attempted: false,
            ingestion_attempted: false,
        });
    });
});
