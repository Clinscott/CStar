import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../../../src/node/core/runtime/reaper.js';
import { OrchestratorScheduler } from '../../../src/node/core/runtime/scheduler.js';


describe('retired Orchestrator Scheduler', () => {
    it('rejects zombie reclamation before Hall mutation', async () => {
        await assert.rejects(
            () => new OrchestratorScheduler('/synthetic').reclaimZombies(),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });

    it('rejects autonomous batch selection before Hall access', async () => {
        await assert.rejects(
            () => new OrchestratorScheduler('/synthetic').getNextBatch(3),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });
});
