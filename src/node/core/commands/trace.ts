import { Command } from 'commander';
import chalk from 'chalk';

import { getHallBeads, getHallPlanningSession, listHallPlanningSessions } from '../../../tools/pennyone/intel/database.js';
import type { SovereignBead } from '../../../types/bead.js';
import type { HallOneMindBranchDigest, HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../types/hall.js';
import { compactPlanningHandle, formatPlanningDigestBadge } from '../operator_resume.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';

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

export type TraceExecutionGate =
    | 'planning_active'
    | 'review_required'
    | 'worker_review_required'
    | 'operator_release_required'
    | 'execution_guarded'
    | 'input_required'
    | 'failure_recovery'
    | 'completed';

export interface TraceFailureDiagnosticsPayload {
    phase?: string;
    error?: string;
    recovery_hint?: string;
    failed_at?: number;
}

export interface TraceHostContextPayload {
    trace_line?: string;
    trace_summary?: string;
    note_line?: string;
    note?: string;
    updated_at?: number;
    updated_at_iso?: string;
}

export interface TraceContractPayload {
    intent_category?: string;
    intent?: string;
    selection_tier?: string;
    selection_name?: string;
    trajectory_status?: string;
    trajectory_reason?: string;
    mimirs_well: string[];
    gungnir_verdict?: string;
    confidence?: number;
    body?: string;
    canonical_intent?: string;
    council_expert?: {
        id?: string;
        label?: string;
        profile?: string;
        protocol?: string;
        lens?: string;
        anti_behavior?: string[];
        root_persona_directive?: string;
        selection_reason?: string;
    };
}

export interface TraceLineagePayload {
    origin: 'planning_session' | 'runtime_execution';
    planning_session_id?: string;
    mission_id?: string;
    mission_bead_id?: string;
    runtime_bead_id?: string;
    trace_scope?: string;
    trace_weave_id?: string;
    trace_designation_source?: string;
}

export interface TraceWorkItemPayload {
    bead_id: string;
    status: string;
    target_path?: string;
    rationale: string;
    acceptance_criteria?: string;
    checker_shell?: string;
}

export interface TraceAgentHandoffPayload {
    execution_gate: TraceExecutionGate;
    phase: string;
    next_action: string;
    resume_command: string;
    validation_command?: string;
    lead_bead_id?: string;
    target_paths: string[];
    checker_shells: string[];
    proposal_ids: string[];
    bead_ids: string[];
    host_context?: TraceHostContextPayload;
    designation?: TraceContractPayload;
    work_items: TraceWorkItemPayload[];
}

export interface TraceStatusPayload {
    origin?: 'planning_session' | 'runtime_execution';
    trace_id?: string;
    session_id?: string;
    runtime_bead_id?: string;
    mission_bead_id?: string;
    handle?: string;
    status: string;
    updated_at: number;
    updated_at_iso: string;
    user_intent: string;
    normalized_intent: string;
    focus?: string;
    digest_badge?: string;
    current_bead_id?: string;
    bead_ids: string[];
    proposal_ids: string[];
    bead_summary: {
        total: number;
        set: number;
        open: number;
        review: number;
    };
    artifacts: string[];
    failure?: TraceFailureDiagnosticsPayload;
    host_context?: TraceHostContextPayload;
    trace_contract?: TraceContractPayload;
    lineage?: TraceLineagePayload;
    agent_handoff: TraceAgentHandoffPayload;
    branches: Array<{
        kind: string;
        count: number;
        needs_revision: boolean;
        labels: string[];
        summary?: string;
        artifacts: string[];
        evidence_sources: string[];
        proposed_paths: string[];
    }>;
}

export interface TraceFailureEntryPayload extends TraceStatusPayload {}

export interface TraceFailuresPayload {
    count: number;
    sessions: TraceFailureEntryPayload[];
}

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

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function getSessionStringMetadata(session: HallPlanningSessionRecord, key: string): string | undefined {
    const value = session.metadata?.[key];
    return typeof value === 'string' && value.trim()
        ? value.trim()
        : undefined;
}

function getSessionNumberMetadata(session: HallPlanningSessionRecord, key: string): number | undefined {
    const value = session.metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
}

function parsePrefixedContextValue(value: string | undefined, prefix: string): string | undefined {
    if (!value) {
        return undefined;
    }
    return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value.trim();
}

function getFailureDiagnostics(session: HallPlanningSessionRecord): TraceFailureDiagnosticsPayload | undefined {
    const phase = getSessionStringMetadata(session, 'failure_phase')
        ?? getSessionStringMetadata(session, 'phase_in_flight');
    const error = getSessionStringMetadata(session, 'failure_error');
    const recoveryHint = getSessionStringMetadata(session, 'recovery_hint');
    const failedAt = getSessionNumberMetadata(session, 'failure_timestamp');
    if (!phase && !error && !recoveryHint && !failedAt) {
        return undefined;
    }
    return {
        phase,
        error,
        recovery_hint: recoveryHint,
        failed_at: failedAt,
    };
}

function getHostContextFromMetadata(metadata: Record<string, unknown> | undefined): TraceHostContextPayload | undefined {
    const context = metadata?.host_cli_context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return undefined;
    }

    const normalized = context as Record<string, unknown>;
    const traceLine = typeof normalized.trace_line === 'string' && normalized.trace_line.trim()
        ? normalized.trace_line.trim()
        : undefined;
    const noteLine = typeof normalized.note_line === 'string' && normalized.note_line.trim()
        ? normalized.note_line.trim()
        : undefined;
    const updatedAt = typeof normalized.updated_at === 'number' && Number.isFinite(normalized.updated_at)
        ? normalized.updated_at
        : undefined;

    if (!traceLine && !noteLine && !updatedAt) {
        return undefined;
    }

    return {
        trace_line: traceLine,
        trace_summary: parsePrefixedContextValue(traceLine, 'trace='),
        note_line: noteLine,
        note: parsePrefixedContextValue(noteLine, 'note='),
        updated_at: updatedAt,
        updated_at_iso: updatedAt ? formatTraceTimestamp(updatedAt) : undefined,
    };
}

function getTraceContractFromMetadata(metadata: Record<string, unknown> | undefined): TraceContractPayload | undefined {
    const contract = metadata?.trace_contract;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
        return undefined;
    }

    const normalized = contract as Record<string, unknown>;
    const mimirsWell = asStringArray(normalized.mimirs_well);
    const payload: TraceContractPayload = {
        mimirs_well: mimirsWell,
    };

    if (typeof normalized.intent_category === 'string' && normalized.intent_category.trim()) {
        payload.intent_category = normalized.intent_category.trim();
    }
    if (typeof normalized.intent === 'string' && normalized.intent.trim()) {
        payload.intent = normalized.intent.trim();
    }
    if (typeof normalized.selection_tier === 'string' && normalized.selection_tier.trim()) {
        payload.selection_tier = normalized.selection_tier.trim();
    }
    if (typeof normalized.selection_name === 'string' && normalized.selection_name.trim()) {
        payload.selection_name = normalized.selection_name.trim();
    }
    if (typeof normalized.trajectory_status === 'string' && normalized.trajectory_status.trim()) {
        payload.trajectory_status = normalized.trajectory_status.trim();
    }
    if (typeof normalized.trajectory_reason === 'string' && normalized.trajectory_reason.trim()) {
        payload.trajectory_reason = normalized.trajectory_reason.trim();
    }
    if (typeof normalized.gungnir_verdict === 'string' && normalized.gungnir_verdict.trim()) {
        payload.gungnir_verdict = normalized.gungnir_verdict.trim();
    }
    if (typeof normalized.confidence === 'number' && Number.isFinite(normalized.confidence)) {
        payload.confidence = normalized.confidence;
    }
    if (typeof normalized.body === 'string' && normalized.body.trim()) {
        payload.body = normalized.body.trim();
    }
    if (typeof normalized.canonical_intent === 'string' && normalized.canonical_intent.trim()) {
        payload.canonical_intent = normalized.canonical_intent.trim();
    }
    if (normalized.council_expert && typeof normalized.council_expert === 'object' && !Array.isArray(normalized.council_expert)) {
        const expert = normalized.council_expert as Record<string, unknown>;
        const antiBehavior = asStringArray(expert.anti_behavior);
        payload.council_expert = {
            id: typeof expert.id === 'string' && expert.id.trim() ? expert.id.trim() : undefined,
            label: typeof expert.label === 'string' && expert.label.trim() ? expert.label.trim() : undefined,
            profile: typeof expert.profile === 'string' && expert.profile.trim() ? expert.profile.trim() : undefined,
            protocol: typeof expert.protocol === 'string' && expert.protocol.trim() ? expert.protocol.trim() : undefined,
            lens: typeof expert.lens === 'string' && expert.lens.trim() ? expert.lens.trim() : undefined,
            anti_behavior: antiBehavior.length > 0 ? antiBehavior : undefined,
            root_persona_directive: typeof expert.root_persona_directive === 'string' && expert.root_persona_directive.trim()
                ? expert.root_persona_directive.trim()
                : undefined,
            selection_reason: typeof expert.selection_reason === 'string' && expert.selection_reason.trim()
                ? expert.selection_reason.trim()
                : undefined,
        };
    }

    return Object.keys(payload).length > 1 ? payload : undefined;
}

function getTraceLineageFromMetadata(
    metadata: Record<string, unknown> | undefined,
    origin: 'planning_session' | 'runtime_execution',
    extras: Partial<TraceLineagePayload> = {},
): TraceLineagePayload | undefined {
    const planningSessionId = typeof extras.planning_session_id === 'string' && extras.planning_session_id.trim()
        ? extras.planning_session_id.trim()
        : typeof metadata?.planning_session_id === 'string' && metadata.planning_session_id.trim()
            ? metadata.planning_session_id.trim()
            : undefined;
    const missionId = typeof metadata?.mission_id === 'string' && metadata.mission_id.trim()
        ? metadata.mission_id.trim()
        : undefined;
    const missionBeadId = typeof extras.mission_bead_id === 'string' && extras.mission_bead_id.trim()
        ? extras.mission_bead_id.trim()
        : typeof metadata?.mission_bead_id === 'string' && metadata.mission_bead_id.trim()
            ? metadata.mission_bead_id.trim()
            : undefined;
    const runtimeBeadId = typeof extras.runtime_bead_id === 'string' && extras.runtime_bead_id.trim()
        ? extras.runtime_bead_id.trim()
        : typeof metadata?.execution_bead_id === 'string' && metadata.execution_bead_id.trim()
            ? metadata.execution_bead_id.trim()
            : undefined;
    const traceScope = typeof metadata?.trace_scope === 'string' && metadata.trace_scope.trim()
        ? metadata.trace_scope.trim()
        : undefined;
    const traceWeaveId = typeof metadata?.trace_weave_id === 'string' && metadata.trace_weave_id.trim()
        ? metadata.trace_weave_id.trim()
        : undefined;
    const traceDesignationSource = typeof metadata?.trace_designation_source === 'string' && metadata.trace_designation_source.trim()
        ? metadata.trace_designation_source.trim()
        : undefined;

    if (!planningSessionId && !missionId && !missionBeadId && !runtimeBeadId && !traceScope && !traceWeaveId && !traceDesignationSource) {
        return undefined;
    }

    return {
        origin,
        planning_session_id: planningSessionId,
        mission_id: missionId,
        mission_bead_id: missionBeadId,
        runtime_bead_id: runtimeBeadId,
        trace_scope: traceScope,
        trace_weave_id: traceWeaveId,
        trace_designation_source: traceDesignationSource,
    };
}

function getHostContext(session: HallPlanningSessionRecord): TraceHostContextPayload | undefined {
    return getHostContextFromMetadata(session.metadata as Record<string, unknown> | undefined);
}

function getTraceContract(session: HallPlanningSessionRecord): TraceContractPayload | undefined {
    return getTraceContractFromMetadata(session.metadata as Record<string, unknown> | undefined);
}

function formatTraceDesignation(contract: TraceContractPayload | undefined): string | undefined {
    if (!contract) {
        return undefined;
    }
    if (contract.selection_tier && contract.selection_name) {
        return `${contract.selection_tier}: ${contract.selection_name}`;
    }
    return contract.selection_name;
}

function hydratePlanningSession(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
): HallPlanningSessionRecord | null {
    if (!session) {
        return null;
    }
    return getHallPlanningSession(session.session_id, rootPath) ?? session;
}

function resolveActivePlanningSession(rootPath: string): HallPlanningSessionRecord | null {
    const active = listHallPlanningSessions(rootPath, { statuses: ACTIVE_PLANNING_STATUSES });
    return hydratePlanningSession(active[0] ?? listHallPlanningSessions(rootPath)[0] ?? null, rootPath);
}

function resolveFailedPlanningSessions(rootPath: string, limit: number): HallPlanningSessionRecord[] {
    return listHallPlanningSessions(rootPath, { statuses: FAILED_PLANNING_STATUSES })
        .slice(0, limit)
        .map((session) => hydratePlanningSession(session, rootPath) ?? session);
}

function rankRuntimeTraceBead(bead: SovereignBead): number {
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

function resolveLatestRuntimeTraceBead(rootPath: string): SovereignBead | null {
    const beads = getHallBeads(rootPath)
        .filter((bead) => bead.id.includes(':exec:'))
        .filter((bead) => bead.status !== 'ARCHIVED' && bead.status !== 'SUPERSEDED')
        .filter((bead) => (bead.metadata as Record<string, unknown> | undefined)?.archived !== true)
        .filter((bead) => getTraceContractFromMetadata(bead.metadata as Record<string, unknown> | undefined))
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

function deriveRuntimeExecutionGate(status: SovereignBead['status']): TraceExecutionGate {
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

function buildRuntimeNextAction(bead: SovereignBead, hostContext: TraceHostContextPayload | undefined): string {
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

function buildRuntimeTraceHandoffPayload(bead: SovereignBead): TraceAgentHandoffPayload {
    const metadata = bead.metadata as Record<string, unknown> | undefined;
    const hostContext = getHostContextFromMetadata(metadata);
    const traceContract = getTraceContractFromMetadata(metadata);
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

function buildRuntimeTraceStatusPayload(bead: SovereignBead): TraceStatusPayload {
    const metadata = bead.metadata as Record<string, unknown> | undefined;
    const handoff = buildRuntimeTraceHandoffPayload(bead);
    const traceContract = getTraceContractFromMetadata(metadata);
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
        ...(traceContract ? { trace_contract: traceContract } : {}),
        ...(lineage ? { lineage } : {}),
        agent_handoff: handoff,
        branches: [],
    };
}

function parseTraceLimit(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatTraceTimestamp(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : 'unknown';
}

function getSessionBeads(rootPath: string, session: HallPlanningSessionRecord): SovereignBead[] {
    const beadIds = new Set(asStringArray(session.metadata?.bead_ids));
    if (beadIds.size === 0) {
        return [];
    }
    return getHallBeads(rootPath).filter((bead) => beadIds.has(bead.id));
}

function isPathLikeArtifact(value: string): boolean {
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

function buildTraceWorkItems(beads: SovereignBead[]): TraceWorkItemPayload[] {
    return beads.map((bead) => ({
        bead_id: bead.id,
        status: bead.status,
        target_path: bead.target_path,
        rationale: bead.rationale,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
    }));
}

function collectTargetPaths(
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

function deriveExecutionGate(status: HallPlanningSessionStatus): TraceExecutionGate {
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

function buildDefaultNextAction(
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

function buildResumeCommand(session: HallPlanningSessionRecord, leadBeadId: string | undefined): string {
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

export function buildTraceAgentHandoffPayload(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
): TraceAgentHandoffPayload | null {
    const hydrated = hydratePlanningSession(session, rootPath);
    if (!hydrated) {
        const runtimeBead = resolveLatestRuntimeTraceBead(rootPath);
        return runtimeBead ? buildRuntimeTraceHandoffPayload(runtimeBead) : null;
    }

    const digest = getPlanningBranchDigest(hydrated);
    const failure = getFailureDiagnostics(hydrated);
    const hostContext = getHostContext(hydrated);
    const traceContract = getTraceContract(hydrated);
    const beads = getSessionBeads(rootPath, hydrated);
    const workItems = buildTraceWorkItems(beads);
    const beadIds = uniqueStrings(asStringArray(hydrated.metadata?.bead_ids));
    const proposalIds = uniqueStrings(asStringArray(hydrated.metadata?.proposal_ids));
    const leadBeadId = hydrated.current_bead_id?.trim() || beadIds[0];
    const gate = deriveExecutionGate(hydrated.status);
    const checkerShells = uniqueStrings(workItems.map((item) => item.checker_shell ?? '').filter(Boolean));
    const nextAction = hostContext?.note || buildDefaultNextAction(hydrated, gate, failure);
    const validationCommand = checkerShells[0];

    return {
        execution_gate: gate,
        phase: failure?.phase
            ?? getSessionStringMetadata(hydrated, 'phase_in_flight')
            ?? hydrated.status,
        next_action: nextAction,
        resume_command: buildResumeCommand(hydrated, leadBeadId),
        validation_command: validationCommand,
        lead_bead_id: leadBeadId,
        target_paths: collectTargetPaths(rootPath, beads, digest),
        checker_shells: checkerShells,
        proposal_ids: proposalIds,
        bead_ids: beadIds,
        host_context: hostContext,
        designation: traceContract,
        work_items: workItems,
    };
}

export function renderTraceHandoffLines(handoff: TraceAgentHandoffPayload | null): string[] {
    if (!handoff) {
        return [chalk.dim('handoff=none')];
    }

    const lines = [
        chalk.cyan(`[HANDOFF] gate=${handoff.execution_gate} phase=${handoff.phase}`),
        chalk.dim(`next=${handoff.next_action}`),
        chalk.dim(`resume=${handoff.resume_command}`),
    ];

    const designation = formatTraceDesignation(handoff.designation);
    if (designation) {
        lines.push(chalk.dim(`designation=${designation}`));
    }
    if (handoff.designation?.intent_category) {
        lines.push(chalk.dim(`category=${handoff.designation.intent_category}`));
    }
    if (handoff.designation?.trajectory_status) {
        lines.push(chalk.dim(`trajectory=${handoff.designation.trajectory_status}`));
    }
    if (handoff.designation?.council_expert?.label) {
        lines.push(chalk.dim(`expert=${handoff.designation.council_expert.label}`));
    }
    if (handoff.designation?.council_expert?.selection_reason) {
        lines.push(chalk.dim(`expert_reason=${handoff.designation.council_expert.selection_reason}`));
    }
    if (handoff.designation?.council_expert?.anti_behavior?.length) {
        lines.push(chalk.dim(`anti=${handoff.designation.council_expert.anti_behavior.slice(0, 2).join(' ')}`));
    }

    if (handoff.lead_bead_id) {
        lines.push(chalk.dim(`lead_bead=${handoff.lead_bead_id}`));
    }
    if (handoff.target_paths.length > 0) {
        lines.push(chalk.dim(`targets=${handoff.target_paths.slice(0, 4).join(', ')}`));
    }
    if (handoff.validation_command) {
        lines.push(chalk.dim(`validate=${handoff.validation_command}`));
    }
    if (handoff.host_context?.note) {
        lines.push(chalk.dim(`note=${handoff.host_context.note}`));
    }

    return lines;
}

export function buildTraceStatusPayload(session: HallPlanningSessionRecord | null, rootPath: string): TraceStatusPayload | null {
    const hydrated = hydratePlanningSession(session, rootPath);
    if (!hydrated) {
        const runtimeBead = resolveLatestRuntimeTraceBead(rootPath);
        return runtimeBead ? buildRuntimeTraceStatusPayload(runtimeBead) : null;
    }

    const digest = getPlanningBranchDigest(hydrated);
    const failure = getFailureDiagnostics(hydrated);
    const handoff = buildTraceAgentHandoffPayload(hydrated, rootPath)!;
    const traceContract = getTraceContract(hydrated);
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
        ...(traceContract ? { trace_contract: traceContract } : {}),
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

function resolveActiveTraceStatusPayload(rootPath: string): TraceStatusPayload | null {
    const planningPayload = buildTraceStatusPayload(resolveActivePlanningSession(rootPath), rootPath);
    const runtimeBead = resolveLatestRuntimeTraceBead(rootPath);
    const runtimePayload = runtimeBead ? buildRuntimeTraceStatusPayload(runtimeBead) : null;

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

function resolveActiveTraceHandoffPayload(rootPath: string): TraceAgentHandoffPayload | null {
    return resolveActiveTraceStatusPayload(rootPath)?.agent_handoff ?? null;
}

export function renderTraceStatusLines(session: HallPlanningSessionRecord | null, rootPath: string): string[] {
    const payload = buildTraceStatusPayload(session, rootPath);
    if (!payload) {
        return [chalk.dim('trace=none')];
    }

    const lines = [
        chalk.cyan(`[TRACE] ${payload.status} ${payload.handle ?? payload.session_id ?? 'unknown'}`),
        chalk.dim(`focus=${payload.focus}`),
        chalk.dim(`updated=${payload.updated_at_iso}`),
    ];

    if (payload.digest_badge) {
        lines.push(chalk.dim(`digest=${payload.digest_badge}`));
    }

    lines.push(chalk.dim(
        `beads total=${payload.bead_summary.total} set=${payload.bead_summary.set} open=${payload.bead_summary.open} review=${payload.bead_summary.review}`,
    ));
    lines.push(chalk.dim(`gate=${payload.agent_handoff.execution_gate}`));
    lines.push(chalk.dim(`resume=${payload.agent_handoff.resume_command}`));
    const designation = formatTraceDesignation(payload.trace_contract);
    if (designation) {
        lines.push(chalk.dim(`designation=${designation}`));
    }
    if (payload.trace_contract?.intent_category) {
        lines.push(chalk.dim(`category=${payload.trace_contract.intent_category}`));
    }
    if (payload.trace_contract?.trajectory_status) {
        lines.push(chalk.dim(`trajectory=${payload.trace_contract.trajectory_status}`));
    }
    if (payload.trace_contract?.council_expert?.label) {
        lines.push(chalk.dim(`expert=${payload.trace_contract.council_expert.label}`));
    }
    if (payload.trace_contract?.council_expert?.selection_reason) {
        lines.push(chalk.dim(`expert_reason=${payload.trace_contract.council_expert.selection_reason}`));
    }
    if (payload.trace_contract?.council_expert?.anti_behavior?.length) {
        lines.push(chalk.dim(`anti=${payload.trace_contract.council_expert.anti_behavior.slice(0, 2).join(' ')}`));
    }
    if (payload.lineage?.trace_designation_source) {
        lines.push(chalk.dim(`designation_source=${payload.lineage.trace_designation_source}`));
    }

    if (payload.agent_handoff.lead_bead_id) {
        lines.push(chalk.dim(`lead_bead=${payload.agent_handoff.lead_bead_id}`));
    }
    if (payload.agent_handoff.target_paths.length > 0) {
        lines.push(chalk.dim(`targets=${payload.agent_handoff.target_paths.slice(0, 4).join(', ')}`));
    }
    if (payload.failure?.phase) {
        lines.push(chalk.dim(`failure_phase=${payload.failure.phase}`));
    }
    if (payload.failure?.error) {
        lines.push(chalk.dim(`failure_error=${payload.failure.error}`));
    }
    if (payload.failure?.recovery_hint) {
        lines.push(chalk.dim(`next=${payload.failure.recovery_hint}`));
    } else {
        lines.push(chalk.dim(`next=${payload.agent_handoff.next_action}`));
    }

    if (payload.agent_handoff.validation_command) {
        lines.push(chalk.dim(`validate=${payload.agent_handoff.validation_command}`));
    }
    if (payload.host_context?.note) {
        lines.push(chalk.dim(`note=${payload.host_context.note}`));
    }
    if (payload.artifacts.length > 0) {
        lines.push(chalk.dim(`artifacts=${payload.artifacts.slice(0, 4).join(', ')}`));
    }

    for (const group of payload.branches.slice(0, 4)) {
        const labels = group.labels.slice(0, 3).join(', ');
        lines.push(chalk.dim(
            `branch ${group.kind} x${group.count}${group.needs_revision ? ' rev' : ''}${labels ? ` labels=${labels}` : ''}`,
        ));
    }

    return lines;
}

export function buildTraceFailuresPayload(
    sessions: HallPlanningSessionRecord[],
    rootPath: string,
): TraceFailuresPayload {
    return {
        count: sessions.length,
        sessions: sessions
            .map((session) => buildTraceStatusPayload(session, rootPath))
            .filter((session): session is TraceFailureEntryPayload => session !== null),
    };
}

export function renderTraceFailureLines(sessions: HallPlanningSessionRecord[], rootPath: string): string[] {
    const payload = buildTraceFailuresPayload(sessions, rootPath);
    if (payload.sessions.length === 0) {
        return [chalk.dim('trace_failures=none')];
    }

    const lines: string[] = [];
    payload.sessions.forEach((session, index) => {
        lines.push(chalk.cyan(`[TRACE] FAILED ${session.handle ?? session.session_id ?? 'unknown'} updated=${session.updated_at_iso}`));
        lines.push(chalk.dim(`focus=${session.focus ?? 'Failed planning session.'}`));
        lines.push(chalk.dim(
            `beads total=${session.bead_summary.total} set=${session.bead_summary.set} open=${session.bead_summary.open} review=${session.bead_summary.review}`,
        ));
        lines.push(chalk.dim(`gate=${session.agent_handoff.execution_gate}`));
        lines.push(chalk.dim(`resume=${session.agent_handoff.resume_command}`));
        if (session.failure?.phase) {
            lines.push(chalk.dim(`failure_phase=${session.failure.phase}`));
        }
        if (session.failure?.error) {
            lines.push(chalk.dim(`failure_error=${session.failure.error}`));
        }
        lines.push(chalk.dim(`next=${session.agent_handoff.next_action}`));
        if (index < payload.sessions.length - 1) {
            lines.push(chalk.dim('---'));
        }
    });
    return lines;
}

export function buildTraceHandoffPayload(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
): TraceAgentHandoffPayload | null {
    return buildTraceAgentHandoffPayload(session, rootPath);
}

export function registerTraceCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('trace')
        .description('Inspect the active Hall-backed planning or runtime trace');

    command
        .command('status')
        .description('Show the active planning or runtime trace summary from Hall')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = resolveActiveTraceStatusPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of payload ? renderTraceStatusLines(
                payload.origin === 'planning_session' ? resolveActivePlanningSession(rootPath) : null,
                rootPath,
            ) : [chalk.dim('trace=none')]) {
                console.log(line);
            }
        });

    command
        .command('handoff')
        .description('Show the active planning or runtime trace as an agent-ready handoff packet')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const handoff = resolveActiveTraceHandoffPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
                return;
            }
            for (const line of renderTraceHandoffLines(handoff)) {
                console.log(line);
            }
        });

    command
        .command('failures')
        .description('List recent failed planning sessions from Hall')
        .option('-l, --limit <n>', 'Maximum failed sessions to show', '5')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { limit?: string; json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const limit = parseTraceLimit(options.limit, 5);
            const sessions = resolveFailedPlanningSessions(rootPath, limit);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(buildTraceFailuresPayload(sessions, rootPath), null, 2)}\n`);
                return;
            }
            for (const line of renderTraceFailureLines(sessions, rootPath)) {
                console.log(line);
            }
        });
}
