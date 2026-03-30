import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { EstateExpansionWeave, deps } from '../../../../src/node/core/runtime/weaves/expansion.js';

describe('EstateExpansionWeave Unit Tests', () => {
    it('can return observe-only when the host supervisor declines onboarding execution', async () => {
        const dispatchPort: any = { dispatch: mock.fn(async () => ({ status: 'SUCCESS', output: 'unused' })) };
        const weave = new EstateExpansionWeave(dispatchPort, async () => JSON.stringify({
            action: 'observe_only',
            reason: 'Wait for a safer onboarding window.',
        }));

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:expansion',
            payload: {
                remote_url: 'https://github.com/example/spoke.git',
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
                output: 'Expansion replanned.',
                metadata: {
                    planning_session_id: 'chant-session:expansion',
                },
            })),
        };
        const weave = new EstateExpansionWeave(dispatchPort, async () => JSON.stringify({
            action: 'replan',
            slug: 'better-spoke',
            reason: 'Needs a more careful onboarding plan.',
        }));

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:expansion',
            payload: {
                remote_url: 'https://github.com/example/spoke.git',
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
        assert.equal(result.metadata?.slug, 'better-spoke');
        mock.reset();
    });

    it('falls through to bounded local execution when no host provider is active', async () => {
        const dispatchPort: any = {
            dispatch: mock.fn(async (invocation: any) => {
                if (invocation.payload.action === 'import') {
                    return {
                        weave_id: 'weave:pennyone',
                        status: 'SUCCESS',
                        output: 'linked',
                        metadata: {},
                    };
                }
                if (invocation.payload.action === 'scan') {
                    return {
                        weave_id: 'weave:pennyone',
                        status: 'SUCCESS',
                        output: 'scanned',
                        metadata: { files: ['src/index.ts'] },
                    };
                }
                return {
                    weave_id: 'weave:pennyone',
                    status: 'SUCCESS',
                    output: 'topology',
                    metadata: {},
                };
            }),
        };
        const weave = new EstateExpansionWeave(dispatchPort);

        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:expansion',
            payload: {
                remote_url: 'https://github.com/example/spoke.git',
                project_root: '.',
                cwd: '.',
            },
        } as any, {
            workspace_root: '.',
            env: {},
        } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(dispatchPort.dispatch.mock.callCount(), 3);
        assert.equal(result.metadata?.slug, 'spoke');
        mock.reset();
    });
});
