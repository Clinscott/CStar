import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ResearchWeave, deps } from  '../../../../src/node/core/runtime/weaves/research.js';

describe('ResearchWeave Unit Tests', () => {
    it('initializes correctly', () => {
        const dispatchPort: any = {};
        const weave = new ResearchWeave(dispatchPort);
        assert.equal(weave.id, 'weave:research');
    });

    it('execute succeeds when host returns valid JSON', async () => {
        const dispatchPort: any = {};
        let capturedRequest: Record<string, unknown> | null = null;
        const hostTextInvoker = async (request: Record<string, unknown>) => {
            capturedRequest = request;
            return '{"summary": "Research findings", "research_artifacts": ["A"]}';
        };
        const weave = new ResearchWeave(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Research findings');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.deepEqual(result.metadata?.research_artifacts, ['A']);
        assert.deepEqual(capturedRequest?.metadata, {
            transport_mode: 'host_session',
            one_mind_boundary: 'primary',
            execution_role: 'primary',
        });
        mock.reset();
    });

    it('execute fails when no provider is found', async () => {
        const dispatchPort: any = {};
        const weave = new ResearchWeave(dispatchPort);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires an active host session/i);
        mock.reset();
    });

    it('execute fails when host invoker throws', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => { throw new Error('Network error'); };
        const weave = new ResearchWeave(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Network error/i);
        mock.reset();
    });

    it('execute fails when host response omits a usable summary', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => '{"research_artifacts": ["A"]}';
        const weave = new ResearchWeave(dispatchPort, hostTextInvoker);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /must include a non-empty summary string/i);
        mock.reset();
    });

    it('execute merges parallel subquestion results in input order', async () => {
        const dispatchPort: any = {};
        const responses = [
            '{"summary": "First branch.", "research_artifacts": ["A"]}',
            '{"summary": "Second branch.", "research_artifacts": ["B", "A"]}',
        ];
        let index = 0;
        const hostTextInvoker = async () => responses[index++] ?? responses[responses.length - 1];
        const weave = new ResearchWeave(dispatchPort, hostTextInvoker);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', subquestions: ['alpha', 'beta'], cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'First branch. Second branch.');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.equal(result.metadata?.parallel, true);
        assert.equal(result.metadata?.branch_count, 2);
        assert.deepEqual(result.metadata?.research_artifacts, ['A', 'B']);
        mock.reset();
    });
});
