import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RavensCycleWeave, RavensStageContractAdapter } from '../../src/node/core/runtime/weaves/ravens_cycle.ts';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.ts';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-RAVENS-CYCLE',
        trace_id: 'TRACE-RAVENS-CYCLE',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Ravens cycle contract freeze (CS-P3-00)', () => {
    it('returns a structured cycle result from the runtime weave', async () => {
        const weave = new RavensCycleWeave((async () => ({
            stdout: JSON.stringify({
                status: 'SUCCESS',
                summary: 'Ravens cycle completed.',
                mission_id: 'ravens-cycle:test',
                stages: [
                    { stage: 'memory', status: 'SUCCESS', summary: 'Memory done.' },
                    { stage: 'hunt', status: 'SUCCESS', summary: 'Target selected.' },
                ],
            }),
        })) as any);

        const result = await weave.execute(
            {
                weave_id: 'weave:ravens-cycle',
                payload: {
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                },
            },
            createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal((result.metadata?.cycle_result as any)?.mission_id, 'ravens-cycle:test');
        assert.equal((result.metadata?.cycle_result as any)?.stages[0].stage, 'memory');
    });

    it('publishes transitional stage contracts under stable weave ids', async () => {
        const adapter = new RavensStageContractAdapter('hunt');
        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens-hunt',
                payload: {
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    target: {
                        target_kind: 'FILE',
                        target_path: 'src/core/sample.py',
                    },
                },
            },
            createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal((result.metadata?.stage_result as any)?.stage, 'hunt');
        assert.equal((result.metadata?.stage_result as any)?.target.target_path, 'src/core/sample.py');
    });
});
