import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    engraveReadyForReviewMemory,
    episodicMemoryDeps,
} from '../../../src/node/core/runtime/episodic_memory.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../../../src/node/core/runtime/reaper.js';


describe('retired ready-for-review receipt writer', () => {
    it('rejects before Hall, provider, Git, or dispatch effects', async () => {
        let dispatchCount = 0;
        assert.deepEqual(episodicMemoryDeps, { lifecycleAuthority: 'cstar-kernel' });
        await assert.rejects(
            () => engraveReadyForReviewMemory({
                bead_id: 'bead:synthetic',
                bead_intent: 'synthetic',
                project_root: '/synthetic',
                cwd: '/synthetic',
                context: {
                    mission_id: 'mission:synthetic',
                    trace_id: 'trace:synthetic',
                    persona: '',
                    workspace_root: '/synthetic',
                    operator_mode: 'subkernel',
                    target_domain: 'brain',
                    interactive: false,
                    env: {},
                    timestamp: 1,
                },
                dispatchPort: {
                    dispatch: async () => {
                        dispatchCount += 1;
                        throw new Error('must not dispatch');
                    },
                },
            }),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
        assert.equal(dispatchCount, 0);
    });
});
