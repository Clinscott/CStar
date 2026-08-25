import {
    type RuntimeAuguryContract,
    type RuntimeAuguryDesignationSource,
    type RuntimeContext,
} from './contracts.ts';
import { buildAuguryLearningMetadata } from '../../../core/host_session.js';
import {
    TRACE_SELECTION_HEADERS,
    getRegistryIntentCategories,
    loadRegistryManifest,
    resolveIntentCategoryFromGrammar,
    tokenize,
    validateTraceSelectionGate,
} from './host_workflows/chant_parser.js';
import { enrichTraceContractWithCouncil } from '../../../core/council_experts.js';
import {
    sanitizeAuguryMetadataContracts,
    sanitizeUnscoredAuguryContract,
} from './trace_inheritance.js';

interface InvocationTraceResolution {
    contract: RuntimeAuguryContract | null;
    source: RuntimeAuguryDesignationSource | null;
    explicit: boolean;
    errors: string[];
}

export function buildTraceSelectionGateError(
    weaveId: string,
    validationErrors: string[],
    planningOnly: boolean,
): string {
    const prefix = planningOnly
        ? '[KERNEL PANIC]: Corvus Star Augury Gate Breach. Planning sessions must resolve to a machine-valid Corvus Star Augury contract.'
        : `[KERNEL PANIC]: Corvus Star Augury Gate Breach. The command '${weaveId}' must resolve to a machine-valid Corvus Star Augury contract.`;

    if (validationErrors.length === 0) {
        return `${prefix} Provide a valid '// Corvus Star Augury [Ω]' block or a runtime surface the dispatcher can designate safely.`.trim();
    }

    return `${prefix} ${validationErrors.join(' ')}`.trim();
}

export function compactTraceText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || undefined;
}

function normalizeAuguryContract(value: unknown): RuntimeAuguryContract | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const normalized = value as Record<string, unknown>;
    const mimirsWell = Array.isArray(normalized.mimirs_well)
        ? normalized.mimirs_well
            .map((entry) => compactTraceText(entry))
            .filter((entry): entry is string => Boolean(entry))
        : [];
    const contract: RuntimeAuguryContract = {
        mimirs_well: mimirsWell,
    };

    const stringKeys: Array<
        'intent_category'
        | 'intent'
        | 'selection_tier'
        | 'selection_name'
        | 'trajectory_status'
        | 'trajectory_reason'
        | 'gungnir_verdict'
        | 'body'
        | 'canonical_intent'
    > = [
        'intent_category',
        'intent',
        'selection_tier',
        'selection_name',
        'trajectory_status',
        'trajectory_reason',
        'gungnir_verdict',
        'body',
        'canonical_intent',
    ];
    for (const key of stringKeys) {
        const compacted = compactTraceText(normalized[key]);
        if (compacted) {
            contract[key] = compacted;
        }
    }

    // Historical contracts may carry an unscored numeric confidence. Keep the
    // parser backward compatible, but never promote that number into the
    // active runtime contract without a sanctioned scorer/evidence surface.
    const councilExpert = normalized.council_expert;
    if (councilExpert && typeof councilExpert === 'object' && !Array.isArray(councilExpert)) {
        contract.council_expert = councilExpert as RuntimeAuguryContract['council_expert'];
    }
    if (Array.isArray(normalized.council_candidates)) {
        contract.council_candidates = normalized.council_candidates.filter((entry): entry is NonNullable<RuntimeAuguryContract['council_candidates']>[number] => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
    }

    if (!contract.selection_tier || !contract.selection_name) {
        return null;
    }

    return enrichTraceContractWithCouncil(contract);
}

function normalizeAuguryDesignationSource(value: unknown): RuntimeAuguryDesignationSource | null {
    if (value === 'explicit_augury_block' || value === 'dispatcher_synthesized' || value === 'payload_augury_contract' || value === 'legacy_payload_trace_contract') {
        return value;
    }
    if (value === 'explicit_trace_block') {
        return 'explicit_augury_block';
    }
    if (value === 'payload_trace_contract') {
        return 'legacy_payload_trace_contract';
    }
    return null;
}

function extractExplicitTraceCandidate(values: string[]): string | null {
    for (const value of values) {
        for (const header of TRACE_SELECTION_HEADERS) {
            const index = value.indexOf(header);
            if (index >= 0) {
                return value.slice(index).trim();
            }
        }
    }
    return null;
}

function extractInvocationNarratives(
    payload: unknown,
    skillIntent?: string,
): string[] {
    const values: string[] = [];
    if (typeof skillIntent === 'string' && skillIntent.trim()) {
        values.push(skillIntent.trim());
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        for (const key of ['query', 'rationale', 'task', 'intent', 'description', 'summary', 'prompt']) {
            const raw = (payload as Record<string, unknown>)[key];
            if (typeof raw === 'string' && raw.trim()) {
                values.push(raw.trim());
            }
        }
    }

    return Array.from(new Set(values));
}

function resolveSelectionName(weaveId: string, skillId?: string): string {
    if (skillId) {
        return skillId.trim();
    }
    return weaveId.startsWith('weave:') ? weaveId.slice('weave:'.length) : weaveId;
}

function summarizeInvocationIntent(
    weaveId: string,
    payload: unknown,
    skillIntent?: string,
): string {
    const narrative = extractInvocationNarratives(payload, skillIntent)[0];
    if (narrative) {
        return compactTraceText(narrative) ?? narrative.trim();
    }

    const record = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
    const beadId = compactTraceText(record.bead_id);
    const proposalId = compactTraceText(record.proposal_id);
    const action = compactTraceText(record.action);

    switch (weaveId) {
        case 'weave:orchestrate':
            return 'Dispatch the released Hall bead graph for execution.';
        case 'weave:evolve':
            return proposalId
                ? `Promote proposal ${proposalId}.`
                : beadId
                    ? `Evolve bead ${beadId}.`
                    : `Run ${action ?? 'propose'} on the evolve surface.`;
        case 'weave:start':
            return 'Start the Corvus Star runtime loop.';
        case 'weave:host-governor':
            return 'Govern and release the active Hall execution plan.';
        case 'weave:restoration':
            return 'Repair a broken Corvus Star surface through restoration.';
        case 'weave:host-worker':
            return beadId
                ? `Execute host-native implementation work for ${beadId}.`
                : 'Execute host-native implementation work.';
        case 'weave:ravens':
            return `Run ravens action ${action ?? 'status'}.`;
        case 'weave:pennyone':
            return `Run PennyOne action ${action ?? 'scan'}.`;
        case 'weave:chant':
            return 'Plan and designate bounded Corvus Star work.';
        default:
            return `Execute ${resolveSelectionName(weaveId)}.`;
    }
}

function inferTraceIntentCategory(
    workspaceRoot: string,
    selectionName: string,
    weaveId: string,
    summary: string,
    payload: unknown,
): string | undefined {
    const grammar = getRegistryIntentCategories(loadRegistryManifest(workspaceRoot));
    const lowerTokens = tokenize(summary).map((token) => token.toLowerCase());
    const grammarMatch = resolveIntentCategoryFromGrammar(lowerTokens, grammar);
    if (grammarMatch?.category) {
        return grammarMatch.category;
    }

    const action = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? compactTraceText((payload as Record<string, unknown>).action)?.toLowerCase()
        : undefined;
    const normalizedSelection = selectionName.trim().toLowerCase();

    if (weaveId === 'weave:pennyone') {
        if (action === 'normalize') {
            return 'HARDEN';
        }
        return 'OBSERVE';
    }
    if (weaveId === 'weave:ravens') {
        return action === 'status' ? 'OBSERVE' : 'ORCHESTRATE';
    }
    if (['chant', 'orchestrate', 'host-governor', 'start', 'creation_loop'].includes(normalizedSelection)) {
        return 'ORCHESTRATE';
    }
    if (['restoration'].includes(normalizedSelection)) {
        return 'REPAIR';
    }
    if (['evolve', 'temporal-learning'].includes(normalizedSelection)) {
        return 'EVOLVE';
    }
    if (['host-worker', 'forge'].includes(normalizedSelection)) {        return 'BUILD';
    }
    if (['hall', 'scan', 'manifest', 'status', 'vitals'].includes(normalizedSelection)) {
        return 'OBSERVE';
    }
    if (['calculus'].includes(normalizedSelection)) {
        return 'SCORE';
    }
    return undefined;
}

function buildSyntheticTraceContract(input: {
    workspaceRoot: string;
    weaveId: string;
    selectionTier: 'SKILL' | 'WEAVE';
    selectionName: string;
    payload: unknown;
    skillIntent?: string;
    targetPath?: string;
}): RuntimeAuguryContract {
    const summary = summarizeInvocationIntent(input.weaveId, input.payload, input.skillIntent);
    const targetPath = compactTraceText(input.targetPath);
    const mimirsWell = ['src/node/core/runtime/dispatcher.ts'];
    const normalizedWorkspaceRoot = input.workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedTargetPath = targetPath?.replace(/\\/g, '/').replace(/\/+$/, '');
    if (
        targetPath
        && normalizedTargetPath
        && normalizedTargetPath !== normalizedWorkspaceRoot
        && (targetPath.includes('/') || targetPath.includes('\\') || targetPath.startsWith('.'))
    ) {
        mimirsWell.push(targetPath);
    }

    const intentCategory = inferTraceIntentCategory(
        input.workspaceRoot,
        input.selectionName,
        input.weaveId,
        summary,
        input.payload,
    );

    return enrichTraceContractWithCouncil({
        intent_category: intentCategory,
        intent: summary,
        selection_tier: input.selectionTier,
        selection_name: input.selectionName,
        trajectory_status: 'STABLE',
        trajectory_reason: `Dispatcher synthesized the designation from the explicit ${input.selectionTier.toLowerCase()} invocation.`,
        mimirs_well: Array.from(new Set(mimirsWell)),
        canonical_intent: summary,
    });
}

export function resolveInvocationTraceContract(input: {
    workspaceRoot: string;
    weaveId: string;
    payload: unknown;
    operatorMode: RuntimeContext['operator_mode'];
    skillId?: string;
    skillIntent?: string;
    targetPath?: string;
    allowObservationFallback: boolean;
}): InvocationTraceResolution {
    const narratives = extractInvocationNarratives(input.payload, input.skillIntent);
    const explicitTrace = extractExplicitTraceCandidate(narratives);

    if (explicitTrace) {
        const validation = validateTraceSelectionGate(explicitTrace);
        if (!validation.valid || !validation.trace) {
            return {
                contract: null,
                source: null,
                explicit: true,
                errors: validation.errors,
            };
        }
        return {
            contract: enrichTraceContractWithCouncil({
                intent_category: validation.trace.intent_category,
                intent: validation.trace.intent,
                selection_tier: validation.trace.selection_tier,
                selection_name: validation.trace.selection_name,
                trajectory_status: validation.trace.trajectory_status,
                trajectory_reason: validation.trace.trajectory_reason,
                mimirs_well: validation.trace.mimirs_well,
                gungnir_verdict: validation.trace.gungnir_verdict,
                body: validation.trace.body,
                canonical_intent: validation.trace.canonical_intent,
            }),
            source: 'explicit_augury_block',
            explicit: true,
            errors: [],
        };
    }

    const payloadRecord = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
        ? input.payload as Record<string, unknown>
        : null;
    const payloadAugury = payloadRecord
        ? normalizeAuguryContract(payloadRecord.augury_contract)
        : null;
    const legacyPayloadTrace = !payloadAugury && payloadRecord
        ? normalizeAuguryContract(payloadRecord.trace_contract)
        : null;
    const payloadContract = payloadAugury ?? legacyPayloadTrace;
    if (payloadContract) {
        return {
            contract: payloadContract,
            source: normalizeAuguryDesignationSource(payloadRecord?.augury_designation_source ?? payloadRecord?.trace_designation_source)
                ?? (payloadAugury ? 'payload_augury_contract' : 'legacy_payload_trace_contract'),
            explicit: false,
            errors: [],
        };
    }

    if (input.operatorMode !== 'cli' || input.allowObservationFallback) {
        return {
            contract: null,
            source: null,
            explicit: false,
            errors: [],
        };
    }

    return {
        contract: buildSyntheticTraceContract({
            workspaceRoot: input.workspaceRoot,
            weaveId: input.weaveId,
            selectionTier: input.skillId ? 'SKILL' : 'WEAVE',
            selectionName: resolveSelectionName(input.weaveId, input.skillId),
            payload: input.payload,
            skillIntent: input.skillIntent,
            targetPath: input.targetPath,
        }),
        source: 'dispatcher_synthesized',
        explicit: false,
        errors: [],
    };
}

export function mergeRuntimeAuguryMetadata(input: {
    metadata?: Record<string, unknown>;
    context: RuntimeContext;
    weaveId: string;
    auguryContract: RuntimeAuguryContract | null;
    augurySource: RuntimeAuguryDesignationSource | null;
    executionBeadId?: string;
    resultStatus?: string;
}): Record<string, unknown> | undefined {
    const sanitizedMetadata = sanitizeAuguryMetadataContracts(input.metadata ?? {});
    if (!input.auguryContract && !input.augurySource) {
        return input.metadata ? sanitizedMetadata : undefined;
    }

    const metadata = {
        ...sanitizedMetadata,
    };

    if (!metadata.context_policy) {
        metadata.context_policy = 'project';
    }

    metadata.trace_id = input.context.trace_id;
    metadata.mission_id = input.context.mission_id;
    metadata.mission_bead_id = input.context.bead_id;
    metadata.target_domain = input.context.target_domain;
    metadata.spoke_name = input.context.spoke_name ?? null;
    metadata.spoke_root = input.context.spoke_root ?? null;
    metadata.requested_root = input.context.requested_root ?? null;
    if (input.executionBeadId) {
        metadata.execution_bead_id = input.executionBeadId;
    }
    metadata.trace_scope = 'runtime';
    metadata.trace_weave_id = input.weaveId;
    if (input.augurySource) {
        metadata.augury_designation_source = input.augurySource;
        metadata.trace_designation_source = input.augurySource;
    }
    const auguryContract = sanitizeUnscoredAuguryContract(input.auguryContract) as RuntimeAuguryContract | undefined;
    if (auguryContract) {
        const planningSessionId = typeof metadata.planning_session_id === 'string' && metadata.planning_session_id.trim()
            ? metadata.planning_session_id.trim()
            : null;
        metadata.augury_contract_version = 1;
        metadata.augury_contract = auguryContract;
        metadata.trace_contract_version = 1;
        metadata.trace_contract = auguryContract;
        metadata.augury_learning_metadata = buildAuguryLearningMetadata(auguryContract as unknown as Record<string, unknown>, {
            session_id: input.context.session_id ?? planningSessionId,
            planning_session_id: planningSessionId ?? input.context.session_id ?? null,
            designation_source: input.augurySource ?? null,
            prompt_surface: input.weaveId,
            bead_id: input.executionBeadId ?? input.context.bead_id,
            weave_id: input.weaveId,
            result_status: input.resultStatus ?? null,
            target_domain: input.context.target_domain,
            spoke_name: input.context.spoke_name ?? null,
            requested_root: input.context.requested_root ?? null,
        });
        if (auguryContract.council_expert) {
            metadata.council_expert = auguryContract.council_expert;
            metadata.root_persona_directive = auguryContract.council_expert.root_persona_directive;
        }
    }

    return metadata;
}
