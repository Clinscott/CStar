import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ResearchWeave, deps } from  '../../../../src/node/core/runtime/host_workflows/research.js';

describe('ResearchWeave Unit Tests', () => {
    it('initializes correctly', () => {
        const dispatchPort: any = {};
        const weave = new ResearchWeave(dispatchPort);
        assert.equal(weave.id, 'weave:research');
    });

    it('execute succeeds when delegated research returns valid JSON', async () => {
        const dispatchPort: any = {};
        const capturedRequests: Array<Record<string, unknown>> = [];
        const weave = new ResearchWeave(dispatchPort);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));
        mock.method(deps, 'requestHostDelegatedExecution', async (request: Record<string, unknown>) => {
            capturedRequests.push(request);
            return {
                handle_id: `delegate-${capturedRequests.length}`,
                provider: 'codex',
                status: 'completed',
                raw_text: `{"summary": "Research findings ${capturedRequests.length}", "research_artifacts": ["A"]}`,
                metadata: {
                    execution_surface: 'host-cli-inference',
                    delegation_mode: 'provider-native',
                },
            };
        });

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', cwd: '.' }
        } as any, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /Research findings 1/);
        assert.equal(result.metadata?.context_policy, 'project');
        assert.deepEqual(result.metadata?.research_artifacts, ['A']);
        assert.equal(result.metadata?.branch_count, 5);
        assert.equal(capturedRequests.length, 5);
        assert.equal(capturedRequests[0]?.boundary, 'subagent');
        assert.equal(capturedRequests[0]?.task_kind, 'research');
        assert.match(String(capturedRequests[0]?.prompt ?? ''), /Anti-Behavior:/);
        assert.match(String(capturedRequests[0]?.prompt ?? ''), /Root Persona Overlay:/);
        assert.deepEqual(capturedRequests[0]?.metadata, {
            mission_id: undefined,
            trace_id: undefined,
            session_id: null,
            source: 'runtime:research:branch:0',
            one_mind_boundary: 'subagent',
            execution_role: 'subagent',
            subagent_profile: 'torvalds',
            council_expert: 'TORVALDS',
        });
        mock.reset();
    });

    it('execute fails when no provider is found', async () => {
        const dispatchPort: any = {};
        const weave = new ResearchWeave(dispatchPort);
        
        mock.method(deps, 'resolveRuntimeHostProvider', () => null);

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', subagent_profile: 'architect', cwd: '.' }
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
        mock.method(deps, 'requestHostDelegatedExecution', async () => {
            throw new Error('Configured delegated-execution bridge missing for codex.');
        });

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', subagent_profile: 'architect', cwd: '.' }
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
        mock.method(deps, 'requestHostDelegatedExecution', async () => {
            throw new Error('Configured delegated-execution bridge missing for codex.');
        });

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
        const weave = new ResearchWeave(dispatchPort);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'extractJsonObject', (text: string) => JSON.parse(text));
        mock.method(deps, 'requestHostDelegatedExecution', async () => ({
            handle_id: `delegate-${index}`,
            provider: 'codex',
            status: 'completed',
            raw_text: responses[index++] ?? responses[responses.length - 1],
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

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

    it('persists failed branch records when delegated research fails', async () => {
        const dispatchPort: any = {};
        const savedRecords: Array<Record<string, unknown>> = [];
        const weave = new ResearchWeave(dispatchPort);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'requestHostDelegatedExecution', async () => {
            throw new Error('research delegated execution timeout after 5ms');
        });
        mock.method(deps, 'saveHallOneMindBranch', (record: Record<string, unknown>) => {
            savedRecords.push(record);
        });

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', subquestions: ['alpha'], cwd: '.', project_root: '.' }
        } as any, {
            workspace_root: '.',
            env: {},
            trace_id: 'trace-research-failure',
        } as any);

        assert.equal(result.status, 'FAILURE');
        assert.equal(savedRecords.length, 1);
        assert.equal(savedRecords[0]?.status, 'FAILED');
        assert.match(String(savedRecords[0]?.error_text ?? ''), /timeout/i);
        mock.reset();
    });

    it('queues delegated research requests when a poll bridge is configured', async () => {
        const dispatchPort: any = {};
        const savedRequests: Array<Record<string, unknown>> = [];
        const weave = new ResearchWeave(dispatchPort);

        mock.method(deps, 'resolveRuntimeHostProvider', () => 'codex');
        mock.method(deps, 'resolveConfiguredDelegatePollBridge', () => ({
            command: 'delegate-poll',
            args: ['--handle', '{handle_id}', '--result', '{result_path}'],
        }));
        mock.method(deps, 'saveHallOneMindRequest', (record: Record<string, unknown>) => {
            savedRequests.push(record);
        });

        const result = await weave.execute({
            weave_id: 'weave:research',
            payload: { intent: 'test', subquestions: ['alpha', 'beta'], cwd: '.', project_root: '.' }
        } as any, {
            workspace_root: '.',
            env: { CODEX_SHELL: '1' },
            bead_id: 'activation:research:1',
            trace_id: 'trace-research-queued',
            mission_id: 'mission-research-queued',
        } as any);

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(savedRequests.length, 2);
        assert.equal(savedRequests[0]?.boundary, 'subagent');
        assert.equal(savedRequests[0]?.request_status, 'PENDING');
        assert.equal(savedRequests[0]?.metadata?.activation_id, 'activation:research:1');
        assert.equal(savedRequests[0]?.metadata?.branch_group_id, 'research:trace-research-queued:test');
        mock.reset();
    });
});
