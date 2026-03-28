import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeContext, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../../../src/node/core/runtime/contracts.ts';
import { OrchestrateWeave, resolveExecutionRoute, selectPlanningSessionBeadIds } from '../../../../src/node/core/runtime/weaves/orchestrate.js';
import {
    closeDb,
    getDb,
    getHallBead,
    getHallPlanningSession,
    listHallSkillActivations,
    saveHallPlanningSession,
    upsertHallBead,
} from '../../../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../src/types/hall.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-ORCHESTRATE',
        bead_id: 'BEAD-ORCHESTRATE',
        trace_id: 'TRACE-ORCHESTRATE',
        persona: 'O.D.I.N.',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Orchestrate weave planning session routing', () => {
    let tmpRoot: string;
    let repoId: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-orchestrate-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        registry.setRoot(tmpRoot);
        closeDb();
        getDb(tmpRoot);
        repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
    });

    afterEach(() => {
        closeDb();
    });

    class CaptureDispatchPort implements RuntimeDispatchPort {
        public invocations: Array<WeaveInvocation<unknown> | Record<string, unknown>> = [];

        public async dispatch<T>(invocation: WeaveInvocation<T> | Record<string, unknown>): Promise<WeaveResult> {
            this.invocations.push(invocation as WeaveInvocation<unknown>);
            return {
                weave_id: 'weave_id' in invocation ? invocation.weave_id : String((invocation as any).skill_id ?? 'skill'),
                status: 'SUCCESS',
                output: 'ok',
                metadata: {},
            };
        }
    }

    it('prefers the active released planning session bead graph over unrelated SET beads', async () => {
        const now = Date.now();
        const sessionId = 'chant-session:orchestrate-routing';
        const selectedBeadId = 'bead:phase-scheduler-core';
        const unrelatedBeadId = 'bead:legacy-backlog';

        upsertHallBead({
            bead_id: unrelatedBeadId,
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/legacy.ts',
            rationale: 'Unrelated backlog bead.',
            status: 'SET',
            created_at: now,
            updated_at: now,
        } as any);

        upsertHallBead({
            bead_id: selectedBeadId,
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'Released scheduler bead.',
            status: 'SET',
            created_at: now + 1,
            updated_at: now + 1,
        } as any);

        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'Route execution through the released scheduler plan.',
            normalized_intent: 'route execution through the released scheduler plan',
            summary: 'Scheduler plan is released for execution.',
            created_at: now,
            updated_at: now + 2,
            metadata: {
                bead_ids: [selectedBeadId],
            },
        });

        const planningSelection = selectPlanningSessionBeadIds(tmpRoot, [ 
            { id: unrelatedBeadId, status: 'SET' } as any,
            { id: selectedBeadId, status: 'SET' } as any,
        ]);

        assert.equal(planningSelection.planningSession?.session_id, sessionId);
        assert.deepEqual(planningSelection.beadIds, [selectedBeadId]);

        const weave = new OrchestrateWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:orchestrate',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    dry_run: true,
                    limit: 1,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.planning_session_id, sessionId);
        assert.deepEqual(result.metadata?.selected_bead_ids, [selectedBeadId]);
        assert.match(result.output, new RegExp(selectedBeadId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

        const updatedSession = getHallPlanningSession(sessionId);
        assert.equal(updatedSession?.status, 'FORGE_EXECUTION');
        assert.deepEqual(updatedSession?.metadata?.active_execution_bead_ids, [selectedBeadId]);
    });

    it('shatters session-backed parent beads into ONE-MIND children and stitches them into the planning session', async () => {
        const now = Date.now();
        const sessionId = 'chant-session:parent-shatter';
        const parentBeadId = 'bead-hall-proposal-state-refresh';

        upsertHallBead({
            bead_id: parentBeadId,
            repo_id: repoId,
            target_kind: 'FILE',
            target_ref: sessionId,
            target_path: 'src/node/core/runtime/hall/*',
            rationale: 'Refresh Hall proposal state as a coordination parent bead.',
            checker_shell: 'node --test tests/unit/node-runtime/weaves/test_orchestrate.test.ts',
            status: 'SET',
            created_at: now,
            updated_at: now,
        } as any);

        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'Run the Hall refresh parent bead through orchestrate.',
            normalized_intent: 'run the hall refresh parent bead through orchestrate',
            summary: 'Parent bead is released.',
            created_at: now,
            updated_at: now + 1,
            metadata: {
                bead_ids: [parentBeadId],
            },
        });

        assert.equal(resolveExecutionRoute({
            id: parentBeadId,
            target_kind: 'FILE',
            target_ref: sessionId,
            target_path: 'src/node/core/runtime/hall/*',
            checker_shell: 'node --test tests/unit/node-runtime/weaves/test_orchestrate.test.ts',
        } as any), 'ONE-MIND');

        const weave = new OrchestrateWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:orchestrate',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    limit: 1,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');

        const updatedParent = getHallBead(parentBeadId);
        assert.equal(updatedParent?.status, 'IN_PROGRESS');

        const architectureChild = getHallBead(`${parentBeadId}:child:architecture`);
        const ledgerChild = getHallBead(`${parentBeadId}:child:ledger`);
        assert.equal(architectureChild?.status, 'SET');
        assert.equal(ledgerChild?.status, 'SET');
        assert.equal(architectureChild?.assigned_agent, 'ONE-MIND');
        assert.equal(ledgerChild?.assigned_agent, 'ONE-MIND');
        assert.equal(architectureChild?.target_ref, parentBeadId);
        assert.equal(ledgerChild?.target_ref, parentBeadId);

        const updatedSession = getHallPlanningSession(sessionId);
        assert.equal(updatedSession?.status, 'FORGE_EXECUTION');
        assert.deepEqual(updatedSession?.metadata?.bead_ids, [
            parentBeadId,
            `${parentBeadId}:child:architecture`,
            `${parentBeadId}:child:ledger`,
        ]);
    });

    it('prefers existing child beads and suppresses already-sharded parents', () => {
        const now = Date.now();
        const sessionId = 'chant-session:reshatter-guard';
        const parentBeadId = 'bead-review-recovery-loop';
        const architectureChildId = `${parentBeadId}:child:architecture`;
        const ledgerChildId = `${parentBeadId}:child:ledger`;

        upsertHallBead({
            bead_id: parentBeadId,
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: sessionId,
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'Parent bead drifted back to SET and must not reshatter.',
            status: 'SET',
            created_at: now,
            updated_at: now,
        } as any);

        upsertHallBead({
            bead_id: architectureChildId,
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: parentBeadId,
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'Architecture child remains ready.',
            status: 'SET',
            assigned_agent: 'ONE-MIND',
            created_at: now + 1,
            updated_at: now + 1,
        } as any);

        upsertHallBead({
            bead_id: ledgerChildId,
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: parentBeadId,
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'Ledger child remains ready.',
            status: 'SET',
            assigned_agent: 'ONE-MIND',
            created_at: now + 2,
            updated_at: now + 2,
        } as any);

        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FORGE_EXECUTION',
            user_intent: 'Continue execution without reshattering.',
            normalized_intent: 'continue execution without reshattering',
            summary: 'Children are ready; parent is already sharded.',
            created_at: now,
            updated_at: now + 3,
            metadata: {
                bead_ids: [parentBeadId, architectureChildId, ledgerChildId],
                sharded_parent_bead_ids: [parentBeadId],
            },
        });

        const planningSelection = selectPlanningSessionBeadIds(tmpRoot, [
            { id: parentBeadId, status: 'SET' } as any,
            { id: architectureChildId, status: 'SET' } as any,
            { id: ledgerChildId, status: 'SET' } as any,
        ]);

        assert.equal(planningSelection.planningSession?.session_id, sessionId);
        assert.deepEqual(planningSelection.beadIds, [architectureChildId, ledgerChildId]);
    });

    it('dispatches a released child bead as a skill activation and records it in Hall', async () => {
        const now = Date.now();
        const sessionId = 'chant-session:one-mind-child';
        const beadId = 'bead-review-recovery-loop:child:architecture';
        const dispatchPort = new CaptureDispatchPort();

        upsertHallBead({
            bead_id: beadId,
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: 'bead-review-recovery-loop',
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'ONE-MIND child bead.',
            status: 'SET',
            assigned_agent: 'ONE-MIND',
            created_at: now,
            updated_at: now,
        } as any);

        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FORGE_EXECUTION',
            user_intent: 'Continue execution under the active plan.',
            normalized_intent: 'continue execution under the active plan',
            summary: 'ONE-MIND child is ready.',
            created_at: now,
            updated_at: now + 1,
            metadata: {
                bead_ids: [beadId],
            },
        });

        const weave = new OrchestrateWeave(dispatchPort);
        const result = await weave.execute(
            {
                weave_id: 'weave:orchestrate',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    limit: 1,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                    session_id: 'cli-session',
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(dispatchPort.invocations.length, 1);
        assert.equal((dispatchPort.invocations[0] as any)?.skill_id, 'research');
        assert.equal((dispatchPort.invocations[0] as any)?.target_path, 'src/node/core/runtime/weaves/orchestrate.ts');
        assert.equal((dispatchPort.invocations[0] as any)?.params?.project_root, tmpRoot);
        assert.equal((dispatchPort.invocations[0] as any)?.params?.cwd, tmpRoot);

        const activations = listHallSkillActivations(tmpRoot, { session_id: sessionId });
        assert.equal(activations.length, 1);
        assert.equal(activations[0]?.bead_id, beadId);
        assert.equal(activations[0]?.skill_id, 'research');
        assert.equal(activations[0]?.adapter_id, 'weave:research');
        assert.equal(activations[0]?.status, 'COMPLETED');
    });
});
