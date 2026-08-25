import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { HostWorkerWeave } from '../../src/node/core/runtime/weaves/host_worker.js';

describe('Host worker compatibility tombstone', () => {
    it('cannot delegate, infer, write, or run a checker', async () => {
        const delegateExecution = mock.fn(async () => {
            throw new Error('retired host worker delegated');
        });
        const writeFileSync = mock.fn(() => {
            throw new Error('retired host worker wrote');
        });
        const runner = mock.fn(async () => {
            throw new Error('retired host worker ran checker');
        });
        const weave = new HostWorkerWeave({ delegateExecution, writeFileSync, runner });

        const result = await weave.execute({
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-123', project_root: '/repo', cwd: '/repo' },
        }, {
            workspace_root: '/repo',
            env: {},
        } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /permanently decommissioned/i);
        assert.match(result.error ?? '', /cstar_forge_request/);
        assert.equal(delegateExecution.mock.callCount(), 0);
        assert.equal(writeFileSync.mock.callCount(), 0);
        assert.equal(runner.mock.callCount(), 0);
        assert.deepEqual(result.metadata, {
            adapter: 'compatibility:host-worker-rejected',
            bead_id: 'bead-123',
            delegated: false,
            inference_attempted: false,
            write_attempted: false,
            checker_attempted: false,
        });
    });
});
