import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvolveInvocation } from '../../src/node/core/commands/dispatcher.ts';
import { EvolveWeave } from '../../src/node/core/runtime/weaves/evolve.ts';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.ts';

const workspaceRoot = 'C:\\Users\\Craig\\Corvus\\CorvusStar';
const spokeRoot = 'C:\\estate\\KeepOS';

function createContext(workspaceRoot: string, targetDomain: RuntimeContext['target_domain'] = 'brain'): RuntimeContext {
    return {
        mission_id: 'MISSION-EVOLVE',
        trace_id: 'TRACE-EVOLVE',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: targetDomain === 'spoke' ? 'subkernel' : 'cli',
        target_domain: targetDomain,
        interactive: targetDomain !== 'spoke',
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

    it('can target a mounted spoke from CLI flags', () => {
        assert.deepEqual(
            buildEvolveInvocation(
                ['--spoke', 'keepos', '--bead-id', 'bead-1'],
                workspaceRoot,
                workspaceRoot,
            ),
            {
                weave_id: 'weave:evolve',
                payload: {
                    action: 'propose',
                    bead_id: 'bead-1',
                    project_root: workspaceRoot,
                    cwd: workspaceRoot,
                    source: 'cli',
                    simulate: true,
                },
                target: {
                    domain: 'spoke',
                    workspace_root: workspaceRoot,
                    requested_path: 'spoke://keepos/',
                    spoke: 'keepos',
                },
                session: createCliSession(),
            },
        );
    });

    it('returns a structured evolve result from the runtime weave', async () => {
        const calls: Array<{ command: string; args: string[]; cwd?: string; pythonPath?: string }> = [];
        const weave = new EvolveWeave((async (command: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined> }) => {
            calls.push({
                command,
                args,
                cwd: options.cwd,
                pythonPath: options.env?.PYTHONPATH,
            });
            return {
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
            };
        }) as any);

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
            createContext(spokeRoot, 'spoke'),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.proposal_id, 'proposal:test');
        assert.equal(result.metadata?.proposal_status, 'VALIDATED');
        assert.equal(result.metadata?.promotion_outcome, 'PROPOSAL_READY');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].args[0], path.join(workspaceRoot, '.agents', 'skills', 'evolve', 'scripts', 'evolve.py'));
        assert.equal(calls[0].args[1], '--project-root');
        assert.equal(calls[0].args[2], spokeRoot);
        assert.equal(calls[0].cwd, workspaceRoot);
        assert.equal(calls[0].pythonPath, workspaceRoot);
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
