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
        const hostTextInvoker = async () => '{"summary": "Research findings", "research_artifacts": ["A"]}';
        const weave = new ResearchWeave(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Research findings');
        assert.deepEqual(result.metadata?.research_artifacts, ['A']);
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
});
