import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HostWorkerWeave } from '../../src/node/core/runtime/weaves/host_worker.js';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.js';

const bead = {
    id: 'bead-123',
    status: 'SET',
    target_path: 'src/example.ts',
    checker_shell: 'node checker.js',
    contract_refs: ['tests/example.test.ts'],
    rationale: 'Implement the bounded change.',
    acceptance_criteria: 'It works.|Tests pass.',
} as any;

function createContext(): RuntimeContext {
    return {
        mission_id: 'mission-host-worker',
        bead_id: 'bead-123',
        trace_id: 'trace-host-worker',
        persona: 'O.D.I.N.',
        workspace_root: '/repo',
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        timestamp: Date.now(),
    };
}

describe('Host worker delegated execution bridge', () => {
    it('prefers delegated subagent execution when a host bridge is available', async () => {
        let written = '';
        const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
        let delegatedRequest: any;
        let mimirCalled = false;

        const weave = new HostWorkerWeave({
            getBeads: () => [bead],
            delegateExecution: async (request) => {
                delegatedRequest = request;
                return {
                    handle_id: 'handle-1',
                    provider: 'codex',
                    status: 'completed',
                    raw_text: '```ts\nexport const value = 1;\n```',
                    summary: 'Completed through Codex subagent bridge.',
                };
            },
            requestViaMimir: async () => {
                mimirCalled = true;
                throw new Error('mimir should not be used when delegation succeeds');
            },
            existsSync: (target) => target.includes('example'),
            readFileSync: (target) => target.includes('example.test.ts') ? 'test body' : 'export const oldValue = 0;',
            mkdirSync: () => undefined as any,
            writeFileSync: (_target, data) => {
                written = String(data);
            },
            runner: async (cmd, args, options) => {
                calls.push({ cmd, args, cwd: options.cwd });
                return { stdout: '', stderr: '', exitCode: 0, command: '' } as any;
            },
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:host-worker',
                payload: { bead_id: 'bead-123', project_root: '/repo', cwd: '/repo' },
            },
            createContext(),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.equal(result.metadata?.delegated, true);
        assert.equal(result.metadata?.provider, 'codex');
        assert.equal(mimirCalled, false);
        assert.equal(delegatedRequest.boundary, 'subagent');
        assert.equal(delegatedRequest.task_kind, 'implementation');
        assert.deepEqual(delegatedRequest.acceptance_criteria, ['It works.', 'Tests pass.']);
        assert.match(written, /export const value = 1;/);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.cmd, 'node');
    });

    it('falls back to the Hall-backed synapse path when no delegate bridge is configured', async () => {
        let written = '';
        let mimirTransport = '';

        const weave = new HostWorkerWeave({
            getBeads: () => [bead],
            delegateExecution: async () => {
                throw new Error('Provider codex does not have a configured delegated-execution bridge.');
            },
            requestViaMimir: async (request) => {
                mimirTransport = String((request as any).transport_mode ?? '');
                return {
                    status: 'success',
                    raw_text: '```ts\nexport const fallbackValue = 2;\n```',
                    trace: {
                        correlation_id: 'host-worker-fallback',
                        transport_mode: 'synapse_db',
                    },
                } as any;
            },
            existsSync: (target) => target.includes('example'),
            readFileSync: (target) => target.includes('example.test.ts') ? 'test body' : 'export const oldValue = 0;',
            mkdirSync: () => undefined as any,
            writeFileSync: (_target, data) => {
                written = String(data);
            },
            runner: async () => ({ stdout: '', stderr: '', exitCode: 0, command: '' } as any),
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:host-worker',
                payload: { bead_id: 'bead-123', project_root: '/repo', cwd: '/repo' },
            },
            createContext(),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.equal(result.metadata?.delegated, false);
        assert.equal(mimirTransport, 'synapse_db');
        assert.match(written, /export const fallbackValue = 2;/);
    });
});
