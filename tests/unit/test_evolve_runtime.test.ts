import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvolveInvocation } from '../../src/node/core/commands/dispatcher.ts';
import { EvolveWeave } from '../../src/node/core/runtime/weaves/evolve.ts';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.ts';

const workspaceRoot = 'C:\\Users\\Craig\\Corvus\\CorvusStar';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-EVOLVE',
        trace_id: 'TRACE-EVOLVE',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        env: {},
        timestamp: Date.now(),
    };
}

function createCliTarget() {
    return {
        domain: 'brain' as const,
        workspace_root: workspaceRoot,
        requested_path: workspaceRoot,
    };
}

function createCliSession() {
    return {
        mode: 'cli' as const,
        interactive: true,
    };
}

describe('Evolve skill promotion (CS-P7-07)', () => {
    it('builds a canonical evolve invocation from CLI flags', () => {
        assert.deepEqual(
            buildEvolveInvocation(
                ['--bead-id', 'bead-1', '--dry-run', '--focus-axis', 'logic'],
                workspaceRoot,
                workspaceRoot,
            ),
            {
                weave_id: 'weave:evolve',
                payload: {
                    action: 'propose',
                    bead_id: 'bead-1',
                    dry_run: true,
                    simulate: true,
                    focus_axes: ['logic'],
                    project_root: workspaceRoot,
                    cwd: workspaceRoot,
                    source: 'cli',
                },
                target: createCliTarget(),
                session: createCliSession(),
            },
        );
    });

    it('returns a structured evolve result from the runtime weave', async () => {
        const weave = new EvolveWeave((async () => ({
            stdout: JSON.stringify({
                status: 'SUCCESS',
                summary: 'Simulated evolve candidate accepted for proposal staging.',
                proposal_id: 'proposal:test',
                proposal_status: 'VALIDATED',
                validation_id: 'validation:test',
                proposal_path: '.agents/proposals/evolve/proposal.json',
                contract_path: '.agents/skills/evolve/contract.json',
                promotion_outcome: 'PROPOSAL_READY',
            }),
        })) as any);

        const result = await weave.execute(
            {
                weave_id: 'weave:evolve',
                payload: {
                    bead_id: 'bead-1',
                    dry_run: true,
                    simulate: true,
                    project_root: workspaceRoot,
                    cwd: workspaceRoot,
                    source: 'cli',
                },
            },
            createContext(workspaceRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.proposal_id, 'proposal:test');
        assert.equal(result.metadata?.proposal_status, 'VALIDATED');
        assert.equal(result.metadata?.promotion_outcome, 'PROPOSAL_READY');
    });

    it('builds a promotion invocation from CLI flags', () => {
        assert.deepEqual(
            buildEvolveInvocation(
                ['--promote', '--proposal-id', 'proposal:test'],
                workspaceRoot,
                workspaceRoot,
            ),
            {
                weave_id: 'weave:evolve',
                payload: {
                    action: 'promote',
                    proposal_id: 'proposal:test',
                    project_root: workspaceRoot,
                    cwd: workspaceRoot,
                    source: 'cli',
                    simulate: true,
                },
                target: createCliTarget(),
                session: createCliSession(),
            },
        );
    });
});
