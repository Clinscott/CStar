import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HostWorkerWeave } from '../../src/node/core/runtime/weaves/host_worker.js';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.js';

function createContext(): RuntimeContext {
    return {
        mission_id: 'mission-host-worker-retired',
        bead_id: 'bead-123',
        trace_id: 'trace-host-worker-retired',
        workspace_root: '/repo',
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        timestamp: Date.now(),
    };
}

describe('retired HostWorker compatibility boundary', () => {
    it('requires durable Forge without touching providers, files, or runners', async () => {
        let sideEffects = 0;
        const forbidden = () => {
            sideEffects += 1;
            throw new Error('retired HostWorker consumed a forbidden dependency');
        };
        const weave = new HostWorkerWeave({
            getBeads: forbidden,
            delegateExecution: forbidden,
            createMimirClient: forbidden,
            existsSync: forbidden,
            readFileSync: forbidden,
            mkdirSync: forbidden,
            writeFileSync: forbidden,
            runner: forbidden,
        });

        const result = await weave.execute({
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-123', project_root: '/repo', cwd: '/repo' },
        }, createContext());

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /^forge_request_required:/);
        assert.equal(result.metadata?.execution_boundary, 'cstar_forge_request');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.provider, null);
        assert.equal(sideEffects, 0);
    });
});
