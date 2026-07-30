import type { SovereignBead } from '../../../../types/bead.js';
import {
    planSkillActivationForBead,
    type DurableRequestTool,
    type PlannedSkillActivation,
    type PlanningExecutionHints,
} from '../skill_activation.js';

export type DurableExecutionRoute = DurableRequestTool | 'FAIL_CLOSED';

export interface DurableTransitionOutcome {
    status: 'BLOCKED';
    route: DurableExecutionRoute;
    activation_id: string;
    operator_action_required: true;
    required_request?: DurableRequestTool;
    execution_dispatched: false;
    provider_requests_started: 0;
    source_execution_started: false;
    checker_execution_started: false;
    git_actions_started: false;
    reason: string;
}

export function resolveExecutionRoute(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): DurableExecutionRoute {
    return planSkillActivationForBead(bead, hints).required_request ?? 'FAIL_CLOSED';
}

export function buildDurableActivationId(
    bead: SovereignBead,
    planned: PlannedSkillActivation,
): string {
    return `activation:${bead.id}:operator-needed:${planned.required_request ?? 'unclassified'}`;
}

/**
 * Compatibility tombstone. The former implementation wrote Hall directly.
 * Callers must use the matching cstar-kernel request/lifecycle tool instead.
 */
export function persistDurableWorkTransition(_input: {
    bead: SovereignBead;
    repoId: string;
    sessionId?: string;
    hints?: PlanningExecutionHints;
}): never {
    void _input;
    throw new Error('legacy_orchestrate_transition_retired_use_cstar_kernel');
}
