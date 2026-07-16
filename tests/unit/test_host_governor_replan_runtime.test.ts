import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRuntime } from '../../src/node/core/runtime/bootstrap.js';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import {
    buildHostGovernorResumeInvocation,
    resumeHostGovernorIfAvailable,
} from '../../src/node/core/operator_resume.js';

describe('Retired HostGovernor resume and replan surfaces', () => {
    it('is absent from the bootstrapped runtime', () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        bootstrapRuntime(dispatcher);
        assert.equal(dispatcher.hasAdapter('weave:host-governor'), false);
        assert.equal(dispatcher.hasAdapter('weave:orchestrate'), false);
    });

    it('forces legacy invocation flags off', () => {
        const invocation = buildHostGovernorResumeInvocation({
            workspaceRoot: '/synthetic/project',
            cwd: '/synthetic/project',
            autoExecute: true,
            autoReplanBlocked: true,
        });
        assert.equal(invocation.payload.auto_execute, false);
        assert.equal(invocation.payload.auto_replan_blocked, false);
    });

    it('does not wake or dispatch an explicitly requested legacy resume', async () => {
        let wakeCalls = 0;
        let dispatchCalls = 0;
        const result = await resumeHostGovernorIfAvailable(
            {
                dispatch: async () => {
                    dispatchCalls += 1;
                    throw new Error('dispatch must not run');
                },
            },
            {
                workspaceRoot: '/synthetic/project',
                cwd: '/synthetic/project',
                explicitHostResume: true,
                env: { CODEX_SHELL: '1' },
            },
            {
                wakeKernel: async () => {
                    wakeCalls += 1;
                },
            },
        );

        assert.equal(result.resumed, false);
        assert.equal(result.wokeKernel, false);
        assert.equal(result.provider, null);
        assert.equal(result.governorResult?.status, 'FAILURE');
        assert.match(result.governorResult?.error ?? '', /retired_use_cstar_handoff/);
        assert.equal(result.governorResult?.metadata?.execution_dispatched, false);
        assert.equal(result.governorResult?.metadata?.hall_mutation_started, false);
        assert.equal(wakeCalls, 0);
        assert.equal(dispatchCalls, 0);
    });
});
