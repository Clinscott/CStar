import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeDispatcher } from '../../../src/node/core/runtime/dispatcher.ts';
import { WeaveInvocation, WeaveResult } from '../../../src/node/core/runtime/contracts.ts';

describe('RuntimeDispatcher', () => {
    it('should correctly dispatch to a registered adapter', async () => {
        const mockAdapter = {
            id: 'weave:test',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:test',
                status: 'SUCCESS',
                output: 'test-output'
            }))
        };

        const mockResolveEstateTarget = mock.fn(() => ({
            workspaceRoot: '/mock/root',
            targetDomain: 'brain' as const
        }));

        const mockStateRegistry = {
            updateMission: mock.fn(),
            updateFramework: mock.fn()
        };

        // Create isolated dispatcher with injected mocks
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: mockResolveEstateTarget,
            // @ts-ignore
            stateRegistry: mockStateRegistry,
            activePersona: { name: 'ALFRED' }
        });

        dispatcher.registerAdapter(mockAdapter);

        const invocation: WeaveInvocation<any> = {
            weave_id: 'weave:test',
            payload: {}
        };

        const result = await dispatcher.dispatch(invocation);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'test-output');
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
        assert.strictEqual(mockResolveEstateTarget.mock.callCount(), 1);
        assert.strictEqual(mockStateRegistry.updateMission.mock.callCount(), 1);
    });

    it('should return failure if adapter is not registered', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        const invocation: WeaveInvocation<any> = {
            weave_id: 'weave:unknown',
            payload: {}
        };

        const result = await dispatcher.dispatch(invocation);

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('spine remains disconnected'));
    });

    it('should handle adapter execution failures', async () => {
        const mockAdapter = {
            id: 'weave:fail',
            execute: mock.fn(async (): Promise<WeaveResult> => {
                throw new Error('Explosion');
            })
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot: '.', targetDomain: 'brain' }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {} }
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({ weave_id: 'weave:fail', payload: {} });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('catastrophic failure: Explosion'));
    });
});
