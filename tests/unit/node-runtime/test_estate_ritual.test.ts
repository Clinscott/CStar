import assert from 'node:assert/strict';
import { it } from 'node:test';

import { EstateRitualWeave } from '../../../src/node/core/runtime/weaves/estate_ritual.js';
import { RETIRED_AUTONOMOUS_RUNTIME_FAILURE } from '../../../src/node/core/runtime/retired_adapter.js';

it('retires EstateRitual before bookmark-weaver or host-governor dispatch', async () => {
    let dispatches = 0;
    const ritual = new EstateRitualWeave({
        dispatch: async () => {
            dispatches += 1;
            throw new Error('synthetic dispatch must not run');
        },
    } as any);

    const result = await ritual.execute({
        weave_id: ritual.id,
        payload: { include_spokes: true, auto_execute: true, auto_replan_blocked: true },
    }, {
        workspace_root: '/synthetic/cstar',
        env: {},
    } as any);

    assert.equal(dispatches, 0);
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.error, RETIRED_AUTONOMOUS_RUNTIME_FAILURE);
    assert.equal(result.metadata?.execution_dispatched, false);
    assert.equal(result.metadata?.callback_started, false);
    assert.equal(result.metadata?.git_action_started, false);
});
