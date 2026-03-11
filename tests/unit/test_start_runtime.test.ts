import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ANS } from '../../src/node/core/ans.ts';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.ts';
import { StartAdapter } from '../../src/node/core/runtime/adapters.ts';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-START',
        trace_id: 'TRACE-START',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Start runtime adapter (CS-P4-01)', () => {
    it('rejects target-driven start execution as non-canonical', async () => {
        const adapter = new StartAdapter();

        const result = await adapter.execute(
            {
                weave_id: 'weave:start',
                payload: {
                    target: 'src/index.ts',
                    task: 'Refactor entrypoint',
                    ledger: 'C:\\temp\\ledger',
                },
            },
            createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /no longer canonical/i);
        assert.match(result.error ?? '', /--bead-id/i);
        assert.deepEqual(result.metadata, {
            adapter: 'compatibility:start-target-rejected',
            rejected_target: 'src/index.ts',
        });
    });

    it('still wakes the kernel when no target is provided', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        const adapter = new StartAdapter();

        try {
            const result = await adapter.execute(
                {
                    weave_id: 'weave:start',
                    payload: {
                        task: '',
                        ledger: 'C:\\temp\\ledger',
                    },
                },
                createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
            );

            assert.equal(wakeMock.mock.callCount(), 1);
            assert.equal(result.status, 'TRANSITIONAL');
            assert.match(result.output, /kernel is active/i);
        } finally {
            wakeMock.mock.restore();
        }
    });
});
