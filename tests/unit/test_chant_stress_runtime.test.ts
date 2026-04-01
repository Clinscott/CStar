import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ChantWeave } from  '../../src/node/core/runtime/host_workflows/chant.js';
import { deps as plannerDeps } from '../../src/node/core/runtime/host_workflows/chant_planner.ts';
import type { RuntimeContext, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import {
    closeDb,
    getHallBeads,
    getHallPlanningSession,
    listHallPlanningSessions,
    listHallSkillProposals,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

type ChantStressScenario = {
    key: string;
    beadCount: number;
    artifactCount: number;
};

const STRESS_SCENARIOS: ChantStressScenario[] = [
    { key: 'scratch', beadCount: 1, artifactCount: 2 },
    { key: 'medium', beadCount: 3, artifactCount: 4 },
    { key: 'heavy', beadCount: 5, artifactCount: 6 },
];

function resolveScenario(intent: string): ChantStressScenario {
    const lowered = intent.toLowerCase();
    if (lowered.includes('heavy')) {
        return STRESS_SCENARIOS[2];
    }
    if (lowered.includes('medium')) {
        return STRESS_SCENARIOS[1];
    }
    return STRESS_SCENARIOS[0];
}

class StressPlanningDispatchPort implements RuntimeDispatchPort {
    public readonly invocations: string[] = [];

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocations.push(invocation.weave_id);

        if (invocation.weave_id === 'weave:research') {
            const intent = String((invocation.payload as { intent?: unknown }).intent ?? '');
            const scenario = resolveScenario(intent);
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: `Research complete for ${scenario.key} planning.`,
                metadata: {
                    research_payload: {
                        summary: `Research complete for ${scenario.key} planning.`,
                        research_artifacts: Array.from({ length: scenario.artifactCount }, (_unused, index) =>
                            `${scenario.key}/artifact-${index + 1}.md`),
                    },
                    research_artifacts: Array.from({ length: scenario.artifactCount }, (_unused, index) =>
                        `${scenario.key}/artifact-${index + 1}.md`),
                },
            };
        }

        throw new Error(`Unexpected weave dispatch in chant stress test: ${invocation.weave_id}`);
    }
}

function createContext(workspaceRoot: string, traceId: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT-STRESS',
        trace_id: traceId,
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Chant stress progression (CS-P7-03)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-stress-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                skills: {
                    chant: { entrypoint_path: '.agents/skills/chant/scripts/chant.py' },
                },
            }),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        mock.reset();
        closeDb();
    });

    it('scales from scratch planning to heavier multi-bead workloads without corrupting Hall state', async () => {
        const dispatchPort = new StressPlanningDispatchPort();
        mock.method(plannerDeps, 'executeArchitectService', async (payload: Record<string, unknown>) => {
            const intent = String(payload.intent ?? '');
            const scenario = resolveScenario(intent);
            return {
                weave_id: 'weave:architect',
                status: 'SUCCESS',
                output: `Architect proposal ready for ${scenario.key} planning.`,
                metadata: {
                    architect_proposal: {
                        proposal_summary: `Build the ${scenario.key} chant workload with explicit validation.`,
                        beads: Array.from({ length: scenario.beadCount }, (_unused, index) => ({
                            id: `${scenario.key}-bead-${index + 1}`,
                            title: `${scenario.key} chant bead ${index + 1}`,
                            rationale: `Implement ${scenario.key} workload slice ${index + 1}.`,
                            targets: [
                                `src/${scenario.key}/module_${index + 1}.ts`,
                                `tests/${scenario.key}/test_module_${index + 1}.ts`,
                            ],
                            depends_on: index === 0 ? [] : [`${scenario.key}-bead-${index}`],
                            acceptance_criteria: [
                                `Implement ${scenario.key} workload slice ${index + 1}.`,
                                `Validation for ${scenario.key} workload slice ${index + 1} passes.`,
                            ],
                            checker_shell: `node --test tests/${scenario.key}/test_module_${index + 1}.ts`,
                        })),
                    },
                },
            };
        });
        const chant = new ChantWeave(dispatchPort);
        const runs = [
            {
                query: 'Plan a scratch chant workload for a tiny utility.',
                traceId: 'TRACE-CHANT-STRESS-SCRATCH',
                scenario: STRESS_SCENARIOS[0],
            },
            {
                query: 'Plan a medium chant workload for mounted repo validation and orchestration.',
                traceId: 'TRACE-CHANT-STRESS-MEDIUM',
                scenario: STRESS_SCENARIOS[1],
            },
            {
                query: 'Plan a heavy chant workload for multi-spoke validation, telemetry, and host governor review.',
                traceId: 'TRACE-CHANT-STRESS-HEAVY',
                scenario: STRESS_SCENARIOS[2],
            },
        ];

        for (const run of runs) {
            const result = await chant.execute(
                {
                    weave_id: 'weave:chant',
                    payload: {
                        query: run.query,
                        project_root: tmpRoot,
                        cwd: tmpRoot,
                        source: 'cli',
                    },
                    target: {
                        domain: 'brain',
                        workspace_root: tmpRoot,
                        requested_path: tmpRoot,
                    },
                    session: {
                        mode: 'cli',
                        interactive: true,
                    },
                },
                createContext(tmpRoot, run.traceId),
            );

            assert.equal(result.status, 'TRANSITIONAL');
            assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');

            const sessionId = String(result.metadata?.planning_session_id);
            const session = getHallPlanningSession(sessionId);
            assert.ok(session);
            assert.equal(session?.status, 'PROPOSAL_REVIEW');
            assert.ok(session?.current_bead_id?.includes(`${run.scenario.key}-bead-1`));
            assert.equal((session?.metadata?.bead_ids as unknown[] | undefined)?.length, run.scenario.beadCount);
            assert.equal((session?.metadata?.proposal_ids as unknown[] | undefined)?.length, run.scenario.beadCount);
            assert.match(result.output, /mark it SET/i);
        }

        assert.deepStrictEqual(dispatchPort.invocations, [
            'weave:research',
            'weave:research',
            'weave:research',
        ]);

        const sessions = listHallPlanningSessions(tmpRoot);
        assert.equal(sessions.length, 3);
        assert.deepStrictEqual(
            sessions.map((session) => session.status),
            ['PROPOSAL_REVIEW', 'PROPOSAL_REVIEW', 'PROPOSAL_REVIEW'],
        );

        const proposals = listHallSkillProposals(tmpRoot, { skill_id: 'chant' });
        const expectedProposalCount = STRESS_SCENARIOS.reduce((sum, scenario) => sum + scenario.beadCount, 0);
        assert.equal(proposals.length, expectedProposalCount);
        assert.ok(proposals.every((proposal) => proposal.status === 'PROPOSED'));
        assert.ok(proposals.every((proposal) => typeof proposal.metadata?.checker_shell === 'string'));

        const beads = getHallBeads(tmpRoot);
        assert.equal(beads.length, expectedProposalCount);
        assert.ok(beads.every((bead) => bead.status === 'OPEN'));
        assert.ok(beads.every((bead) => typeof bead.checker_shell === 'string' && bead.checker_shell.includes('node --test')));

        const heavyBeads = beads.filter((bead) => bead.id.includes('heavy-bead-'));
        assert.equal(heavyBeads.length, STRESS_SCENARIOS[2].beadCount);
    });
});
