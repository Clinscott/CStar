import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { StartAdapter, DynamicCommandAdapter } from  '../../../src/node/core/runtime/adapters.js';
import { RuntimeContext, WeaveInvocation } from  '../../../src/node/core/runtime/contracts.js';

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
                env: {},
                timestamp: Date.now()
            };

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(result.status, 'TRANSITIONAL');
            assert.ok(result.output?.includes('system is awake'));
        });

        it('should delegate to host-governor if loki is true', async () => {
            const mockDispatchPort = {
                dispatch: mock.fn(async () => ({
                    status: 'SUCCESS',
                    output: 'governor-output',
                    metadata: {}
                }))
            };
            
            // @ts-ignore
            const adapter = new StartAdapter(mockDispatchPort);
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
            assert.strictEqual(mockDispatchPort.dispatch.mock.callCount(), 1);
            assert.strictEqual(result.status, 'SUCCESS');
            assert.ok(result.output?.includes('governor-output'));
        });
    });

    describe('DynamicCommandAdapter', () => {
        it('should return failure for unknown command', async () => {
            const adapter = new DynamicCommandAdapter();
            const invocation: WeaveInvocation<any> = {
                weave_id: 'weave:dynamic-command',
                payload: { command: 'unknown-cmd', project_root: '.' }
            };
            const context: RuntimeContext = { workspace_root: '.', env: {} } as any;

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(result.status, 'FAILURE');
            assert.ok(result.error?.includes("Unknown command 'unknown-cmd'"));
        });
    });
});
