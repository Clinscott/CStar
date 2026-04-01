import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { RestorationWeave, deps } from '../../../../src/node/core/runtime/host_workflows/restoration.js';

describe('RestorationWeave Unit Tests', () => {
    it('can return observe-only when the host supervisor declines execution', async () => {
        const dispatchPort: any = { dispatch: mock.fn(async () => ({ status: 'SUCCESS', output: 'unused' })) };
        const weave = new RestorationWeave(dispatchPort, async () => JSON.stringify({
            action: 'observe_only',
            reason: 'Repair should remain observational for now.',
        }));

        mock.method(deps, 'getHallBeadsByStatus', () => [{ id: 'bead-1' }] as any);
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:restoration',
            payload: {
                project_root: '.',
                cwd: '.',
            },
        } as any, {
            workspace_root: '.',
            env: {},
        } as any);

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.supervisor_decision, 'observe_only');
        assert.equal(dispatchPort.dispatch.mock.callCount(), 0);
        mock.reset();
    });

    it('can replan through chant when the host supervisor requests it', async () => {
        const dispatchPort: any = {
            dispatch: mock.fn(async () => ({
                weave_id: 'weave:chant',
                status: 'TRANSITIONAL',
                output: 'Replanned through chant.',
                metadata: {
                    planning_session_id: 'chant-session:123',
                },
            })),
        };
        const weave = new RestorationWeave(dispatchPort, async () => JSON.stringify({
            action: 'replan',
            reason: 'Needs a different decomposition.',
        }));

        mock.method(deps, 'getHallBeadsByStatus', () => [{ id: 'bead-1' }] as any);
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:restoration',
            payload: {
                project_root: '.',
                cwd: '.',
            },
        } as any, {
            workspace_root: '.',
            env: {},
        } as any);

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(dispatchPort.dispatch.mock.callCount(), 1);
        assert.equal(dispatchPort.dispatch.mock.calls[0]?.arguments[0]?.weave_id, 'weave:chant');
        assert.equal(result.metadata?.delegated_weave_id, 'weave:chant');
        assert.equal(result.metadata?.supervisor_decision, 'replan');
        mock.reset();
    });

    it('falls through to bounded local execution when no host provider is active', async () => {
        const dispatchPort: any = {
            dispatch: mock.fn(async (invocation: any) => {
                if (invocation.weave_id === 'weave:evolve') {
                    return {
                        weave_id: invocation.weave_id,
                        status: 'SUCCESS',
                        output: 'evolved',
                        metadata: { changed: true },
                    };
                }
                return {
                    weave_id: invocation.weave_id,
                    status: 'SUCCESS',
                    output: 'distilled',
                    metadata: { memory_id: 'memory-1' },
                };
            }),
        };
        const weave = new RestorationWeave(dispatchPort);

        mock.method(deps, 'getHallBeadsByStatus', () => [{ id: 'bead-1' }] as any);
        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:restoration',
            payload: {
                project_root: '.',
                cwd: '.',
            },
        } as any, {
            workspace_root: '.',
            env: {},
        } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(dispatchPort.dispatch.mock.callCount(), 2);
        assert.equal(dispatchPort.dispatch.mock.calls[0]?.arguments[0]?.weave_id, 'weave:evolve');
        assert.equal(dispatchPort.dispatch.mock.calls[1]?.arguments[0]?.weave_id, 'weave:distill');
        mock.reset();
    });
});
