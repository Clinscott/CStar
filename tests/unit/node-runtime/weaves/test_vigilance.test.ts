import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { VigilanceWeave, deps } from '../../../../src/node/core/runtime/host_workflows/vigilance.js';

describe('VigilanceWeave Unit Tests', () => {
    it('can return observe-only when the host supervisor declines execution', async () => {
        const dispatchPort: any = { dispatch: mock.fn(async () => ({ status: 'SUCCESS', output: 'unused' })) };
        const weave = new VigilanceWeave(dispatchPort, async () => JSON.stringify({
            action: 'observe_only',
            reason: 'Audit should remain observational.',
        }));

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:vigilance',
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
                output: 'Vigilance replanned.',
                metadata: {
                    planning_session_id: 'chant-session:vig',
                },
            })),
        };
        const weave = new VigilanceWeave(dispatchPort, async () => JSON.stringify({
            action: 'replan',
            reason: 'Needs a broader audit plan.',
        }));

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:vigilance',
            payload: {
                project_root: '.',
                cwd: '.',
                aggressive: true,
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
                if (invocation.weave_id === 'weave:ravens-cycle') {
                    return {
                        weave_id: 'weave:ravens-cycle',
                        status: 'SUCCESS',
                        output: 'Ravens complete.',
                        metadata: { scanned: true },
                    };
                }
                return {
                    weave_id: 'weave:warden',
                    status: 'SUCCESS',
                    output: 'Warden complete.',
                    metadata: { ledger_refreshed: true },
                };
            }),
        };
        const weave = new VigilanceWeave(dispatchPort);

        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:vigilance',
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
        assert.equal(dispatchPort.dispatch.mock.calls[0]?.arguments[0]?.weave_id, 'weave:ravens-cycle');
        assert.equal(dispatchPort.dispatch.mock.calls[1]?.arguments[0]?.weave_id, 'weave:warden');
        assert.equal(result.metadata?.delegated_weave_id, 'weave:warden');
        mock.reset();
    });
});
