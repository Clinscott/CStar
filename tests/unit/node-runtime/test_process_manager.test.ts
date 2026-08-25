import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deps, OrchestratorProcessManager } from '../../../src/node/core/runtime/process_manager.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../../../src/node/core/runtime/reaper.js';


describe('retired Orchestrator Process Manager', () => {
    it('exposes no process or timer capability', () => {
        assert.deepEqual(deps, { processEffectsEnabled: false });
    });

    it('rejects process-group registration and removal', () => {
        const manager = new OrchestratorProcessManager();
        assert.throws(() => manager.registerGroup(123), { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR });
        assert.throws(() => manager.unregisterGroup(123), { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR });
    });

    it('rejects targeted and global reaping before signals', async () => {
        const manager = new OrchestratorProcessManager();
        await assert.rejects(() => manager.reapGroup(123), { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR });
        await assert.rejects(() => manager.reapAll(), { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR });
    });
});
