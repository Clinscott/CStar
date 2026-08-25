import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    blackboardManagerDeps,
    BlackboardManager,
    RETIRED_BLACKBOARD_COMPACTION_FAILURE,
} from '../../../src/node/core/blackboard_manager.js';

describe('retired blackboard compaction compatibility', () => {
    it('returns a stable failure without state or provider access', async () => {
        let providerCalls = 0;
        const original = blackboardManagerDeps.requestHostText;
        blackboardManagerDeps.requestHostText = async () => {
            providerCalls += 1;
            throw new Error('must not run');
        };
        try {
            assert.deepEqual(await BlackboardManager.compact({ trigger: 'operator', source: 'tui' }), {
                status: 'FAILED',
                error: RETIRED_BLACKBOARD_COMPACTION_FAILURE,
            });
            assert.equal(providerCalls, 0);
            assert.equal(blackboardManagerDeps.stateRegistry, null);
            assert.equal(blackboardManagerDeps.registry, null);
        } finally {
            blackboardManagerDeps.requestHostText = original;
        }
    });

    it('does not create shared in-flight work or invoke callbacks concurrently', async () => {
        const results = await Promise.all([
            BlackboardManager.compact({ trigger: 'operator', source: 'tui' }),
            BlackboardManager.compact({ trigger: 'operator', source: 'tui' }),
        ]);
        assert.deepEqual(results, [
            { status: 'FAILED', error: RETIRED_BLACKBOARD_COMPACTION_FAILURE },
            { status: 'FAILED', error: RETIRED_BLACKBOARD_COMPACTION_FAILURE },
        ]);
    });
});
