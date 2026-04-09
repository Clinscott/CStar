import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ChantWeave, deps } from  '../../../../src/node/core/runtime/host_workflows/chant.js';
import { WeaveResult } from  '../../../../src/node/core/runtime/contracts.js';

describe('ChantWeave Unit Tests', () => {
    it('initializes correctly', () => {
        const dispatchPort: any = {};
        const weave = new ChantWeave(dispatchPort);
        assert.equal(weave.id, 'weave:chant');
    });

    it('resolves a direct weave and executes it via dispatch port', async () => {
        const mockDispatchPort = {
            dispatch: mock.fn(async () => ({
                weave_id: 'weave:start',
                status: 'SUCCESS',
                output: 'Started'
            }))
        };
        const weave = new ChantWeave(mockDispatchPort as any);

        mock.method(deps.parser, 'normalizeIntent', (q: string) => q);
        mock.method(deps.parser, 'tokenize', (q: string) => [q]);
        mock.method(deps.parser, 'loadSkillTriggers', () => new Set());
        mock.method(deps.parser, 'resolveBuiltInWeave', () => ({
            kind: 'built_in',
            trigger: 'start',
            summary: 'Starting...',
            invocation: { weave_id: 'weave:start', payload: {} }
        }));
        mock.method(deps.database, 'saveHallSkillObservation', () => {});

        const result = await weave.execute({
            weave_id: 'weave:chant',
            payload: { query: 'start', cwd: '.' }
        }, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Starting... Started');
        assert.equal(mockDispatchPort.dispatch.mock.callCount(), 1);
        mock.reset();
    });

    it('handles missing capability', async () => {
        const weave = new ChantWeave({} as any);

        mock.method(deps.parser, 'normalizeIntent', (q: string) => q);
        mock.method(deps.parser, 'tokenize', (q: string) => [q]);
        mock.method(deps.parser, 'loadSkillTriggers', () => new Set());
        mock.method(deps.parser, 'resolveBuiltInWeave', () => null);
        mock.method(deps.parser, 'resolveSkillInvocation', () => ({
            kind: 'missing_capability',
            trigger: 'void',
            summary: 'Void skill not found'
        }));
        mock.method(deps.database, 'saveHallSkillObservation', () => {});

        const result = await weave.execute({
            weave_id: 'weave:chant',
            payload: { query: 'use void', cwd: '.' }
        }, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, 'Void skill not found');
        mock.reset();
    });

    it('delegates to runPlanningLoop when no direct resolution is found', async () => {
        const weave = new ChantWeave({} as any);

        mock.method(deps.parser, 'normalizeIntent', (q: string) => q);
        mock.method(deps.parser, 'tokenize', (q: string) => [q]);
        mock.method(deps.parser, 'loadSkillTriggers', () => new Set());
        mock.method(deps.parser, 'resolveBuiltInWeave', () => null);
        mock.method(deps.parser, 'resolveSkillInvocation', () => null);
        mock.method(deps.database, 'getHallPlanningSession', () => null);
        
        mock.method(deps.planner, 'runPlanningLoop', async (): Promise<WeaveResult> => ({
            weave_id: 'weave:chant',
            status: 'SUCCESS',
            output: 'Planned successfully'
        }));

        const result = await weave.execute({
            weave_id: 'weave:chant',
            payload: { query: 'complex intent', cwd: '.' }
        }, { workspace_root: '.', env: {} } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Planned successfully');
        mock.reset();
    });

    it('lets the host force the planning loop before intent-category fallback', async () => {
        const weave = new ChantWeave({} as any);
        let capturedRequest: any;

        mock.method(deps.parser, 'normalizeIntent', (q: string) => q);
        mock.method(deps.parser, 'tokenize', () => ['repair', 'the', 'runtime']);
        mock.method(deps.parser, 'loadSkillTriggers', () => new Set());
        mock.method(deps.parser, 'loadRegistryManifest', () => ({ entries: {} }));
        mock.method(deps.parser, 'resolveBuiltInWeave', () => null);
        mock.method(deps.parser, 'resolveRegistryInvocation', () => null);
        mock.method(deps.parser, 'resolveSkillInvocation', () => null);
        const intentFallback = mock.fn(() => ({
            kind: 'intent_category',
            trigger: 'restoration',
            summary: 'Fallback restoration',
            invocation: { weave_id: 'weave:restoration', payload: {} },
        }));
        mock.method(deps.parser, 'resolveByIntentCategory', intentFallback);
        mock.method(deps.database, 'getHallPlanningSession', () => null);
        mock.method(deps, 'hostTextInvoker', async (request) => {
            capturedRequest = request;
            return JSON.stringify({
                prefer_planning: true,
                reason: 'Needs decomposition',
            });
        });
        mock.method(deps.planner, 'runPlanningLoop', async (): Promise<WeaveResult> => ({
            weave_id: 'weave:chant',
            status: 'SUCCESS',
            output: 'Planned by host preference',
        }));

        const result = await weave.execute({
            weave_id: 'weave:chant',
            payload: { query: 'repair the runtime', cwd: '.', project_root: '.' },
        }, {
            workspace_root: '.',
            env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            session_id: undefined,
        } as any);

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.output, 'Planned by host preference');
        assert.equal(intentFallback.mock.callCount(), 0);
        assert.equal(capturedRequest?.metadata?.trace_critical, true);
        assert.equal(capturedRequest?.metadata?.require_agent_harness, true);
        assert.equal(capturedRequest?.metadata?.transport_mode, 'host_session');
        mock.reset();
    });
});
