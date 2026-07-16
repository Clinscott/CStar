import {
    getHallPlanningSession,
    listHallPlanningSessions,
} from '../../../../tools/pennyone/intel/session_manager.js';
import type { SovereignBead } from '../../../../types/bead.js';
import type { HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../../types/hall.js';
import type { PlanningExecutionHints } from '../skill_activation.js';

export const orchestratePlanningDeps = {
    getPlanningSession: getHallPlanningSession,
    listPlanningSessions: listHallPlanningSessions,
};

const ACTIVE_SESSION_STATUSES: HallPlanningSessionStatus[] = ['FORGE_EXECUTION', 'PLAN_READY'];

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function auguryContract(session: HallPlanningSessionRecord | null): Record<string, unknown> | undefined {
    const contract = session?.metadata?.augury_contract ?? session?.metadata?.trace_contract;
    return contract && typeof contract === 'object' && !Array.isArray(contract)
        ? contract as Record<string, unknown>
        : undefined;
}

function selectionName(session: HallPlanningSessionRecord | null): string | undefined {
    const value = auguryContract(session)?.selection_name;
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined;
}

export function derivePlanningExecutionHints(
    session: HallPlanningSessionRecord | null,
): PlanningExecutionHints | undefined {
    const contract = auguryContract(session);
    const selected = selectionName(session);
    const selectionTier = typeof contract?.selection_tier === 'string' && contract.selection_tier.trim()
        ? contract.selection_tier.trim().toUpperCase()
        : undefined;
    const intentCategory = typeof contract?.intent_category === 'string' && contract.intent_category.trim()
        ? contract.intent_category.trim().toUpperCase()
        : undefined;
    const implementationSelections = [
        'creation_loop',
        'restoration',
        'evolve',
        'forge',
        'chant',
        'contract_hardening',
    ];
    const executionProfile = (
        (selected && implementationSelections.includes(selected))
        || (intentCategory && ['BUILD', 'REPAIR', 'EVOLVE', 'HARDEN', 'VERIFY'].includes(intentCategory))
    )
        ? 'implementation' as const
        : selected === 'orchestrate'
            ? 'governance' as const
            : undefined;

    if (!session?.session_id && !selected && !selectionTier && !executionProfile) return undefined;
    return {
        planning_session_id: session?.session_id,
        trace_selection_name: selected,
        trace_selection_tier: selectionTier,
        execution_profile: executionProfile,
    };
}

function rankSession(session: HallPlanningSessionRecord): number {
    if (selectionName(session) === 'orchestrate') return 0;
    if (session.status === 'FORGE_EXECUTION') return 1;
    if (session.status === 'PLAN_READY') return 2;
    return 3;
}

export function resolveOrchestratePlanningSession(
    projectRoot: string,
    planningSessionId?: string,
): HallPlanningSessionRecord | null {
    if (typeof planningSessionId === 'string' && planningSessionId.trim()) {
        return orchestratePlanningDeps.getPlanningSession(planningSessionId.trim(), projectRoot);
    }
    const sessions = orchestratePlanningDeps
        .listPlanningSessions(projectRoot, { statuses: ACTIVE_SESSION_STATUSES })
        .sort((left, right) => {
            const rank = rankSession(left) - rankSession(right);
            return rank || Number(right.updated_at ?? 0) - Number(left.updated_at ?? 0);
        });
    return sessions[0] ?? null;
}

export function selectPlanningSessionBeadIds(
    projectRoot: string,
    hallBeads: SovereignBead[],
    planningSessionId?: string,
): { planningSession: HallPlanningSessionRecord | null; beadIds: string[] } {
    const planningSession = resolveOrchestratePlanningSession(projectRoot, planningSessionId);
    if (!planningSession) return { planningSession: null, beadIds: [] };

    const alreadySharded = new Set(asStringArray(planningSession.metadata?.sharded_parent_bead_ids));
    const setBeads = new Set(hallBeads.filter((bead) => bead.status === 'SET').map((bead) => bead.id));
    const selected = asStringArray(planningSession.metadata?.bead_ids)
        .filter((beadId) => setBeads.has(beadId))
        .filter((beadId) => beadId.includes(':child:') || !alreadySharded.has(beadId));
    const children = selected.filter((beadId) => beadId.includes(':child:'));
    const parents = selected.filter((beadId) => !beadId.includes(':child:'));
    return { planningSession, beadIds: [...children, ...parents] };
}
