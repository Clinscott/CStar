import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SovereignBead } from '../../../../src/types/bead.js';
import type { RuntimeContext } from '../../../../src/node/core/runtime/contracts.js';
import { OrchestrateWeave } from '../../../../src/node/core/runtime/weaves/orchestrate.js';
import {
    persistDurableWorkTransition,
    resolveExecutionRoute,
} from '../../../../src/node/core/runtime/weaves/orchestrate_transitions.js';

function bead(overrides: Partial<SovereignBead> = {}): SovereignBead {
    return {
        id: 'bead:test:orchestrate',
        repo_id: 'repo:test',
        scan_id: 'scan:test',
        target_kind: 'OTHER',
        rationale: 'Build the bounded implementation.',
        contract_refs: [],
        baseline_scores: {},
        status: 'SET',
        assigned_agent: 'ORIGINAL-ASSIGNEE',
        created_at: 1,
        updated_at: 1,
        ...overrides,
    };
}

const context: RuntimeContext = {
    mission_id: 'mission:test',
    bead_id: 'bead:test:orchestrate',
    trace_id: 'trace:test',
    persona: '',
    workspace_root: '/synthetic/project',
    operator_mode: 'subkernel',
    target_domain: 'brain',
    interactive: false,
    env: {},
    timestamp: 123,
};

describe('Retired Orchestrate compatibility boundary', () => {
    it('keeps route classification pure and names the durable kernel request', () => {
        assert.equal(resolveExecutionRoute(bead({ target_path: 'src/example.ts' })), 'cstar_forge_request');
        assert.equal(
            resolveExecutionRoute(bead({ rationale: 'Research evidence for a decision.' })),
            'cstar_researcher_request',
        );
        assert.equal(
            resolveExecutionRoute(bead({ rationale: 'Continue.', target_ref: 'opaque:thing' })),
            'FAIL_CLOSED',
        );
    });

    it('fails the retired entrypoint without dispatch or mutation', async () => {
        let dispatchCount = 0;
        const weave = new OrchestrateWeave({
            dispatch: async () => {
                dispatchCount += 1;
                throw new Error('dispatch must not run');
            },
        });
        const result = await weave.execute({
            weave_id: 'weave:orchestrate',
            payload: {
                project_root: '/synthetic/project',
                cwd: '/synthetic/project',
                bead_ids: ['bead:test:orchestrate'],
            },
        }, context);

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, 'legacy_orchestrate_weave_retired_use_cstar_kernel');
        assert.equal(dispatchCount, 0);
        assert.equal(result.metadata?.required_surface, 'cstar-kernel');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });

    it('rejects the former direct-Hall transition helper', () => {
        assert.throws(
            () => persistDurableWorkTransition({
                bead: bead({ target_path: 'src/example.ts' }),
                repoId: 'repo:test',
            }),
            /legacy_orchestrate_transition_retired_use_cstar_kernel/,
        );
    });
});
