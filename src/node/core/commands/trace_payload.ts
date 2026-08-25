import { database } from '../../../tools/pennyone/intel/database.js';
import type { SovereignBead } from '../../../types/bead.js';
import type { HallOneMindBranchDigest, HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../types/hall.js';
import { compactPlanningHandle, formatPlanningDigestBadge } from '../operator_resume.js';
import {
    asStringArray,
    formatTraceTimestamp,
    getFailureDiagnostics,
    getHostContext,
    getHostContextFromMetadata,
    getPlanningBranchDigest,
    getSessionStringMetadata,
    getTraceContract,
    getTraceContractFromMetadata,
    getTraceLineageFromMetadata,
    isUsableActiveAuguryContract,
    normalizeAuguryContractForActiveState,
    synthesizePlanningAuguryContract,
    uniqueStrings,
} from './trace_contract.js';
import type { TraceAgentHandoffPayload, TraceExecutionGate, TraceFailureDiagnosticsPayload,
    TraceFailureEntryPayload, TraceFailuresPayload, TraceHostContextPayload, TraceStatusPayload,
    TraceWorkItemPayload } from './trace_types.js';

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
const FAILED_PLANNING_STATUSES: HallPlanningSessionStatus[] = ['FAILED'];

export function hydratePlanningSession(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
): HallPlanningSessionRecord | null {
    if (!session) {
        return null;
    }
    return database.getHallPlanningSession(session.session_id, rootPath) ?? session;
}

export function resolveActivePlanningSession(rootPath: string): HallPlanningSessionRecord | null {
    const active = database.listHallPlanningSessions(rootPath, { statuses: ACTIVE_PLANNING_STATUSES });
    return hydratePlanningSession(active[0] ?? database.listHallPlanningSessions(rootPath)[0] ?? null, rootPath);
}

export function resolveFailedPlanningSessions(rootPath: string, limit: number): HallPlanningSessionRecord[] {
    return database.listHallPlanningSessions(rootPath, { statuses: FAILED_PLANNING_STATUSES })
        .slice(0, limit)
        .map((session) => hydratePlanningSession(session, rootPath) ?? session);
}

export function rankRuntimeTraceBead(bead: SovereignBead): number {
    switch (bead.status) {
        case 'IN_PROGRESS':
            return 0;
        case 'READY_FOR_REVIEW':
            return 1;
        case 'BLOCKED':
        case 'NEEDS_TRIAGE':
            return 2;
        case 'RESOLVED':
            return 3;
        default:
            return 4;
    }
}

export function resolveLatestRuntimeTraceBead(rootPath: string, registryRootPath: string = rootPath): SovereignBead | null {
    const beads = database.getHallBeads(rootPath)
        .filter((bead) => bead.id.includes(':exec:'))
        .filter((bead) => bead.status !== 'ARCHIVED' && bead.status !== 'SUPERSEDED')
        .filter((bead) => (bead.metadata as Record<string, unknown> | undefined)?.archived !== true)
        .filter((bead) => isUsableActiveAuguryContract(
            getTraceContractFromMetadata(bead.metadata as Record<string, unknown> | undefined),
            rootPath,
            registryRootPath,
        ))
        .sort((left, right) => {
            const updatedDiff = Number(right.updated_at ?? 0) - Number(left.updated_at ?? 0);
            if (updatedDiff !== 0) {
                return updatedDiff;
            }
            const rankDiff = rankRuntimeTraceBead(left) - rankRuntimeTraceBead(right);
            if (rankDiff !== 0) {
                return rankDiff;
            }
            return left.id.localeCompare(right.id);
        });
    return beads[0] ?? null;
}

export function deriveRuntimeExecutionGate(status: SovereignBead['status']): TraceExecutionGate {
    switch (status) {
        case 'IN_PROGRESS':
            return 'execution_guarded';
        case 'READY_FOR_REVIEW':
            return 'review_required';
        case 'BLOCKED':
        case 'NEEDS_TRIAGE':
            return 'failure_recovery';
        case 'RESOLVED':
            return 'completed';
        default:
            return 'planning_active';
    }
}

export function buildRuntimeNextAction(bead: SovereignBead, hostContext: TraceHostContextPayload | undefined): string {
    if (hostContext?.note) {
        return hostContext.note;
    }

    switch (bead.status) {
        case 'IN_PROGRESS':
            return 'Inspect the live execution bead and wait for the bounded command to complete before issuing follow-on work.';
        case 'READY_FOR_REVIEW':
            return 'Review the finished execution bead, validate the touched target, and only then promote or supersede follow-up work.';
        case 'BLOCKED':
        case 'NEEDS_TRIAGE':
            return 'Inspect the failed execution bead, identify the broken boundary, and recast the work instead of retrying blindly.';
        case 'RESOLVED':
            return 'Review the completed execution bead and seed any follow-up Hall work explicitly.';
        default:
            return 'Inspect the runtime execution bead and determine the next bounded action.';
    }
}

export function buildRuntimeTraceHandoffPayload(bead: SovereignBead, rootPath: string,
    registryRootPath: string = rootPath): TraceAgentHandoffPayload {
    const metadata = bead.metadata as Record<string, unknown> | undefined;
    const hostContext = getHostContextFromMetadata(metadata);
    const traceContract = normalizeAuguryContractForActiveState(
        getTraceContractFromMetadata(metadata),
        rootPath,
        registryRootPath,
    );
    const missionBeadId = typeof metadata?.mission_bead_id === 'string' && metadata.mission_bead_id.trim()
        ? metadata.mission_bead_id.trim()
        : undefined;
    const gate = deriveRuntimeExecutionGate(bead.status);
    return {
        execution_gate: gate,
        phase: bead.status,
        next_action: buildRuntimeNextAction(bead, hostContext),
        resume_command: `cstar hall "${missionBeadId ?? bead.id}"`,
        lead_bead_id: bead.id,
        target_paths: bead.target_path ? [bead.target_path] : [],
        checker_shells: bead.checker_shell ? [bead.checker_shell] : [],
        proposal_ids: [],
        bead_ids: uniqueStrings([missionBeadId ?? '', bead.id]),
        host_context: hostContext,
        designation: traceContract,
        work_items: [
            {
                bead_id: bead.id,
                status: bead.status,
                target_path: bead.target_path,
                rationale: bead.rationale,
                acceptance_criteria: bead.acceptance_criteria,
                checker_shell: bead.checker_shell,
            },
        ],
    };
}

export function buildRuntimeTraceStatusPayload(bead: SovereignBead, rootPath: string,
    registryRootPath: string = rootPath): TraceStatusPayload {
    const metadata = bead.metadata as Record<string, unknown> | undefined;
    const handoff = buildRuntimeTraceHandoffPayload(bead, rootPath, registryRootPath);
    const traceContract = normalizeAuguryContractForActiveState(
        getTraceContractFromMetadata(metadata),
        rootPath,
        registryRootPath,
    );
    const failureError = typeof metadata?.execution_error === 'string' && metadata.execution_error.trim()
        ? metadata.execution_error.trim()
        : undefined;
    const missionBeadId = typeof metadata?.mission_bead_id === 'string' && metadata.mission_bead_id.trim()
        ? metadata.mission_bead_id.trim()
        : undefined;
    const lineage = getTraceLineageFromMetadata(metadata, 'runtime_execution', {
        mission_bead_id: missionBeadId,
        runtime_bead_id: bead.id,
    });

    return {
        origin: 'runtime_execution',
        trace_id: typeof metadata?.trace_id === 'string' && metadata.trace_id.trim() ? metadata.trace_id.trim() : undefined,
        runtime_bead_id: bead.id,
        mission_bead_id: missionBeadId,
        handle: bead.id,
        status: bead.status,
        updated_at: bead.updated_at,
        updated_at_iso: formatTraceTimestamp(bead.updated_at),
        user_intent: traceContract?.intent ?? bead.rationale,
        normalized_intent: traceContract?.canonical_intent ?? traceContract?.intent ?? bead.rationale,
        focus: traceContract?.canonical_intent ?? traceContract?.intent ?? bead.rationale,
        current_bead_id: bead.id,
        bead_ids: [...handoff.bead_ids],
        proposal_ids: [],
        bead_summary: {
            total: 1,
            set: 0,
            open: 0,
            review: bead.status === 'READY_FOR_REVIEW' ? 1 : 0,
        },
        artifacts: [],
        ...(failureError ? {
            failure: {
                phase: bead.status,
                error: failureError,
                failed_at: bead.updated_at,
            },
        } : {}),
        ...(handoff.host_context ? { host_context: handoff.host_context } : {}),
        ...(traceContract ? { augury_contract: traceContract, trace_contract: traceContract } : {}),
        ...(lineage ? { lineage } : {}),
        agent_handoff: handoff,
        branches: [],
    };
}

export function parseTraceLimit(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSessionBeads(rootPath: string, session: HallPlanningSessionRecord): SovereignBead[] {
    const beadIds = new Set(asStringArray(session.metadata?.bead_ids));
    if (beadIds.size === 0) {
        return [];
    }
    return database.getHallBeads(rootPath).filter((bead) => beadIds.has(bead.id));
}

export function isPathLikeArtifact(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }
    if (
        trimmed.startsWith('proposal:')
        || trimmed.startsWith('hall-session:')
        || trimmed.startsWith('repo:')
        || trimmed.startsWith('skill:')
    ) {
        return false;
    }
    return trimmed.includes('/') || trimmed.startsWith('.');
}

export function buildTraceWorkItems(beads: SovereignBead[]): TraceWorkItemPayload[] {
    return beads.map((bead) => ({
        bead_id: bead.id,
        status: bead.status,
        target_path: bead.target_path,
        rationale: bead.rationale,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
    }));
}

export function collectTargetPaths(
    rootPath: string,
    beads: SovereignBead[],
    digest: HallOneMindBranchDigest | undefined,
): string[] {
    const beadPaths = beads
        .map((bead) => bead.target_path?.trim() ?? '')
        .filter(Boolean);
    const branchPaths = (digest?.groups ?? []).flatMap((group) => asStringArray(group.proposed_paths));
    const artifactPaths = asStringArray(digest?.artifacts).filter(isPathLikeArtifact);
    const paths = uniqueStrings([...beadPaths, ...branchPaths, ...artifactPaths]);
    if (paths.length <= 1) {
        return paths;
    }

    const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    return paths.filter((candidate) => candidate.replace(/\\/g, '/').replace(/\/+$/, '') !== normalizedRoot);
}

export function deriveExecutionGate(status: HallPlanningSessionStatus): TraceExecutionGate {
    switch (status) {
        case 'FAILED':
            return 'failure_recovery';
        case 'NEEDS_INPUT':
            return 'input_required';
        case 'PROPOSAL_REVIEW':
        case 'BEAD_CRITIQUE_LOOP':
            return 'review_required';
        case 'BEAD_USER_REVIEW':
        case 'PLAN_CONCRETE':
            return 'worker_review_required';
        case 'PLAN_READY':
            return 'operator_release_required';
        case 'FORGE_EXECUTION':
            return 'execution_guarded';
        case 'COMPLETED':
            return 'completed';
        default:
            return 'planning_active';
    }
}

export function buildDefaultNextAction(
    session: HallPlanningSessionRecord,
    gate: TraceExecutionGate,
    failure: TraceFailureDiagnosticsPayload | undefined,
): string {
    switch (gate) {
        case 'failure_recovery':
            return failure?.recovery_hint
                ?? 'Inspect the failure details, decide whether to recast or supersede the session, and avoid blind retries.';
        case 'input_required':
            return session.latest_question?.trim()
                || 'Resolve the outstanding input before continuing planning or execution.';
        case 'review_required':
            return 'Inspect the Hall proposal and bead set, challenge weak scope, and promote only bounded beads to SET when justified.';
        case 'worker_review_required':
            return 'Inspect the lead bead and latest worker output before promoting, revising, or recasting the plan.';
        case 'operator_release_required':
            return 'Perform operator review and explicitly release execution; PLAN_READY is not an execution grant.';
        case 'execution_guarded':
            return 'Execution is staged. Confirm release state and dispatch orchestrate only when execution is explicitly authorized.';
        case 'completed':
            return 'Review the final Hall artifacts and record any follow-up beads instead of reopening completed work blindly.';
        default:
            return 'Continue planning and avoid execution until the review and release gates are satisfied.';
    }
}

export function buildResumeCommand(session: HallPlanningSessionRecord, leadBeadId: string | undefined): string {
    if (leadBeadId && (session.status === 'BEAD_USER_REVIEW' || session.status === 'PLAN_CONCRETE')) {
        return `cstar hall "${leadBeadId}"`;
    }
    return `cstar hall "${session.session_id}"`;
}

export function summarizeSessionBeads(rootPath: string, session: HallPlanningSessionRecord): {
    total: number;
    set: number;
    open: number;
    review: number;
} {
    const beads = getSessionBeads(rootPath, session);
    return {
        total: beads.length,
        set: beads.filter((bead) => bead.status === 'SET').length,
        open: beads.filter((bead) => bead.status === 'OPEN' || bead.status === 'SET-PENDING').length,
        review: beads.filter((bead) => bead.status === 'READY_FOR_REVIEW').length,
    };
}

export function buildTraceAgentHandoffPayload(session: HallPlanningSessionRecord | null, rootPath: string,
    registryRootPath: string = rootPath): TraceAgentHandoffPayload | null {
    const hydrated = hydratePlanningSession(session, rootPath);
    if (!hydrated) {
        const runtimeBead = resolveLatestRuntimeTraceBead(rootPath, registryRootPath);
        return runtimeBead ? buildRuntimeTraceHandoffPayload(runtimeBead, rootPath, registryRootPath) : null;
    }

    const digest = getPlanningBranchDigest(hydrated);
    const failure = getFailureDiagnostics(hydrated);
    const hostContext = getHostContext(hydrated);
    const beads = getSessionBeads(rootPath, hydrated);
    const workItems = buildTraceWorkItems(beads);
    const beadIds = uniqueStrings(asStringArray(hydrated.metadata?.bead_ids));
    const proposalIds = uniqueStrings(asStringArray(hydrated.metadata?.proposal_ids));
    const leadBeadId = hydrated.current_bead_id?.trim() || beadIds[0];
    const gate = deriveExecutionGate(hydrated.status);
    const checkerShells = uniqueStrings(workItems.map((item) => item.checker_shell ?? '').filter(Boolean));
    const nextAction = hostContext?.note || buildDefaultNextAction(hydrated, gate, failure);
    const validationCommand = checkerShells[0];
    const targetPaths = collectTargetPaths(rootPath, beads, digest);
    const traceContract = normalizeAuguryContractForActiveState(
        getTraceContract(hydrated),
        rootPath,
        registryRootPath,
    ) ?? synthesizePlanningAuguryContract(hydrated, rootPath, targetPaths, registryRootPath);

    return {
        execution_gate: gate,
        phase: failure?.phase
            ?? getSessionStringMetadata(hydrated, 'phase_in_flight')
            ?? hydrated.status,
        next_action: nextAction,
        resume_command: buildResumeCommand(hydrated, leadBeadId),
        validation_command: validationCommand,
        lead_bead_id: leadBeadId,
        target_paths: targetPaths,
        checker_shells: checkerShells,
        proposal_ids: proposalIds,
        bead_ids: beadIds,
        host_context: hostContext,
        designation: traceContract,
        work_items: workItems,
    };
}


export function buildTraceStatusPayload(session: HallPlanningSessionRecord | null, rootPath: string,
    registryRootPath: string = rootPath): TraceStatusPayload | null {
    const hydrated = hydratePlanningSession(session, rootPath);
    if (!hydrated) {
        const runtimeBead = resolveLatestRuntimeTraceBead(rootPath, registryRootPath);
        return runtimeBead ? buildRuntimeTraceStatusPayload(runtimeBead, rootPath, registryRootPath) : null;
    }

    const digest = getPlanningBranchDigest(hydrated);
    const failure = getFailureDiagnostics(hydrated);
    const handoff = buildTraceAgentHandoffPayload(hydrated, rootPath, registryRootPath)!;
    const traceContract = handoff.designation;
    const lineage = getTraceLineageFromMetadata(
        hydrated.metadata as Record<string, unknown> | undefined,
        'planning_session',
        { planning_session_id: hydrated.session_id },
    );
    return {
        origin: 'planning_session',
        trace_id: typeof hydrated.metadata?.trace_id === 'string' && hydrated.metadata.trace_id.trim()
            ? hydrated.metadata.trace_id.trim()
            : undefined,
        session_id: hydrated.session_id,
        handle: compactPlanningHandle(hydrated),
        status: hydrated.status,
        updated_at: hydrated.updated_at,
        updated_at_iso: formatTraceTimestamp(hydrated.updated_at),
        user_intent: hydrated.user_intent,
        normalized_intent: hydrated.normalized_intent,
        focus: hydrated.latest_question ?? hydrated.summary ?? hydrated.normalized_intent,
        digest_badge: formatPlanningDigestBadge(hydrated),
        current_bead_id: hydrated.current_bead_id,
        bead_ids: [...handoff.bead_ids],
        proposal_ids: [...handoff.proposal_ids],
        bead_summary: summarizeSessionBeads(rootPath, hydrated),
        artifacts: digest?.artifacts ?? [],
        ...(failure ? { failure } : {}),
        ...(handoff.host_context ? { host_context: handoff.host_context } : {}),
        ...(traceContract ? { augury_contract: traceContract, trace_contract: traceContract } : {}),
        ...(lineage ? { lineage } : {}),
        agent_handoff: handoff,
        branches: (digest?.groups ?? []).map((group) => ({
            kind: group.branch_kind,
            count: group.branch_count,
            needs_revision: group.needs_revision,
            labels: asStringArray(group.branch_labels),
            summary: group.summary,
            artifacts: asStringArray(group.artifacts),
            evidence_sources: asStringArray(group.evidence_sources),
            proposed_paths: asStringArray(group.proposed_paths),
        })),
    };
}
export function resolveActiveTraceStatusPayload(rootPath: string,
    registryRootPath: string = rootPath): TraceStatusPayload | null {
    const planningPayload = buildTraceStatusPayload(
        resolveActivePlanningSession(rootPath),
        rootPath,
        registryRootPath,
    );
    const runtimeBead = resolveLatestRuntimeTraceBead(rootPath, registryRootPath);
    const runtimePayload = runtimeBead ? buildRuntimeTraceStatusPayload(runtimeBead, rootPath, registryRootPath) : null;

    if (!planningPayload) {
        return runtimePayload;
    }
    if (!runtimePayload) {
        return planningPayload;
    }
    return runtimePayload.updated_at > planningPayload.updated_at
        ? runtimePayload
        : planningPayload;
}
export function resolveActiveTraceHandoffPayload(rootPath: string,
    registryRootPath: string = rootPath): TraceAgentHandoffPayload | null {
    return resolveActiveTraceStatusPayload(rootPath, registryRootPath)?.agent_handoff ?? null;
}
export function buildTraceFailuresPayload(sessions: HallPlanningSessionRecord[], rootPath: string,
    registryRootPath: string = rootPath): TraceFailuresPayload {
    return {
        count: sessions.length,
        sessions: sessions
            .map((session) => buildTraceStatusPayload(session, rootPath, registryRootPath))
            .filter((session): session is TraceFailureEntryPayload => session !== null),
    };
}
export function buildTraceHandoffPayload(session: HallPlanningSessionRecord | null, rootPath: string,
    registryRootPath: string = rootPath): TraceAgentHandoffPayload | null {
    return buildTraceAgentHandoffPayload(session, rootPath, registryRootPath);
}
