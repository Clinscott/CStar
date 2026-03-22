import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ANS } from '../../src/node/core/ans.ts';
import type { HostGovernorWeavePayload, RuntimeContext, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';
import { StartAdapter } from '../../src/node/core/runtime/adapters.ts';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'Host governor resumed the autonomous loop.',
            metadata: {
                promoted_bead_ids: ['bead-1'],
            },
        };
    }
}

function createContext(workspaceRoot: string, env: Record<string, string | undefined> = {}): RuntimeContext {
    return {
        mission_id: 'MISSION-START',
        trace_id: 'TRACE-START',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env,
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
                createContext('C:\\Users\\Craig\\Corvus\\CorvusStar', { CORVUS_HOST_SESSION_ACTIVE: 'false' }),
            );

            assert.equal(wakeMock.mock.callCount(), 1);
            assert.equal(result.status, 'TRANSITIONAL');
            assert.match(result.output, /kernel is active/i);
        } finally {
            wakeMock.mock.restore();
        }
    });

    it('routes loki start through the host-governor weave', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        const capture = new CaptureDispatchPort();
        const adapter = new StartAdapter(capture);

        try {
            const result = await adapter.execute(
                {
                    weave_id: 'weave:start',
                    payload: {
                        task: 'Resume the host-governed mission.',
                        ledger: 'C:\\temp\\ledger',
                        loki: true,
                    },
                    session: {
                        mode: 'cli',
                        interactive: true,
                    },
                    target: {
                        domain: 'brain',
                        workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                        requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    },
                },
                createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
            );

            assert.equal(wakeMock.mock.callCount(), 1);
            assert.equal(result.status, 'SUCCESS');
            assert.equal(capture.invocation?.weave_id, 'weave:host-governor');
            assert.deepEqual(capture.invocation?.payload, {
                task: 'Resume the host-governed mission.',
                ledger: 'C:\\temp\\ledger',
                auto_execute: true,
                auto_replan_blocked: true,
                max_parallel: 1,
                project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                source: 'runtime',
            } satisfies HostGovernorWeavePayload);
            assert.equal(result.metadata?.adapter, 'runtime:host-governor');
        } finally {
            wakeMock.mock.restore();
        }
    });

    it('uses start as a wake-and-resume trigger when a host session is active', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        const capture = new CaptureDispatchPort();
        const adapter = new StartAdapter(capture);

        try {
            const result = await adapter.execute(
                {
                    weave_id: 'weave:start',
                    payload: {
                        task: 'Resume the host-governed mission.',
                        ledger: 'C:\\temp\\ledger',
                    },
                },
                createContext('C:\\Users\\Craig\\Corvus\\CorvusStar', { CODEX_SHELL: '1' }),
            );

            assert.equal(wakeMock.mock.callCount(), 1);
            assert.equal(result.status, 'SUCCESS');
            assert.equal(capture.invocation?.weave_id, 'weave:host-governor');
            assert.equal((capture.invocation?.payload as HostGovernorWeavePayload).auto_replan_blocked, true);
            assert.equal(result.metadata?.resume_provider, 'codex');
        } finally {
            wakeMock.mock.restore();
        }
    });
});
