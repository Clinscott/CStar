import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RavensAdapter, runtimeAdapterDeps } from  '../../src/node/core/runtime/adapters.js';
import type { RuntimeContext, WeaveInvocation } from  '../../src/node/core/runtime/contracts.js';
import { mock } from 'node:test';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-RAVENS',
        trace_id: 'TRACE-RAVENS',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Ravens lifecycle adapter (kernel cleanup)', () => {
    let tmpRoot: string;
    let invocation: WeaveInvocation<{ action: 'start' | 'stop' | 'status' | 'cycle' | 'sweep'; shadow_forge?: boolean }>;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-ravens-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens', 'norn.py'), '# warden', 'utf-8');
        invocation = {
            weave_id: 'weave:ravens',
            payload: { action: 'status' },
        };
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    function buildTarget(repoRoot: string, slug: string = 'brain', domain: 'brain' | 'spoke' | 'compat' = 'brain') {
        return {
            slug,
            domain,
            repo_root: repoRoot,
            requested_path: domain === 'spoke' ? `spoke://${slug}/` : repoRoot,
        };
    }

    it('reports standby lifecycle status through the shared runtime adapter', async () => {
        const adapter = new RavensAdapter(undefined as any, () => [buildTarget(tmpRoot)]);
        const result = await adapter.execute(invocation, createContext(tmpRoot));

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /STANDBY/);
        assert.equal(result.metadata?.adapter, 'runtime:ravens-kernel-status');
    });

    it('runs a one-shot sweep through injected cycle dependencies', async () => {
        let delegated = 0;
        const adapter = new RavensAdapter(
            {
                id: 'weave:ravens-cycle',
                execute: async () => {
                    delegated += 1;
                    return {
                        weave_id: 'weave:ravens-cycle',
                        status: 'SUCCESS',
                        output: 'Ravens cycle completed.',
                        metadata: {
                            cycle_result: {
                                status: 'SUCCESS',
                                summary: 'Ravens cycle completed.',
                                mission_id: `ravens-cycle:${delegated}`,
                                stages: [],
                            },
                        },
                    };
                },
            } as any,
            () => [buildTarget(tmpRoot), buildTarget(path.join(tmpRoot, 'satellite'), 'satellite', 'compat')],
        );

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'start', shadow_forge: true },
            },
            createContext(tmpRoot),
        );

        assert.equal(delegated, 2);
        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /2 target\(s\)/);
        assert.equal(result.metadata?.adapter, 'runtime:ravens-sweep');
        assert.equal((result.metadata?.sweep_results as Array<unknown>).length, 2);
    });

    it('reports that stop is a no-op in kernel mode', async () => {
        const adapter = new RavensAdapter(undefined as any, () => [buildTarget(tmpRoot)]);
        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'stop' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /No resident Muninn daemon/i);
    });

    it('delegates one-cycle execution through the ravens-cycle weave', async () => {
        let delegated = false;
        const adapter = new RavensAdapter(
            {
                id: 'weave:ravens-cycle',
                execute: async () => {
                    delegated = true;
                    return {
                        weave_id: 'weave:ravens-cycle',
                        status: 'SUCCESS',
                        output: 'Ravens cycle completed.',
                        metadata: {
                            cycle_result: {
                                status: 'SUCCESS',
                                summary: 'Ravens cycle completed.',
                                mission_id: 'ravens-cycle:test',
                                stages: [],
                            },
                        },
                    };
                },
            } as any,
            () => [buildTarget(tmpRoot)],
        );

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'cycle' },
            },
            createContext(tmpRoot),
        );

        assert.equal(delegated, true);
        assert.equal(result.weave_id, 'weave:ravens');
        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.adapter, 'runtime:ravens-cycle-wrapper');
        assert.equal((result.metadata?.cycle_result as any)?.mission_id, 'ravens-cycle:test');
    });

    it('can return observe-only when the host supervisor declines maintenance execution', async () => {
        let capturedRequest: { metadata?: Record<string, unknown> } | undefined;
        const adapter = new RavensAdapter(
            undefined as any,
            () => [buildTarget(tmpRoot)],
            async (request) => {
                capturedRequest = request;
                return JSON.stringify({
                    mode: 'observe_only',
                    reason: 'Stay observational until the operator approves the sweep.',
                });
            },
        );

        mock.method(runtimeAdapterDeps, 'resolveHostProvider', () => 'codex' as any);
        mock.method(runtimeAdapterDeps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'start' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.adapter, 'runtime:ravens-host-observe');
        assert.equal(result.metadata?.supervisor_mode, 'observe_only');
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });

    it('can normalize public maintenance intent while still delegating to bounded cycle execution', async () => {
        let delegated = 0;
        let capturedRequest: { metadata?: Record<string, unknown> } | undefined;
        const adapter = new RavensAdapter(
            {
                id: 'weave:ravens-cycle',
                execute: async () => {
                    delegated += 1;
                    return {
                        weave_id: 'weave:ravens-cycle',
                        status: 'SUCCESS',
                        output: 'Ravens cycle completed.',
                        metadata: {
                            cycle_result: {
                                status: 'SUCCESS',
                                summary: 'Ravens cycle completed.',
                                mission_id: `ravens-cycle:${delegated}`,
                                stages: [],
                            },
                        },
                    };
                },
            } as any,
            () => [buildTarget(tmpRoot)],
            async (request) => {
                capturedRequest = request;
                return JSON.stringify({
                    mode: 'execute_now',
                    action: 'cycle',
                    reason: 'Run a single bounded cycle instead of a broader sweep.',
                });
            },
        );

        mock.method(runtimeAdapterDeps, 'resolveHostProvider', () => 'codex' as any);
        mock.method(runtimeAdapterDeps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'start' },
            },
            createContext(tmpRoot),
        );

        assert.equal(delegated, 1);
        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.adapter, 'runtime:ravens-cycle-wrapper');
        assert.equal(result.metadata?.supervisor_mode, 'execute_now');
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });
});
