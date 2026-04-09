import type { SovereignBead } from '../../../types/bead.js';
import type { HallSkillActivationRecord } from '../../../types/hall.js';

export interface PlannedSkillActivation {
    skill_id: string;
    adapter_id: string;
    role: string;
    intent: string;
    target_path?: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface PlanningExecutionHints {
    planning_session_id?: string;
    trace_selection_name?: string;
    trace_selection_tier?: string;
    execution_profile?: 'governance' | 'implementation';
}

function hasChecker(bead: SovereignBead): boolean {
    return typeof bead.checker_shell === 'string' && bead.checker_shell.trim().length > 0;
}

function hasCritiqueTargets(bead: SovereignBead): boolean {
    return Array.isArray(bead.critique_payload?.targets) && bead.critique_payload.targets.length > 1;
}

function isDocsLike(targetPath: string): boolean {
    return /\.(md|qmd|feature|txt|rst)$/i.test(targetPath);
}

function isCodeLike(targetPath: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|rs|java|c|cc|cpp|h)$/i.test(targetPath);
}

function withPlanningHints(
    metadata: Record<string, unknown>,
    hints: PlanningExecutionHints | undefined,
): Record<string, unknown> {
    if (!hints) {
        return metadata;
    }

    return {
        ...metadata,
        planning_session_id: hints.planning_session_id,
        trace_selection_name: hints.trace_selection_name,
        trace_selection_tier: hints.trace_selection_tier,
        trace_execution_profile: hints.execution_profile,
    };
}

export function planSkillActivationForBead(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): PlannedSkillActivation {
    const targetPath = String(bead.target_path ?? bead.target_ref ?? '').trim();
    const normalizedTarget = targetPath.toLowerCase();
    const rationale = String(bead.rationale ?? '').trim();
    const isWorkflowTarget = bead.target_kind === 'WORKFLOW' || bead.target_kind === 'REPOSITORY' || bead.target_kind === 'OTHER';
    const targetsPlanningState = typeof bead.target_ref === 'string' && bead.target_ref.startsWith('chant-session:');
    const architectureHeavy = typeof bead.architect_opinion === 'string' && bead.architect_opinion.trim().length > 0;
    const isTechnicalChild = bead.id.includes(':child:technical');
    const isLedgerChild = bead.id.includes(':child:ledger');

    if (hints?.execution_profile === 'implementation' && isTechnicalChild) {
        return {
            skill_id: 'autobot',
            adapter_id: 'weave:autobot',
            role: 'backend',
            intent: rationale || `Execute implementation child ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                bead_id: bead.id,
                checker_shell: bead.checker_shell,
            },
            metadata: withPlanningHints({
                activation_class: 'implementation',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    if (hints?.execution_profile === 'governance' && isLedgerChild) {
        return {
            skill_id: 'research',
            adapter_id: 'weave:research',
            role: 'governance',
            intent: rationale || `Governance follow-through for ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                intent: rationale || `Governance follow-through for ${bead.id}`,
                rationale: bead.rationale,
                subquestions: [targetPath].filter(Boolean),
            },
            metadata: withPlanningHints({
                activation_class: 'governance',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    if (isWorkflowTarget || targetsPlanningState || architectureHeavy) {
        return {
            skill_id: 'research',
            adapter_id: 'weave:research',
            role: 'architect',
            intent: rationale || `Architectural planning for ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                intent: rationale || `Architectural planning for ${bead.id}`,
                rationale: bead.rationale,
                subquestions: [targetPath].filter(Boolean),
            },
            metadata: withPlanningHints({
                activation_class: 'planning',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    if (hasCritiqueTargets(bead) || /\b(review|critique|regression)\b/i.test(rationale)) {
        return {
            skill_id: 'critique',
            adapter_id: 'weave:critique',
            role: 'reviewer',
            intent: rationale || `Critique ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                bead_id: bead.id,
                target_path: targetPath,
            },
            metadata: withPlanningHints({
                activation_class: 'review',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    if (hasChecker(bead) || /\b(verify|validation|test)\b/i.test(rationale) || isDocsLike(normalizedTarget)) {
        return {
            skill_id: 'autobot',
            adapter_id: 'weave:autobot',
            role: hasChecker(bead) ? 'tester' : 'documenter',
            intent: rationale || `Execute bounded bead ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                bead_id: bead.id,
                checker_shell: bead.checker_shell,
            },
            metadata: withPlanningHints({
                activation_class: hasChecker(bead) ? 'verification' : 'documentation',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    if (isCodeLike(normalizedTarget)) {
        return {
            skill_id: 'autobot',
            adapter_id: 'weave:autobot',
            role: 'backend',
            intent: rationale || `Implement ${bead.id}`,
            target_path: targetPath || undefined,
            payload: {
                bead_id: bead.id,
            },
            metadata: withPlanningHints({
                activation_class: 'implementation',
                source_bead_id: bead.id,
            }, hints),
        };
    }

    return {
        skill_id: 'research',
        adapter_id: 'weave:research',
        role: 'scout',
        intent: rationale || `Investigate ${bead.id}`,
        target_path: targetPath || undefined,
        payload: {
            intent: rationale || `Investigate ${bead.id}`,
            rationale: bead.rationale,
        },
        metadata: withPlanningHints({
            activation_class: 'observation',
            source_bead_id: bead.id,
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
    return {
        activation_id: activationId,
        repo_id: repoId,
        bead_id: bead.id,
        session_id: sessionId,
        skill_id: planned.skill_id,
        adapter_id: planned.adapter_id,
        role: planned.role,
        status: 'ACTIVE',
        intent: planned.intent,
        target_path: planned.target_path,
        payload: planned.payload,
        created_at: now,
        updated_at: now,
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
    const base = {
        project_root: projectRoot,
        cwd,
        planning_session_id: hints?.planning_session_id,
        trace_selection_name: hints?.trace_selection_name,
        trace_selection_tier: hints?.trace_selection_tier,
        trace_execution_profile: hints?.execution_profile,
    };

    if (planned.adapter_id === 'weave:research') {
        return {
            ...base,
            intent: planned.intent,
            rationale: bead.rationale,
            subquestions: Array.isArray(planned.payload?.subquestions) ? planned.payload?.subquestions : undefined,
            subagent_profile: planned.role,
        };
    }

    if (planned.adapter_id === 'weave:critique') {
        return {
            ...base,
            bead: {
                id: bead.id,
                title: bead.id,
                rationale: bead.rationale,
                target_kind: bead.target_kind,
                target_path: bead.target_path,
                target_ref: bead.target_ref,
                acceptance_criteria: bead.acceptance_criteria,
                architect_opinion: bead.architect_opinion,
            },
            research: {
                rationale: bead.rationale,
                target_path: bead.target_path,
                target_ref: bead.target_ref,
                architect_opinion: bead.architect_opinion,
                critique_payload: bead.critique_payload ?? {},
            },
            context: bead.rationale,
            focus_areas: ['architecture', 'execution', 'verification'],
        };
    }

    if (planned.adapter_id === 'weave:autobot') {
        return {
            ...base,
            bead_id: bead.id,
            checker_shell: bead.checker_shell,
            source: 'runtime:orchestrate-skill',
            worker_note: planned.intent,
        };
    }

    return {
        ...base,
        bead_id: bead.id,
        ...planned.payload,
    };
}
