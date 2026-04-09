import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SkillBead } from '../../src/node/core/skills/types.js';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { UniversalAdapter } from '../../src/node/core/runtime/universal_adapter.js';

describe('Skill Runtime Contract (CS-P1-01)', () => {
    const manager = RuntimeDispatcher.createIsolated();
    const mockAdapter = {
        id: 'mock_skill',
        async execute() {
            return {
                weave_id: 'mock_skill',
                status: 'SUCCESS' as const,
                output: 'Mock adapter execution successful.',
                metadata: {},
            };
        },
    };

    it('should register a new skill adapter', () => {
        manager.registerAdapter(mockAdapter as any);
        const adapters = manager.listAdapterIds();
        assert.ok(adapters.includes('mock_skill'));
    });

    it('should dispatch a bead to the correct skill adapter', async () => {
        const bead: SkillBead = {
            id: 'bead_001',
            skill_id: 'mock_skill',
            target_path: 'src/mock.ts',
            intent: 'Validate the runtime spine.',
            params: {},
            status: 'PENDING',
            priority: 1
        };

        const result = await manager.dispatch(bead);
        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output.includes('Mock adapter execution successful.'));
    });

    it('should fail gracefully for unknown skills', async () => {
        const bead: SkillBead = {
            id: 'bead_002',
            skill_id: 'unknown_skill',
            target_path: 'src/mock.ts',
            intent: 'Expect a failure.',
            params: {},
            status: 'PENDING',
            priority: 1
        };

        const result = await manager.dispatch(bead);
        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('unable to resolve'));
    });

    it('should refuse to execute host-workflow entries through the universal adapter', async () => {
        const hostWorkflowAdapter = new UniversalAdapter('mock_host_workflow', {
            tier: 'WEAVE',
            description: 'Host-native workflow record',
            execution: {
                mode: 'agent-native',
                cli: 'echo should-not-run',
                ownership_model: 'host-workflow',
            },
        });

        const result = await hostWorkflowAdapter.execute({
            weave_id: 'mock_host_workflow',
            payload: {},
        }, {
            mission_id: 'MISSION-1',
            bead_id: 'bead-1',
            trace_id: 'trace-1',
            persona: 'ODIN',
            workspace_root: process.cwd(),
            operator_mode: 'subkernel',
            target_domain: 'brain',
            interactive: false,
            env: process.env,
            timestamp: Date.now(),
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('must not execute'));
        assert.equal(result.metadata?.ownership_model, 'host-workflow');
    });

    it('should refuse direct universal-adapter execution for agent-native entries even when a cli is present', async () => {
        const agentNativeAdapter = new UniversalAdapter('mock_agent_native', {
            tier: 'SKILL',
            description: 'Legacy agent-native cli record',
            execution: {
                mode: 'agent-native',
                cli: 'echo should-not-run',
            },
        });

        const result = await agentNativeAdapter.execute({
            weave_id: 'mock_agent_native',
            payload: { query: 'test' },
        }, {
            mission_id: 'MISSION-1',
            bead_id: 'bead-1',
            trace_id: 'trace-1',
            persona: 'ODIN',
            workspace_root: process.cwd(),
            operator_mode: 'subkernel',
            target_domain: 'brain',
            interactive: false,
            env: process.env,
            timestamp: Date.now(),
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('cataloged as agent-native'));
        assert.equal(result.metadata?.execution_boundary, 'host-native-required');
        assert.equal(result.metadata?.execution_mode, 'agent-native');
        assert.equal(result.metadata?.ownership_model, 'agent-native');
    });
});
