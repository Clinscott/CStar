import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { WardenWeave, deps } from '../../../../src/node/core/runtime/weaves/warden.js';

describe('WardenWeave Unit Tests', () => {
    it('can return observe-only when the host supervisor declines execution', async () => {
        const dispatchPort: any = { dispatch: mock.fn(async () => ({ status: 'SUCCESS', output: 'unused' })) };
        let capturedRequest: any;
        const weave = new WardenWeave(dispatchPort, async (request) => {
            capturedRequest = request;
            return JSON.stringify({
                action: 'observe_only',
                reason: 'Keep the ledger stable for now.',
            });
        });

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:warden',
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
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });

    it('can replan through chant when the host supervisor requests it', async () => {
        const dispatchPort: any = {
            dispatch: mock.fn(async () => ({
                weave_id: 'weave:chant',
                status: 'TRANSITIONAL',
                output: 'Warden replanned.',
                metadata: {
                    planning_session_id: 'chant-session:warden',
                },
            })),
        };
        const weave = new WardenWeave(dispatchPort, async () => JSON.stringify({
            action: 'replan',
            reason: 'Needs a broader anomaly mission.',
        }));

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:warden',
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
        const dispatchPort: any = { dispatch: mock.fn(async () => ({ status: 'SUCCESS', output: 'unused' })) };
        const weave = new WardenWeave(dispatchPort);
        const evaluateProjection = mock.fn(async () => undefined);

        mock.method(deps, 'resolveRuntimeHostProvider', () => null);
        mock.method(deps, 'createWarden', () => ({ evaluateProjection }) as any);

        const result = await weave.execute({
            weave_id: 'weave:warden',
            payload: {
                project_root: '.',
                cwd: '.',
                scan_id: 'scan:123',
            },
        } as any, {
            workspace_root: '.',
            env: {},
        } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(evaluateProjection.mock.callCount(), 1);
        assert.deepEqual(evaluateProjection.mock.calls[0]?.arguments, ['.', 'scan:123']);
        assert.equal(dispatchPort.dispatch.mock.callCount(), 0);
        assert.equal(result.metadata?.ledger_refreshed, true);
        mock.reset();
    });
});
