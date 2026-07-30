import type {
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';
import {
    saveHallPlanningSession,
    saveHallSkillProposal,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

export class CaptureDispatchPort implements RuntimeDispatchPort {
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
export class ReplanExecuteDispatchPort implements RuntimeDispatchPort {
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
                target_kind: 'FILE',
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

export class ReplanDispatchPort implements RuntimeDispatchPort {
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

export function createContext(workspaceRoot: string, env: Record<string, string | undefined> = {}): RuntimeContext {
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
