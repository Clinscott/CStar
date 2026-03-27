import type { HostProvider } from  '../../core/host_session.js';
import { resolveHostProvider } from  '../../core/host_session.js';
import { getHallPlanningSession, listHallPlanningSessions } from '../../tools/pennyone/intel/database.js';
import type { HallOneMindBranchDigest, HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../types/hall.js';
import { ANS } from  './ans.js';
import type {
    HostGovernorWeavePayload,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
    OperatorSession,
    WorkspaceTarget,
} from './runtime/contracts.ts';

export interface OperatorResumeOptions {
    workspaceRoot: string;
    cwd: string;
    task?: string;
    ledger?: string;
    env?: NodeJS.ProcessEnv;
    autoExecute?: boolean;
    autoReplanBlocked?: boolean;
    maxParallel?: number;
    maxPromotions?: number;
    dryRun?: boolean;
    source?: HostGovernorWeavePayload['source'];
    session?: OperatorSession;
    target?: WorkspaceTarget;
}

export interface OperatorResumeResult {
    resumed: boolean;
    provider: HostProvider | null;
    wokeKernel: boolean;
    governorResult?: WeaveResult;
    planningSummary?: string;
}

interface OperatorResumeDependencies {
    wakeKernel?: () => Promise<void>;
}

const ACTIVE_PLANNING_STATUSES: HallPlanningSessionStatus[] = [
    'INTENT_RECEIVED',
    'RESEARCH_PHASE',
    'PROPOSAL_REVIEW',
    'BEAD_CRITIQUE_LOOP',
    'BEAD_USER_REVIEW',
    'PLAN_CONCRETE',
    'FORGE_EXECUTION',
    'NEEDS_INPUT',
    'PLAN_READY',
    'ROUTED',
];

function getPlanningBranchDigest(session: HallPlanningSessionRecord): HallOneMindBranchDigest | undefined {
    const digest = session.metadata?.branch_ledger_digest;
    if (!digest || typeof digest !== 'object' || Array.isArray(digest)) {
        return undefined;
    }
    const normalized = digest as HallOneMindBranchDigest;
    if (!Array.isArray(normalized.groups) || typeof normalized.total_branches !== 'number') {
        return undefined;
    }
    return normalized;
}

export function compactPlanningHandle(session: HallPlanningSessionRecord): string {
    const traceId = typeof session.metadata?.trace_id === 'string' && session.metadata.trace_id.trim()
        ? session.metadata.trace_id.trim()
        : undefined;
    if (traceId) {
        return traceId;
    }

    const normalized = session.session_id.trim();
    if (normalized.startsWith('chant-session:')) {
        return normalized.slice('chant-session:'.length);
    }
    return normalized;
}

export function formatPlanningDigestBadge(session: HallPlanningSessionRecord): string | undefined {
    const digest = getPlanningBranchDigest(session);
    if (!digest) {
        return undefined;
    }

    const researchBranches = digest.groups
        .filter((group) => group.branch_kind === 'research')
        .reduce((total, group) => total + group.branch_count, 0);
    const critiqueBranches = digest.groups
        .filter((group) => group.branch_kind === 'critique')
        .reduce((total, group) => total + group.branch_count, 0);
    const revisionGroups = digest.groups.filter((group) => group.needs_revision).length;
    const parts = [
        researchBranches > 0 ? `R=${researchBranches}` : null,
        critiqueBranches > 0 ? `C=${critiqueBranches}` : null,
        revisionGroups > 0 ? `REV=${revisionGroups}` : null,
        digest.artifacts.length > 0 ? `A=${digest.artifacts.length}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : undefined;
}

export function formatPlanningSessionSummary(session: HallPlanningSessionRecord | null): string | undefined {
    if (!session) {
        return undefined;
    }

    const handle = compactPlanningHandle(session);
    const digestBadge = formatPlanningDigestBadge(session);
    const focus = session.latest_question ?? session.summary ?? session.normalized_intent;
    return [
        session.status,
        handle,
        digestBadge ? `{${digestBadge}}` : null,
        focus,
    ].filter(Boolean).join(' | ');
}

export function resolveResumePlanningSession(
    workspaceRoot: string,
    governorResult?: WeaveResult,
): HallPlanningSessionRecord | null {
    const planningSessionId = typeof governorResult?.metadata?.replan_planning_session_id === 'string'
        ? governorResult.metadata.replan_planning_session_id
        : typeof governorResult?.metadata?.planning_session_id === 'string'
            ? governorResult.metadata.planning_session_id
            : undefined;

    if (planningSessionId) {
        return getHallPlanningSession(planningSessionId);
    }

    const sessions = listHallPlanningSessions(workspaceRoot, { statuses: ACTIVE_PLANNING_STATUSES });
    return sessions[0] ?? null;
}

export function resolveResultPlanningSession(
    workspaceRoot: string,
    result?: WeaveResult,
): HallPlanningSessionRecord | null {
    const planningSessionId = typeof result?.metadata?.replan_planning_session_id === 'string'
        ? result.metadata.replan_planning_session_id
        : typeof result?.metadata?.planning_session_id === 'string'
            ? result.metadata.planning_session_id
            : undefined;

    if (planningSessionId) {
        return getHallPlanningSession(planningSessionId);
    }

    const sessions = listHallPlanningSessions(workspaceRoot, { statuses: ACTIVE_PLANNING_STATUSES });
    return sessions[0] ?? null;
}

export function buildResultPlanningSummary(
    workspaceRoot: string,
    result?: WeaveResult,
): string | undefined {
    return formatPlanningSessionSummary(resolveResultPlanningSession(workspaceRoot, result));
}

export function buildHostGovernorResumeInvocation(
    options: OperatorResumeOptions,
): WeaveInvocation<HostGovernorWeavePayload> {
    return {
        weave_id: 'weave:host-governor',
        payload: {
            task: options.task,
            ledger: options.ledger,
            auto_execute: options.autoExecute ?? true,
            auto_replan_blocked: options.autoReplanBlocked ?? true,
            max_parallel: options.maxParallel ?? 1,
            max_promotions: options.maxPromotions,
            dry_run: options.dryRun,
            project_root: options.workspaceRoot,
            cwd: options.cwd,
            source: options.source ?? 'cli',
        },
        session: options.session,
        target: options.target,
    };
}

export async function executeHostGovernorResume(
    dispatchPort: RuntimeDispatchPort,
    options: OperatorResumeOptions,
    provider: HostProvider | null,
    dependencies: OperatorResumeDependencies = {},
): Promise<OperatorResumeResult> {
    const wakeKernel = dependencies.wakeKernel ?? (() => ANS.wake());
    try {
        await wakeKernel();
        const governorResult = await dispatchPort.dispatch(buildHostGovernorResumeInvocation(options));
        const planningSession = resolveResumePlanningSession(options.workspaceRoot, governorResult);
        return {
            resumed: true,
            provider,
            wokeKernel: true,
            governorResult,
            planningSummary: formatPlanningSessionSummary(planningSession),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            resumed: true,
            provider,
            wokeKernel: true,
            governorResult: {
                weave_id: 'weave:host-governor',
                status: 'FAILURE',
                output: '',
                error: `Operator entry failed to resume the host governor: ${message}`,
            },
        };
    }
}

export async function resumeHostGovernorIfAvailable(
    dispatchPort: RuntimeDispatchPort,
    options: OperatorResumeOptions,
    dependencies: OperatorResumeDependencies = {},
): Promise<OperatorResumeResult> {
    const env = options.env ?? process.env;
    const provider = resolveHostProvider(env);
    if (!provider) {
        return {
            resumed: false,
            provider: null,
            wokeKernel: false,
        };
    }

    return executeHostGovernorResume(dispatchPort, options, provider, dependencies);
}
