import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ArchitectCompatibilityAdapter } from  '../../../../src/node/core/runtime/compat/architect.js';
import { deps } from  '../../../../src/node/core/runtime/host_workflows/architect_service.js';

describe('ArchitectCompatibilityAdapter Unit Tests', () => {
    it('initializes correctly', () => {
        const dispatchPort: any = {};
        const weave = new ArchitectCompatibilityAdapter(dispatchPort);
        assert.equal(weave.id, 'weave:architect');
    });

    it('build_proposal succeeds when host returns valid JSON', async () => {
        const dispatchPort: any = {};
        let capturedRequest: any;
        const hostTextInvoker = async (request: any) => {
            capturedRequest = request;
            return '{"proposal_summary": "summary", "beads": []}';
        };
        const weave = new ArchitectCompatibilityAdapter(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'build_proposal', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.delegated, true);
        assert.equal((result.metadata?.architect_proposal as any).proposal_summary, 'summary');
        assert.equal(capturedRequest?.metadata?.decision, 'build_proposal');
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });

    it('build_proposal fails when no provider is found', async () => {
        const dispatchPort: any = {};
        const weave = new ArchitectCompatibilityAdapter(dispatchPort);
        
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
        let capturedRequest: any;
        const hostTextInvoker = async (request: any) => {
            capturedRequest = request;
            return '{"is_approved": true, "architect_opinion": "Good work"}';
        };
        const weave = new ArchitectCompatibilityAdapter(dispatchPort, hostTextInvoker);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'review_critique', cwd: '.', bead: { title: 'T' }, critique_payload: {} }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Good work');
        assert.equal(capturedRequest?.metadata?.decision, 'review_critique');
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });

    it('build_proposal fails when the host response omits beads', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => '{"proposal_summary": "summary"}';
        const weave = new ArchitectCompatibilityAdapter(dispatchPort, hostTextInvoker);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'build_proposal', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /must include a beads array/i);
        mock.reset();
    });

    it('review_critique fails when the host response omits approval state', async () => {
        const dispatchPort: any = {};
        const hostTextInvoker = async () => '{"architect_opinion": "Good work"}';
        const weave = new ArchitectCompatibilityAdapter(dispatchPort, hostTextInvoker);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));

        const result = await weave.execute({
            weave_id: 'weave:architect',
            payload: { action: 'review_critique', cwd: '.', bead: { title: 'T' }, critique_payload: {} }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /must include an is_approved boolean/i);
        mock.reset();
    });
});
