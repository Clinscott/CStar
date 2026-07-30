import type { HallOneMindBranchDigest, HallPlanningSessionRecord } from '../../../types/hall.js';
import {
    getRegistryIntentCategories,
    loadRegistryManifest,
    resolveIntentCategoryFromGrammar,
    tokenize,
} from '../runtime/host_workflows/chant_parser.js';
import { selectCouncilExpert } from '../../../core/council_experts.js';
import type {
    TraceContractPayload,
    TraceFailureDiagnosticsPayload,
    TraceHostContextPayload,
    TraceLineagePayload,
} from './trace_types.js';

export function formatTraceTimestamp(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : 'unknown';
}

export function getPlanningBranchDigest(session: HallPlanningSessionRecord): HallOneMindBranchDigest | undefined {
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

export function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

export function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

export function getSessionStringMetadata(session: HallPlanningSessionRecord, key: string): string | undefined {
    const value = session.metadata?.[key];
    return typeof value === 'string' && value.trim()
        ? value.trim()
        : undefined;
}

export function getSessionNumberMetadata(session: HallPlanningSessionRecord, key: string): number | undefined {
    const value = session.metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
}

export function parsePrefixedContextValue(value: string | undefined, prefix: string): string | undefined {
    if (!value) {
        return undefined;
    }
    return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value.trim();
}

export function parseHostContextSummary(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    for (const prefix of ['augury=', 'handoff=', 'trace=']) {
        if (value.startsWith(prefix)) {
            return value.slice(prefix.length).trim();
        }
    }
    return value.trim();
}

export function getFailureDiagnostics(session: HallPlanningSessionRecord): TraceFailureDiagnosticsPayload | undefined {
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

export function getHostContextFromMetadata(metadata: Record<string, unknown> | undefined): TraceHostContextPayload | undefined {
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
        trace_summary: parseHostContextSummary(traceLine),
        note_line: noteLine,
        note: parsePrefixedContextValue(noteLine, 'note='),
        updated_at: updatedAt,
        updated_at_iso: updatedAt ? formatTraceTimestamp(updatedAt) : undefined,
    };
}

export function getTraceContractFromMetadata(metadata: Record<string, unknown> | undefined): TraceContractPayload | undefined {
    const contract = metadata?.augury_contract ?? metadata?.trace_contract;
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
    // Old Hall rows may contain an unscored confidence value. It is deliberately
    // omitted from the current operator-facing contract.
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

export function getTraceLineageFromMetadata(
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
    const targetDomain = typeof metadata?.target_domain === 'string' && metadata.target_domain.trim()
        ? metadata.target_domain.trim()
        : undefined;
    const spokeName = typeof metadata?.spoke_name === 'string' && metadata.spoke_name.trim()
        ? metadata.spoke_name.trim()
        : undefined;
    const requestedRoot = typeof metadata?.requested_root === 'string' && metadata.requested_root.trim()
        ? metadata.requested_root.trim()
        : undefined;
    const auguryDesignationSource = typeof metadata?.augury_designation_source === 'string' && metadata.augury_designation_source.trim()
        ? metadata.augury_designation_source.trim()
        : typeof metadata?.trace_designation_source === 'string' && metadata.trace_designation_source.trim()
            ? metadata.trace_designation_source.trim()
            : undefined;
    const traceDesignationSource = typeof metadata?.trace_designation_source === 'string' && metadata.trace_designation_source.trim()
        ? metadata.trace_designation_source.trim()
        : undefined;

    if (!planningSessionId && !missionId && !missionBeadId && !runtimeBeadId && !traceScope && !traceWeaveId && !targetDomain && !spokeName && !requestedRoot && !auguryDesignationSource && !traceDesignationSource) {
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
        target_domain: targetDomain,
        spoke_name: spokeName,
        requested_root: requestedRoot,
        augury_designation_source: auguryDesignationSource,
        trace_designation_source: traceDesignationSource,
    };
}

export function getHostContext(session: HallPlanningSessionRecord): TraceHostContextPayload | undefined {
    return getHostContextFromMetadata(session.metadata as Record<string, unknown> | undefined);
}

export function getTraceContract(session: HallPlanningSessionRecord): TraceContractPayload | undefined {
    return getTraceContractFromMetadata(session.metadata as Record<string, unknown> | undefined);
}

export function inferIntentCategoryFromContract(
    contract: TraceContractPayload | undefined,
    rootPath: string,
): string | undefined {
    if (!contract) {
        return undefined;
    }
    if (contract.intent_category?.trim()) {
        return contract.intent_category.trim();
    }

    const grammar = getRegistryIntentCategories(loadRegistryManifest(rootPath));
    const selectionName = contract.selection_name?.trim();
    if (selectionName) {
        const normalizedSelection = selectionName.toLowerCase();
        for (const [category, config] of Object.entries(grammar)) {
            if (config.default_path.toLowerCase() === normalizedSelection) {
                return category;
            }
        }
    }

    const routeText = [
        contract.intent,
        contract.canonical_intent,
        contract.selection_name,
        ...(contract.mimirs_well ?? []),
    ].filter(Boolean).join(' ');
    const resolved = resolveIntentCategoryFromGrammar(tokenize(routeText), grammar);
    return resolved?.category;
}

export function normalizeAuguryContractForActiveState(
    contract: TraceContractPayload | undefined,
    rootPath: string,
    registryRootPath: string = rootPath,
): TraceContractPayload | undefined {
    if (!contract) {
        return undefined;
    }
    const intentCategory = inferIntentCategoryFromContract(contract, registryRootPath);
    return intentCategory && !contract.intent_category
        ? { ...contract, intent_category: intentCategory }
        : contract;
}

export function attachCouncilExpertToAuguryContract(
    contract: TraceContractPayload | undefined,
): TraceContractPayload | undefined {
    if (!contract) {
        return undefined;
    }
    const normalized: TraceContractPayload = { ...contract };
    if (!normalized.council_expert?.label && !normalized.council_expert?.id) {
        const expert = selectCouncilExpert({
            intent_category: normalized.intent_category,
            intent: normalized.intent,
            selection_tier: normalized.selection_tier,
            selection_name: normalized.selection_name,
            canonical_intent: normalized.canonical_intent,
            mimirs_well: normalized.mimirs_well,
        });
        normalized.council_expert = {
            id: expert.id,
            label: expert.label,
            profile: expert.profile,
            protocol: expert.protocol,
            lens: expert.lens,
            anti_behavior: expert.anti_behavior,
            root_persona_directive: expert.root_persona_directive,
            selection_reason: expert.selection_reason,
        };
    }
    return normalized;
}

export function isUsableActiveAuguryContract(
    contract: TraceContractPayload | undefined,
    rootPath: string,
    registryRootPath: string = rootPath,
): boolean {
    const normalized = normalizeAuguryContractForActiveState(contract, rootPath, registryRootPath);
    if (!normalized?.intent_category || !normalized.intent || !normalized.selection_tier || !normalized.selection_name) {
        return false;
    }
    return normalized.selection_name.trim().toLowerCase() !== 'unknown';
}

export function resolveSelectionTierForAugury(tier: string | undefined): string {
    const normalized = tier?.trim().toUpperCase();
    return normalized === 'WEAVE' || normalized === 'SPELL' ? normalized : 'SKILL';
}

export function synthesizePlanningAuguryContract(
    session: HallPlanningSessionRecord,
    rootPath: string,
    mimirsWell: string[],
    registryRootPath: string = rootPath,
): TraceContractPayload | undefined {
    const grammar = getRegistryIntentCategories(loadRegistryManifest(registryRootPath));
    const routeText = [
        session.user_intent,
        session.normalized_intent,
        session.summary,
        session.latest_question,
    ].filter(Boolean).join(' ');
    const resolved = resolveIntentCategoryFromGrammar(tokenize(routeText), grammar);
    const category = resolved?.category ?? (session.skill_id === 'chant' ? 'ORCHESTRATE' : undefined);
    if (!category) {
        return undefined;
    }

    const config = grammar[category];
    const selectionName = config?.default_path || session.skill_id || 'chant';
    return {
        intent_category: category,
        intent: session.user_intent || session.normalized_intent || 'Resume active planning session.',
        selection_tier: resolveSelectionTierForAugury(config?.tier ?? 'WEAVE'),
        selection_name: selectionName,
        trajectory_status: 'STABLE',
        trajectory_reason: 'Active planning state synthesized a typed Augury route from registry intent grammar.',
        mimirs_well: mimirsWell.length > 0 ? mimirsWell : ['AGENTS.qmd'],
        canonical_intent: session.normalized_intent || session.user_intent,
    };
}

export function formatTraceDesignation(contract: TraceContractPayload | undefined): string | undefined {
    if (!contract) {
        return undefined;
    }
    if (contract.selection_tier && contract.selection_name) {
        return `${contract.selection_tier}: ${contract.selection_name}`;
    }
    return contract.selection_name;
}
