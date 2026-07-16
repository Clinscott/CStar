import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HostGovernorWeave } from '../../src/node/core/runtime/weaves/host_governor.js';
import {
    evaluateCandidates,
    governReplannedSession,
    triggerBlockedBeadReplan,
} from '../../src/node/core/runtime/weaves/host_governor_governance.js';

const context = {
    mission_id: 'mission:retired-governor',
    bead_id: 'bead:retired-governor',
    trace_id: 'trace:retired-governor',
    persona: '',
    workspace_root: '/synthetic/project',
    operator_mode: 'subkernel',
    target_domain: 'brain',
    interactive: false,
    env: { CODEX_SHELL: '1' },
    timestamp: 123,
} as const;

describe('Retired HostGovernor compatibility boundary', () => {
    it('fails before provider, dispatch, or Hall activity', async () => {
        let dispatchCalls = 0;
        let providerCalls = 0;
        const weave = new HostGovernorWeave(
            {
                dispatch: async () => {
                    dispatchCalls += 1;
                    throw new Error('dispatch must not run');
                },
            },
            async () => {
                providerCalls += 1;
                return '{}';
            },
        );

        const result = await weave.execute({
            weave_id: 'weave:host-governor',
            payload: {
                task: 'Resume autonomous work.',
                auto_execute: true,
                auto_replan_blocked: true,
                project_root: '/synthetic/project',
                cwd: '/synthetic/project',
            },
        }, context as any);

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, 'legacy_host_governor_retired_use_cstar_kernel');
        assert.equal(dispatchCalls, 0);
        assert.equal(providerCalls, 0);
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
        assert.equal(result.metadata?.automatic_replan_started, false);
        assert.equal(result.metadata?.automatic_promotion_started, false);
    });

    it('keeps former governance helpers as deterministic tombstones', async () => {
        await assert.rejects(evaluateCandidates(), /retired_use_cstar_kernel/);
        await assert.rejects(triggerBlockedBeadReplan(), /retired_use_cstar_kernel/);
        await assert.rejects(governReplannedSession(), /retired_use_cstar_kernel/);
    });
});
