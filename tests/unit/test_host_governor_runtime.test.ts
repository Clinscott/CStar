import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
    HostGovernorWeavePayload,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.ts';
import { HostGovernorWeave } from '../../src/node/core/runtime/weaves/host_governor.ts';
import {
    closeDb,
    getHallBeads,
    getDb,
    getHallPlanningSession,
    getHallSkillProposal,
    upsertHallBead,
    saveHallPlanningSession,
    saveHallSkillProposal,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.ts';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocations: WeaveInvocation<unknown>[] = [];
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocations.push(invocation as WeaveInvocation<unknown>);
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'Orchestrator processed promoted beads.',
            metadata: {
                total_processed: 1,
            },
        };
    }
}

class ReplanExecuteDispatchPort implements RuntimeDispatchPort {
    public invocations: WeaveInvocation<unknown>[] = [];
    public readonly projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
    }

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocations.push(invocation as WeaveInvocation<unknown>);

        if (invocation.weave_id === 'weave:chant') {
            const repoId = buildHallRepositoryId(normalizeHallPath(this.projectRoot));
            const sessionId = 'chant-session:blocked-replan';
            const beadId = `bead:${sessionId}:follow-up`;
            const proposalId = `proposal:${sessionId}:follow-up`;
            const now = Date.now();

            saveHallPlanningSession({
                session_id: sessionId,
                repo_id: repoId,
                skill_id: 'chant',
                status: 'PROPOSAL_REVIEW',
                user_intent: 'Replan the blocked host-governor bead.',
                normalized_intent: 'Replan the blocked host-governor bead.',
                summary: 'Blocked bead was routed back through chant.',
                created_at: now,
                updated_at: now,
                metadata: {
                    bead_ids: [beadId],
                },
            });
            upsertHallBead({
                bead_id: beadId,
                repo_id: repoId,
                target_path: 'src/node/core/runtime/weaves/host_governor.ts',
                rationale: 'Replanned host-governor follow-up bead.',
                acceptance_criteria: 'The fresh chant bead can be auto-promoted in the same pass.',
                checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
                status: 'OPEN',
                source_kind: 'CHANT',
                created_at: now + 1,
                updated_at: now + 1,
            });
            saveHallSkillProposal({
                proposal_id: proposalId,
                repo_id: repoId,
                skill_id: 'chant',
                bead_id: beadId,
                target_path: 'src/node/core/runtime/weaves/host_governor.ts',
                status: 'PROPOSED',
                summary: 'Replanned follow-up bead.',
                created_at: now + 1,
                updated_at: now + 1,
                metadata: {
                    session_id: sessionId,
                },
            });

            return {
                weave_id: invocation.weave_id,
                status: 'TRANSITIONAL',
                output: 'Proposal captured for blocked bead.',
                metadata: {
                    planning_session_id: sessionId,
                    planning_status: 'PROPOSAL_REVIEW',
                },
            };
        }

        if (invocation.weave_id === 'weave:orchestrate') {
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Orchestrator processed replanned beads.',
                metadata: {
                    total_processed: 1,
                },
            };
        }

        throw new Error(`Unexpected weave dispatch: ${invocation.weave_id}`);
    }
}

class ReplanDispatchPort implements RuntimeDispatchPort {
    public invocations: WeaveInvocation<unknown>[] = [];
    public readonly projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
    }

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocations.push(invocation as WeaveInvocation<unknown>);

        if (invocation.weave_id === 'weave:chant') {
            const repoId = buildHallRepositoryId(normalizeHallPath(this.projectRoot));
            saveHallPlanningSession({
                session_id: 'chant-session:blocked-replan',
                repo_id: repoId,
                skill_id: 'chant',
                status: 'PROPOSAL_REVIEW',
                user_intent: 'Replan the blocked host-governor bead.',
                normalized_intent: 'Replan the blocked host-governor bead.',
                summary: 'Blocked bead was routed back through chant.',
                created_at: Date.now(),
                updated_at: Date.now(),
                metadata: {},
            });
            return {
                weave_id: invocation.weave_id,
                status: 'TRANSITIONAL',
                output: 'Proposal captured for blocked bead.',
                metadata: {
                    planning_session_id: 'chant-session:blocked-replan',
                    planning_status: 'PROPOSAL_REVIEW',
                },
            };
        }

        throw new Error(`Unexpected weave dispatch: ${invocation.weave_id}`);
    }
}

function createContext(workspaceRoot: string, env: Record<string, string | undefined> = {}): RuntimeContext {
    return {
        mission_id: 'MISSION-HOST-GOVERNOR',
        trace_id: 'TRACE-HOST-GOVERNOR',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env,
        timestamp: Date.now(),
    };
}

describe('Host governor runtime weave', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-governor-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
        getDb();
    });

    afterEach(() => {
        closeDb();
    });

    it('requires an active host session before governance can proceed', async () => {
        const weave = new HostGovernorWeave(new CaptureDispatchPort(), async () => '{"approved_bead_ids":[],"deferred_bead_ids":[],"notes":"noop"}');

        const result = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Resume the mission.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            },
            createContext(tmpRoot, { CORVUS_HOST_SESSION_ACTIVE: 'false' }),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires an active host session/i);
    });

    it('promotes only bounded beads with executable checker_shell validation and delegates orchestration', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const oversizedTarget = path.join(tmpRoot, 'src', 'node', 'core', 'runtime', 'weaves', 'oversized.ts');
        fs.mkdirSync(path.dirname(oversizedTarget), { recursive: true });
        fs.writeFileSync(
            oversizedTarget,
            Array.from({ length: 450 }, (_, index) => `export const line${index} = ${index};`).join('\n'),
            'utf-8',
        );

        upsertHallBead({
            bead_id: 'bead-safe',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/weaves/host_governor.ts',
            rationale: 'Introduce the host-governor weave.',
            acceptance_criteria: 'Host governor promotes only micro-bounded beads. | Promotion requires executable checker validation.',
            checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'OPEN',
            critique_payload: {
                targets: [
                    'src/node/core/runtime/weaves/host_governor.ts',
                    'tests/unit/test_host_governor_runtime.test.ts',
                ],
            },
            created_at: now,
            updated_at: now,
        });
        saveHallSkillProposal({
            proposal_id: 'proposal-safe',
            repo_id: repoId,
            skill_id: 'chant',
            bead_id: 'bead-safe',
            target_path: 'src/node/core/runtime/weaves/host_governor.ts',
            status: 'PROPOSED',
            summary: 'Introduce the host-governor weave.',
            created_at: now,
            updated_at: now,
            metadata: {
                session_id: 'chant-session:safe',
            },
        });
        upsertHallBead({
            bead_id: 'bead-too-wide',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/adapters.ts',
            rationale: 'Rewrite the entire runtime stack.',
            acceptance_criteria: 'Everything should be better. | Also rewrite adjacent modules.',
            checker_shell: 'node --test tests/unit/test_runtime_command_invocations.test.ts',
            status: 'OPEN',
            critique_payload: {
                targets: [
                    'src/node/core/runtime/adapters.ts',
                    'src/node/core/runtime/dispatcher.ts',
                    'src/node/core/runtime/bootstrap.ts',
                    'src/node/core/runtime/weaves/chant.ts',
                ],
            },
            created_at: now + 1,
            updated_at: now + 1,
        });
        upsertHallBead({
            bead_id: 'bead-oversized-file',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/weaves/oversized.ts',
            rationale: 'Large implementation files should not be auto-promoted to the local worker.',
            acceptance_criteria: 'Stay within a bounded local-worker slice.',
            checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'OPEN',
            critique_payload: {
                targets: [
                    'src/node/core/runtime/weaves/oversized.ts',
                    'tests/unit/test_host_governor_runtime.test.ts',
                ],
            },
            created_at: now + 2,
            updated_at: now + 2,
        });
        upsertHallBead({
            bead_id: 'bead-missing-checker-bin',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/start.ts',
            rationale: 'Validation must be executable, not merely present.',
            acceptance_criteria: 'Do the thing.',
            checker_shell: 'missing-checker --verify tests/unit/test_host_governor_runtime.test.ts',
            status: 'OPEN',
            created_at: now + 3,
            updated_at: now + 3,
        });
        upsertHallBead({
            bead_id: 'bead-verbose-criteria',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/dispatcher.ts',
            rationale: 'Too many acceptance criteria should prevent auto-promotion.',
            acceptance_criteria: 'First criterion. | Second criterion. | Third criterion. | Fourth criterion.',
            checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'OPEN',
            critique_payload: {
                targets: [
                    'src/node/core/runtime/dispatcher.ts',
                    'tests/unit/test_host_governor_runtime.test.ts',
                ],
            },
            created_at: now + 5,
            updated_at: now + 5,
        });
        upsertHallBead({
            bead_id: 'bead-no-checker',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/start.ts',
            rationale: 'Missing validation should keep this bead out of auto-promotion.',
            acceptance_criteria: 'Do the thing.',
            status: 'OPEN',
            created_at: now + 4,
            updated_at: now + 4,
        });

        const capture = new CaptureDispatchPort();
        const weave = new HostGovernorWeave(
            capture,
            async () => JSON.stringify({
                approved_bead_ids: ['bead-safe'],
                deferred_bead_ids: ['bead-too-wide'],
                notes: 'Only the bounded, validated bead is safe to SET.',
            }),
        );

        const result = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Resume host-governed execution.',
                    auto_execute: true,
                    max_parallel: 1,
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'runtime',
                } satisfies HostGovernorWeavePayload,
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.deepEqual(result.metadata?.promoted_bead_ids, ['bead-safe']);
        assert.equal(result.metadata?.total_candidates, 1);
        assert.equal(capture.invocation?.weave_id, 'weave:orchestrate');
        assert.deepEqual(capture.invocation?.payload, {
            bead_ids: ['bead-safe'],
            max_parallel: 1,
            project_root: tmpRoot,
            cwd: tmpRoot,
            source: 'runtime',
        });

        const beads = getHallBeads(tmpRoot);
        assert.equal(beads.find((bead) => bead.id === 'bead-safe')?.status, 'SET');
        assert.equal(beads.find((bead) => bead.id === 'bead-too-wide')?.status, 'OPEN');
        assert.equal(beads.find((bead) => bead.id === 'bead-oversized-file')?.status, 'OPEN');
        assert.equal(beads.find((bead) => bead.id === 'bead-missing-checker-bin')?.status, 'OPEN');
        assert.equal(beads.find((bead) => bead.id === 'bead-no-checker')?.status, 'OPEN');
        assert.equal(beads.find((bead) => bead.id === 'bead-verbose-criteria')?.status, 'OPEN');

        const proposal = getHallSkillProposal('proposal-safe');
        assert.equal(proposal?.status, 'PROMOTED');
        assert.equal(proposal?.promoted_by, 'HOST-GOVERNOR');
        assert.match(proposal?.promotion_note ?? '', /Promoted to SET by HOST-GOVERNOR/i);
    });

    it('persists machine-readable reason codes to triage_reason for deferred beads', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        
        upsertHallBead({
            bead_id: 'bead-to-defer',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/weaves/host_governor.ts',
            rationale: 'This bead will be deferred by the governor.',
            acceptance_criteria: 'Deferred bead should have a reason code.',
            checker_shell: 'npx tsx --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'OPEN',
            created_at: now,
            updated_at: now,
        });

        const capture = new CaptureDispatchPort();
        const weave = new HostGovernorWeave(
            capture,
            async () => JSON.stringify({
                approved_bead_ids: [],
                deferred_bead_ids: ['bead-to-defer'],
                reason_code: 'TOO_WIDE',
                notes: 'Deferring because it is too wide.',
            }),
        );

        await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Governance pass with deferral.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'runtime',
                } satisfies HostGovernorWeavePayload,
            },
            createContext(tmpRoot, { CORVUS_HOST_SESSION_ACTIVE: 'true' }),
        );

        const beads = getHallBeads(tmpRoot);
        const deferredBead = beads.find((bead) => bead.id === 'bead-to-defer');
        assert.equal(deferredBead?.status, 'OPEN');
        assert.equal(deferredBead?.triage_reason, 'TOO_WIDE');
    });

    it('routes unsatisfied blocked beads back through chant once per active planning cycle', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const oversizedTarget = path.join(tmpRoot, 'src', 'node', 'core', 'runtime', 'weaves', 'host_governor.ts');
        fs.mkdirSync(path.dirname(oversizedTarget), { recursive: true });
        fs.writeFileSync(
            oversizedTarget,
            Array.from({ length: 450 }, (_, index) => `export const line${index} = ${index};`).join('\n'),
            'utf-8',
        );
        upsertHallBead({
            bead_id: 'bead-blocked',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/weaves/host_governor.ts',
            rationale: 'Blocked governor work needs a revised plan.',
            acceptance_criteria: 'A revised bounded plan exists.',
            checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'BLOCKED',
            triage_reason: 'Worker failed after a partial architectural change.',
            created_at: now,
            updated_at: now,
        });

        const dispatchPort = new ReplanDispatchPort(tmpRoot);
        const weave = new HostGovernorWeave(
            dispatchPort,
            async () => JSON.stringify({
                approved_bead_ids: [],
                deferred_bead_ids: [],
                notes: 'No promotable OPEN beads exist yet.',
            }),
        );

        const first = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Replan the blocked bead.',
                    auto_replan_blocked: true,
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'runtime',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(first.status, 'SUCCESS');
        assert.deepEqual(first.metadata?.replanned_bead_ids, ['bead-blocked']);
        assert.equal(dispatchPort.invocations.length, 1);
        assert.equal(dispatchPort.invocations[0]?.weave_id, 'weave:chant');
        const replanQuery = String((dispatchPort.invocations[0]?.payload as { query?: string }).query ?? '');
        assert.match(replanQuery, /Replan blocked Hall beads/i);
        assert.match(replanQuery, /focused section/i);
        assert.match(replanQuery, /line_count/i);

        const planningSession = getHallPlanningSession('chant-session:blocked-replan');
        assert.ok(planningSession);
        assert.deepEqual(planningSession?.metadata?.replanned_bead_ids, ['bead-blocked']);

        const second = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Replan the blocked bead.',
                    auto_replan_blocked: true,
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'runtime',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(second.status, 'SUCCESS');
        assert.equal(dispatchPort.invocations.length, 1);
        assert.deepEqual(second.metadata?.replanned_bead_ids, []);
    });

    it('governs fresh chant replans in the same pass and promotes the linked proposal', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        upsertHallBead({
            bead_id: 'bead-blocked',
            repo_id: repoId,
            target_path: 'src/node/core/runtime/weaves/host_governor.ts',
            rationale: 'Blocked governor work needs a revised plan.',
            acceptance_criteria: 'A revised bounded plan exists.',
            checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
            status: 'BLOCKED',
            triage_reason: 'Worker failed after a partial architectural change.',
            created_at: now,
            updated_at: now,
        });

        const dispatchPort = new ReplanExecuteDispatchPort(tmpRoot);
        const weave = new HostGovernorWeave(
            dispatchPort,
            async () => JSON.stringify({
                approved_bead_ids: ['bead:chant-session:blocked-replan:follow-up'],
                deferred_bead_ids: [],
                notes: 'The replanned bead is bounded and checker-backed.',
            }),
        );

        const result = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Replan and resume the blocked bead.',
                    auto_execute: true,
                    auto_replan_blocked: true,
                    max_parallel: 1,
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'runtime',
                } satisfies HostGovernorWeavePayload,
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.deepEqual(dispatchPort.invocations.map((entry) => entry.weave_id), ['weave:chant', 'weave:orchestrate']);
        assert.deepEqual(result.metadata?.replanned_bead_ids, ['bead-blocked']);
        assert.deepEqual(result.metadata?.replan_promoted_bead_ids, ['bead:chant-session:blocked-replan:follow-up']);

        const freshBeads = getHallBeads(tmpRoot);
        assert.equal(
            freshBeads.find((bead) => bead.id === 'bead:chant-session:blocked-replan:follow-up')?.status,
            'SET',
        );

        const proposal = getHallSkillProposal('proposal:chant-session:blocked-replan:follow-up');
        assert.equal(proposal?.status, 'PROMOTED');
        assert.equal(proposal?.promoted_by, 'HOST-GOVERNOR');
        assert.match(proposal?.promotion_note ?? '', /planning session chant-session:blocked-replan/i);
    });
});
