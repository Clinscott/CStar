import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ChantWeave } from  '../../src/node/core/runtime/weaves/chant.js';
import type { RuntimeDispatchPort, RuntimeContext, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import { closeDb, getHallPlanningSession, saveHallOneMindBranch, saveHallPlanningSession } from  '../../src/tools/pennyone/intel/database.js';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../src/types/hall.js';

class NoopDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
            metadata: {},
        };
    }
}

class InspectPlanningDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        const sessionId = 'chant-session:TRACE-PLAN';
        if (invocation.weave_id === 'weave:research') {
            const session = getHallPlanningSession(sessionId);
            assert.ok(session);
            assert.equal(session?.status, 'INTENT_RECEIVED');
            assert.match(session?.summary ?? '', /Initiating Research Phase/i);
            assert.equal(session?.metadata?.phase_in_flight, 'weave:research');
            const workspaceRoot = String((invocation.payload as { project_root?: string }).project_root);

            const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));
            const now = Date.now();
            saveHallOneMindBranch({
                branch_id: 'research:TRACE-PLAN:bounded-runtime-improvement:0',
                repo_id: repoId,
                source_weave: 'weave:research',
                branch_group_id: 'research:TRACE-PLAN:bounded-runtime-improvement',
                branch_kind: 'research',
                branch_label: 'layout',
                branch_index: 0,
                status: 'COMPLETED',
                provider: 'codex',
                trace_id: 'TRACE-PLAN',
                summary: 'Layout findings stay bounded.',
                artifacts: ['README.md'],
                metadata: {
                    intent: 'plan a bounded runtime improvement',
                    branch_count: 2,
                },
                created_at: now,
                updated_at: now,
            }, workspaceRoot);
            saveHallOneMindBranch({
                branch_id: 'research:TRACE-PLAN:bounded-runtime-improvement:1',
                repo_id: repoId,
                source_weave: 'weave:research',
                branch_group_id: 'research:TRACE-PLAN:bounded-runtime-improvement',
                branch_kind: 'research',
                branch_label: 'tests',
                branch_index: 1,
                status: 'COMPLETED',
                provider: 'codex',
                trace_id: 'TRACE-PLAN',
                summary: 'Test surface is narrow.',
                artifacts: ['src/runtime.ts'],
                metadata: {
                    intent: 'plan a bounded runtime improvement',
                    branch_count: 2,
                },
                created_at: now + 1,
                updated_at: now + 1,
            }, workspaceRoot);

            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Repository research complete.',
                metadata: {
                    research_artifacts: ['README.md', 'src/runtime.ts'],
                    research_payload: {
                        summary: 'Repository research complete.',
                        research_artifacts: ['README.md', 'src/runtime.ts'],
                    },
                },
            };
        }

        if (invocation.weave_id === 'weave:architect') {
            const session = getHallPlanningSession(sessionId);
            assert.ok(session);
            assert.equal(session?.status, 'RESEARCH_PHASE');
            assert.match(session?.summary ?? '', /Synthesizing proposal via Architect/i);
            assert.equal(session?.metadata?.phase_in_flight, 'weave:architect');
            assert.equal((session?.metadata?.research_payload as Record<string, unknown> | undefined)?.summary, 'Repository research complete.');
            assert.deepEqual((session?.metadata?.research_payload as Record<string, unknown> | undefined)?.research_artifacts, ['README.md', 'src/runtime.ts']);
            const digest = (session?.metadata?.branch_ledger_digest as Record<string, unknown> | undefined);
            assert.ok(digest);
            assert.equal(digest?.total_branches, 2);
            assert.equal(digest?.group_count, 1);
            const research = (invocation.payload as { research?: Record<string, unknown> }).research;
            assert.equal(research?.summary, 'Repository research complete.');
            assert.deepEqual(research?.research_artifacts, ['README.md', 'src/runtime.ts']);
            assert.equal((research?.branch_ledger_digest as Record<string, unknown> | undefined)?.total_branches, 2);
            assert.ok(Array.isArray(research?.local_worker_file_budgets));
            const budgets = research?.local_worker_file_budgets as Array<Record<string, unknown>>;
            assert.ok(budgets.some((entry) => entry.path === 'README.md' && entry.local_worker_fit === true));
            assert.ok(budgets.some((entry) => entry.path === 'src/runtime.ts' && entry.local_worker_fit === true));

            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Architect proposal ready.',
                metadata: {
                    architect_proposal: {
                        proposal_summary: 'Implement the runtime improvement as a bounded bead.',
                        beads: [
                            {
                                id: 'bounded-runtime-improvement',
                                title: 'Implement bounded runtime improvement',
                                rationale: 'Carry forward the researched runtime changes.',
                                targets: ['src/runtime.ts'],
                                depends_on: [],
                                acceptance_criteria: ['Bounded runtime improvement exists.'],
                            },
                        ],
                    },
                },
            };
        }

        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
            metadata: {},
        };
    }
}

class ArchitectOnlyDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        assert.equal(invocation.weave_id, 'weave:architect');
        const research = (invocation.payload as { research?: Record<string, unknown> }).research;
        assert.equal(research?.summary, 'Stored research context.');
        assert.deepEqual(research?.research_artifacts, ['tests/test_runtime.py']);
        assert.ok(Array.isArray(research?.local_worker_file_budgets));
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'Architect proposal ready.',
            metadata: {
                architect_proposal: {
                    proposal_summary: 'Resume from stored research context.',
                    beads: [
                        {
                            id: 'resume-research-phase',
                            title: 'Resume research phase proposal',
                            rationale: 'Use stored research payload during resume.',
                            targets: ['tests/test_runtime.py'],
                            depends_on: [],
                            acceptance_criteria: ['Stored research payload was used.'],
                        },
                    ],
                },
            },
        };
    }
}

function createContext(workspaceRoot: string, sessionId?: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT-PLAN',
        trace_id: `TRACE-${sessionId ?? 'PLAN'}`,
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'tui',
        target_domain: 'brain',
        interactive: true,
        session_id: sessionId,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Chant collaborative planning (CS-P7-03)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-plan-'));
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
        fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'tests'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'README.md'), '# Runtime notes\n', 'utf-8');
        fs.writeFileSync(path.join(tmpRoot, 'src', 'runtime.ts'), 'export const runtime = true;\n', 'utf-8');
        fs.writeFileSync(path.join(tmpRoot, 'tests', 'test_runtime.py'), 'def test_runtime():\n    assert True\n', 'utf-8');
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
    });

    it('advances collaborative planning into proposal review for a concrete request', async () => {
        const chant = new ChantWeave(new NoopDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'plan how to improve the Corvus Star chant system for mounted repos and orchestration',
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
                    mode: 'tui',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const sessionId = String(result.metadata?.planning_session_id);
        const session = getHallPlanningSession(sessionId);
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
    });

    it('maintains a multi-turn planning session across follow-up prompts', async () => {
        const chant = new ChantWeave(new NoopDispatchPort());
        const first = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'help me improve this',
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
                    mode: 'tui',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        const sessionId = String(first.metadata?.planning_session_id);
        assert.equal(first.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const second = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'target the ravens repo sweep and prepare a bead for orchestration',
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
                    mode: 'tui',
                    interactive: true,
                    session_id: sessionId,
                },
            },
            createContext(tmpRoot, sessionId),
        );

        assert.equal(second.status, 'TRANSITIONAL');
        assert.equal(second.metadata?.planning_status, 'PROPOSAL_REVIEW');
        assert.equal(second.metadata?.planning_session_id, sessionId);

        const session = getHallPlanningSession(sessionId);
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
        assert.match(session?.normalized_intent ?? '', /FOLLOW_UP:/);
    });

    it('persists in-flight planning state before blocking phases and carries research into architect synthesis', async () => {
        const chant = new ChantWeave(new InspectPlanningDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'plan a bounded runtime improvement',
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
                    mode: 'tui',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');
        assert.equal(result.metadata?.context_policy, 'project');

        const session = getHallPlanningSession('chant-session:TRACE-PLAN');
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
        assert.equal((session?.metadata?.research_payload as Record<string, unknown> | undefined)?.summary, 'Repository research complete.');
        assert.deepEqual((session?.metadata?.research_payload as Record<string, unknown> | undefined)?.research_artifacts, ['README.md', 'src/runtime.ts']);
        assert.equal((session?.metadata?.branch_ledger_digest as Record<string, unknown> | undefined)?.total_branches, 2);
    });

    it('reuses stored research payload when resuming from RESEARCH_PHASE', async () => {
        const sessionId = 'chant-session:resume-research';
        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: buildHallRepositoryId(normalizeHallPath(tmpRoot)),
            skill_id: 'chant',
            status: 'RESEARCH_PHASE',
            user_intent: 'Resume the stalled planning session.',
            normalized_intent: 'Resume the stalled planning session.',
            summary: 'Research Phase complete. Synthesizing proposal via Architect...',
            created_at: Date.now(),
            updated_at: Date.now(),
            metadata: {
                research_payload: {
                    summary: 'Stored research context.',
                    research_artifacts: ['tests/test_runtime.py'],
                },
            },
        });

        const chant = new ChantWeave(new ArchitectOnlyDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'proceed',
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
                    mode: 'tui',
                    interactive: true,
                    session_id: sessionId,
                },
            },
            createContext(tmpRoot, sessionId),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');
        assert.equal(result.metadata?.planning_session_id, sessionId);
    });
});
