import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ArchitectWeave, deps } from  '../../../../src/node/core/runtime/weaves/architect.js';

describe('ArchitectWeave Unit Tests', () => {
    it('initializes correctly', () => {
        const dispatchPort: any = {};
        const weave = new ArchitectWeave(dispatchPort);
        assert.equal(weave.id, 'weave:architect');
    });

    it('build_proposal succeeds when host returns valid JSON', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => '{"proposal_summary": "summary", "beads": []}';
        const weave = new ArchitectWeave(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'build_proposal', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.delegated, true);
        assert.equal((result.metadata?.architect_proposal as any).proposal_summary, 'summary');
        mock.reset();
    });

    it('build_proposal fails when no provider is found', async () => {
        const dispatchPort: any = {};
        const weave = new ArchitectWeave(dispatchPort);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'build_proposal', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires an active host session/i);
        mock.reset();
    });

    it('review_critique succeeds', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => '{"is_approved": true, "architect_opinion": "Good work"}';
        const weave = new ArchitectWeave(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'review_critique', cwd: '.', bead: { title: 'T' }, critique_payload: {} }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Good work');
        mock.reset();
    });
});
