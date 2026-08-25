import type { SovereignBead } from '../../../types/bead.js';
import type { HallSkillActivationRecord } from '../../../types/hall.js';

export type DurableWorkClass = 'implementation' | 'evidence' | 'unknown';
export type DurableRequestTool = 'cstar_forge_request' | 'cstar_researcher_request';
export type DurableTransitionState = 'OPERATOR_NEEDED' | 'FAILED_CLOSED';

export interface PlannedSkillActivation {
    skill_id: string;
    adapter_id: 'operator-needed';
    role: 'operator';
    intent: string;
    target_path?: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    work_class: DurableWorkClass;
    required_request?: DurableRequestTool;
    transition: DurableTransitionState;
    reason: string;
}

export interface PlanningExecutionHints {
    planning_session_id?: string;
    trace_selection_name?: string;
    trace_selection_tier?: string;
    execution_profile?: 'governance' | 'implementation';
}

const CODE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|c|cc|cpp|h)$/i;
const DOCS_PATTERN = /\.(md|qmd|feature|txt|rst)$/i;
const IMPLEMENTATION_PATTERN = /\b(build|code|implement|implementation|repair|fix|change|create|write|update|check|checker|test|verify|validate|validation|document|documentation|docs)\b/i;
const EVIDENCE_PATTERN = /\b(research|evidence|investigate|analysis|analyze|analyse|review|critique|survey|collect|compare|audit|inspect|discover)\b/i;

function targetPathOf(bead: SovereignBead): string {
    return String(bead.target_path ?? bead.target_ref ?? '').trim();
}

function hasChecker(bead: SovereignBead): boolean {
    return typeof bead.checker_shell === 'string' && bead.checker_shell.trim().length > 0;
}

function hasCritiqueTargets(bead: SovereignBead): boolean {
    return Array.isArray(bead.critique_payload?.targets) && bead.critique_payload.targets.length > 0;
}

export function classifyDurableWork(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): DurableWorkClass {
    const targetPath = targetPathOf(bead);
    const rationale = [bead.rationale, bead.acceptance_criteria].filter(Boolean).join(' ');

    if (
        hints?.execution_profile === 'implementation'
        || hasChecker(bead)
        || CODE_PATTERN.test(targetPath)
        || DOCS_PATTERN.test(targetPath)
        || bead.target_kind === 'VALIDATION'
        || bead.target_kind === 'CONTRACT'
    ) {
        return 'implementation';
    }

    if (hasCritiqueTargets(bead)) {
        return 'evidence';
    }

    const implementationSignal = IMPLEMENTATION_PATTERN.test(rationale);
    const evidenceSignal = EVIDENCE_PATTERN.test(rationale);
    if (implementationSignal) {
        return 'implementation';
    }
    if (evidenceSignal) {
        return 'evidence';
    }
    return 'unknown';
}

function requestForClass(workClass: DurableWorkClass): DurableRequestTool | undefined {
    if (workClass === 'implementation') return 'cstar_forge_request';
    if (workClass === 'evidence') return 'cstar_researcher_request';
    return undefined;
}

function withPlanningHints(
    metadata: Record<string, unknown>,
    hints: PlanningExecutionHints | undefined,
): Record<string, unknown> {
    return {
        ...metadata,
        planning_session_id: hints?.planning_session_id,
        trace_selection_name: hints?.trace_selection_name,
        trace_selection_tier: hints?.trace_selection_tier,
        trace_execution_profile: hints?.execution_profile,
    };
}

export function planSkillActivationForBead(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): PlannedSkillActivation {
    const workClass = classifyDurableWork(bead, hints);
    const requiredRequest = requestForClass(workClass);
    const targetPath = targetPathOf(bead);
    const intent = String(bead.rationale ?? '').trim() || `Route ${bead.id} through a durable work request.`;
    const transition: DurableTransitionState = requiredRequest ? 'OPERATOR_NEEDED' : 'FAILED_CLOSED';
    const reason = requiredRequest
        ? `${workClass}_work_requires_${requiredRequest}`
        : 'durable_work_classification_unknown';

    return {
        skill_id: requiredRequest ?? 'unclassified-durable-work',
        adapter_id: 'operator-needed',
        role: 'operator',
        intent,
        target_path: targetPath || undefined,
        work_class: workClass,
        required_request: requiredRequest,
        transition,
        reason,
        payload: {
            bead_id: bead.id,
            target_paths: targetPath ? [targetPath] : [],
            acceptance_criteria: bead.acceptance_criteria,
            checker_present: hasChecker(bead),
            required_request: requiredRequest,
            operator_action_required: true,
            execution_dispatched: false,
        },
        metadata: withPlanningHints({
            activation_class: workClass,
            source_bead_id: bead.id,
            transition,
            required_request: requiredRequest,
            execution_dispatched: false,
            provider_requests_started: 0,
            source_execution_started: false,
            checker_execution_started: false,
            git_actions_started: false,
        }, hints),
    };
}

export function createPendingSkillActivationRecord(
    repoId: string,
    sessionId: string | undefined,
    bead: SovereignBead,
    activationId: string,
    planned: PlannedSkillActivation,
    now: number,
): HallSkillActivationRecord {
    const failedClosed = planned.transition === 'FAILED_CLOSED';
    return {
        activation_id: activationId,
        repo_id: repoId,
        bead_id: bead.id,
        session_id: sessionId,
        skill_id: planned.skill_id,
        adapter_id: planned.adapter_id,
        role: planned.role,
        status: failedClosed ? 'FAILED' : 'PENDING',
        intent: planned.intent,
        target_path: planned.target_path,
        payload: planned.payload,
        result_summary: failedClosed ? undefined : `Operator action required: ${planned.required_request}`,
        error_text: failedClosed ? planned.reason : undefined,
        created_at: now,
        updated_at: now,
        completed_at: failedClosed ? now : undefined,
        metadata: planned.metadata,
    };
}

export function buildSkillActivationParams(
    bead: SovereignBead,
    planned: PlannedSkillActivation,
    projectRoot: string,
    cwd: string,
    hints?: PlanningExecutionHints,
): Record<string, unknown> {
    return {
        bead_id: bead.id,
        project_root: projectRoot,
        cwd,
        work_class: planned.work_class,
        required_request: planned.required_request,
        operator_action_required: true,
        execution_dispatched: false,
        target_paths: planned.target_path ? [planned.target_path] : [],
        planning_session_id: hints?.planning_session_id,
        trace_selection_name: hints?.trace_selection_name,
        trace_selection_tier: hints?.trace_selection_tier,
        trace_execution_profile: hints?.execution_profile,
    };
}
