import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resumeHostGovernorIfAvailable } from '../../src/node/core/operator_resume.ts';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'Host governor synchronized the mission.',
        };
    }
}

describe('Operator entry host-governor resume', () => {
    it('does nothing when no host provider is active', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let woke = false;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CORVUS_HOST_SESSION_ACTIVE: 'false' },
            },
            {
                wakeKernel: async () => {
                    woke = true;
                },
            },
        );

        assert.equal(result.resumed, false);
        assert.equal(result.provider, null);
        assert.equal(result.wokeKernel, false);
        assert.equal(woke, false);
        assert.equal(dispatchPort.invocation, null);
    });

    it('wakes the kernel and dispatches the host governor when a host provider is active', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let wakeCount = 0;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CODEX_SHELL: '1' },
                task: 'Resume the operator surface.',
                source: 'cli',
            },
            {
                wakeKernel: async () => {
                    wakeCount += 1;
                },
            },
        );

        assert.equal(result.resumed, true);
        assert.equal(result.provider, 'codex');
        assert.equal(result.wokeKernel, true);
        assert.equal(result.governorResult?.status, 'SUCCESS');
        assert.equal(wakeCount, 1);
        assert.deepEqual(dispatchPort.invocation, {
            weave_id: 'weave:host-governor',
            payload: {
                task: 'Resume the operator surface.',
                ledger: undefined,
                auto_execute: true,
                auto_replan_blocked: true,
                max_parallel: 1,
                max_promotions: undefined,
                dry_run: undefined,
                project_root: '/tmp/corvus',
                cwd: '/tmp/corvus',
                source: 'cli',
            },
            session: undefined,
            target: undefined,
        });
    });
});
