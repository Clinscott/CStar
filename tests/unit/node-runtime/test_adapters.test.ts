import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { StartAdapter, DynamicCommandAdapter } from  '../../../src/node/core/runtime/adapters.js';
import { RuntimeContext, WeaveInvocation } from  '../../../src/node/core/runtime/contracts.js';
import { ANS } from '../../../src/node/core/ans.js';

describe('Runtime Adapters', () => {
    describe('StartAdapter', () => {
        it('should return TRANSITIONAL for a basic start', async () => {
            const adapter = new StartAdapter();
            const invocation: WeaveInvocation<any> = {
                weave_id: 'weave:start',
                payload: {}
            };
            const context: RuntimeContext = {
                mission_id: 'TEST',
                trace_id: 'TRACE',
                persona: 'ALFRED',
                workspace_root: '.',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: { CORVUS_HOST_SESSION_ACTIVE: 'false' },
                timestamp: Date.now()
            };

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(result.status, 'TRANSITIONAL');
            assert.ok(result.output?.includes('Kernel Awakening Complete'));
        });

        it('should fail closed instead of delegating when loki is true', async () => {
            const mockDispatchPort = {
                dispatch: mock.fn(async () => ({
                    status: 'SUCCESS',
                    output: 'governor-output',
                    metadata: {}
                }))
            };
            const wakeMock = mock.method(ANS, 'wake', async () => undefined);
            
            try {
                const adapter = new StartAdapter();
                const invocation: WeaveInvocation<any> = {
                    weave_id: 'weave:start',
                    payload: { loki: true }
                };
                const context: RuntimeContext = {
                    workspace_root: '.',
                    env: {},
                    // ... rest of context
                } as any;

                const result = await adapter.execute(invocation, context);
                assert.strictEqual(wakeMock.mock.callCount(), 0);
                assert.strictEqual(mockDispatchPort.dispatch.mock.callCount(), 0);
                assert.strictEqual(result.status, 'FAILURE');
                assert.match(result.error ?? '', /permanently decommissioned/i);
            } finally {
                wakeMock.mock.restore();
            }
        });
    });

    describe('DynamicCommandAdapter', () => {
        it('should fail closed for every legacy dynamic command', async () => {
            const adapter = new DynamicCommandAdapter();
            const invocation: WeaveInvocation<any> = {
                weave_id: 'weave:dynamic-command',
                payload: { command: 'unknown-cmd', project_root: '.' }
            };
            const context: RuntimeContext = { workspace_root: '.', env: {} } as any;

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(result.status, 'FAILURE');
            assert.match(result.error ?? '', /permanently decommissioned/i);
            assert.strictEqual(result.metadata?.execution_attempted, false);
        });
    });
});
