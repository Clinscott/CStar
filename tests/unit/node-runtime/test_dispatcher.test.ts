import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeDispatcher } from  '../../../src/node/core/runtime/dispatcher.js';
import { WeaveInvocation, WeaveResult } from  '../../../src/node/core/runtime/contracts.js';
import { registry } from  '../../../src/tools/pennyone/pathRegistry.js';

describe('RuntimeDispatcher', () => {
    it('should correctly dispatch to a registered adapter', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:test',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:test',
                status: 'SUCCESS',
                output: 'test-output'
            }))
        };

        const mockResolveEstateTarget = mock.fn(() => ({
            workspaceRoot,
            targetDomain: 'brain' as const,
            requestedRoot: workspaceRoot,
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
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
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
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:fail',
            execute: mock.fn(async (): Promise<WeaveResult> => {
                throw new Error('Explosion');
            })
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {} }
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:fail',
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('catastrophic failure: Explosion'));
    });

    it('allows pennyone search observation calls from the CLI without a trace block', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:pennyone',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:pennyone',
                status: 'TRANSITIONAL',
                output: 'PennyOne search completed.',
            })),
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {}, updateFramework: () => {} },
            activePersona: { name: 'ALFRED' },
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'search',
                query: 'host governor',
                path: '.',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
            target: {
                domain: 'brain',
                workspace_root: workspaceRoot,
                requested_path: workspaceRoot,
            },
        });

        assert.strictEqual(result.status, 'TRANSITIONAL');
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
    });
});
