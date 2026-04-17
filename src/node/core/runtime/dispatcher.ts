import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    RuntimeContext,
    RuntimeAuguryContract,
    RuntimeAuguryDesignationSource,
    WeaveInvocation,
    WeaveResult,
    RuntimeAdapter,
    RuntimeDispatchPort,
} from './contracts.ts';
import { requestHostText, type HostTextRequest, type HostTextResult } from '../../../core/host_intelligence.js';
import {
    buildAuguryLearningMetadata,
    buildHostNativeSkillPrompt,
    explainCapabilityHostSupport,
    getCapabilityExecutionMode,
    getCapabilityKernelFallbackPolicy,
    getCapabilityOwnershipModel,
    resolveHostProvider,
} from '../../../core/host_session.js';
import { StateRegistry } from  '../state.js';
import { activePersona } from  '../../../tools/pennyone/personaRegistry.js';
import { registry } from  '../../../tools/pennyone/pathRegistry.js';
import { getGungnirOverall } from  '../../../types/gungnir.js';
import { resolveEstateTarget } from  './estate_targeting.js';
import {
    TRACE_SELECTION_HEADERS,
    getRegistryIntentCategories,
    loadRegistryManifest,
    resolveIntentCategoryFromGrammar,
    tokenize,
    validateTraceSelectionGate,
} from './host_workflows/chant_parser.js';
import { inheritTraceInvocation } from './trace_inheritance.js';
import { upsertHallBead, getHallBead } from  '../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath, type HallBeadStatus } from  '../../../types/hall.js';
import { enrichTraceContractWithCouncil } from '../../../core/council_experts.js';

function resolveSkillAdapterAlias(workspaceRoot: string, skillId: string): string {
    const manifestPath = path.join(workspaceRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return skillId;
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { entries?: Record<string, { execution?: { adapter_id?: string } }> };
        const entry = manifest.entries?.[skillId];
        return entry?.execution?.adapter_id?.trim() || skillId;
    } catch {
        return skillId;
    }
}

type HostRecoveryAction = 'retry' | 'replan' | 'abandon';

interface HostRecoveryDecision {
    action?: unknown;
    summary?: unknown;
    operator_message?: unknown;
    recovery_task?: unknown;
}

interface InvocationTraceResolution {
    contract: RuntimeAuguryContract | null;
    source: RuntimeAuguryDesignationSource | null;
    explicit: boolean;
    errors: string[];
}

function buildHostWorkflowKernelExecutionError(capabilityId: string): WeaveResult {
    return {
        weave_id: capabilityId,
        status: 'FAILURE',
        output: '',
        error: `Capability '${capabilityId}' is cataloged as a host-workflow and cannot execute on the Node kernel.`,
        metadata: {
            execution_boundary: 'host-native-required',
            ownership_model: 'host-workflow',
        },
    };
}

function resolveHostEnvelopeTimeoutMs(envName: string, defaultMs: number, env: NodeJS.ProcessEnv = process.env): number {
    const provider = resolveHostProvider(env);
    const defaultForProvider = provider === 'codex' && env.CODEX_SHELL !== '1'
        ? Math.max(defaultMs, 300000)
        : defaultMs;
    const raw = Number(env[envName] ?? env.CSTAR_HOST_SESSION_TIMEOUT_MS ?? env.CORVUS_HOST_SESSION_TIMEOUT_MS ?? defaultForProvider);
    return Number.isFinite(raw) && raw > 0 ? raw : defaultForProvider;
}

function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host recovery did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function buildTraceSelectionGateError(
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

function compactTraceText(value: unknown): string | undefined {
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

    if (typeof normalized.confidence === 'number' && Number.isFinite(normalized.confidence)) {
        contract.confidence = normalized.confidence;
    }
    if (normalized.confidence_source === 'explicit' || normalized.confidence_source === 'missing' || normalized.confidence_source === 'synthetic') {
        contract.confidence_source = normalized.confidence_source;
    }
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
        case 'weave:autobot':
            return beadId
                ? `Execute bounded implementation work for ${beadId}.`
                : 'Execute bounded implementation work through autobot.';
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
    if (['autobot', 'host-worker', 'forge'].includes(normalizedSelection)) {
        return 'BUILD';
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
        confidence: 0.72,
        confidence_source: 'synthetic',
        canonical_intent: summary,
    });
}

function resolveInvocationTraceContract(input: {
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
                confidence: validation.trace.confidence,
                confidence_source: validation.trace.confidence_source,
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

function mergeRuntimeAuguryMetadata(input: {
    metadata?: Record<string, unknown>;
    context: RuntimeContext;
    weaveId: string;
    auguryContract: RuntimeAuguryContract | null;
    augurySource: RuntimeAuguryDesignationSource | null;
    executionBeadId?: string;
    resultStatus?: string;
}): Record<string, unknown> | undefined {
    if (!input.auguryContract && !input.augurySource) {
        return input.metadata;
    }

    const metadata = {
        ...(input.metadata ?? {}),
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
    if (input.auguryContract) {
        const planningSessionId = typeof metadata.planning_session_id === 'string' && metadata.planning_session_id.trim()
            ? metadata.planning_session_id.trim()
            : null;
        metadata.augury_contract_version = 1;
        metadata.augury_contract = input.auguryContract;
        metadata.trace_contract_version = 1;
        metadata.trace_contract = input.auguryContract;
        metadata.augury_learning_metadata = buildAuguryLearningMetadata(input.auguryContract as unknown as Record<string, unknown>, {
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
        if (input.auguryContract.council_expert) {
            metadata.council_expert = input.auguryContract.council_expert;
            metadata.root_persona_directive = input.auguryContract.council_expert.root_persona_directive;
        }
    }

    return metadata;
}

function mapExecutionResultToBeadStatus(result: WeaveResult): HallBeadStatus {
    if (result.status === 'SUCCESS') {
        return 'RESOLVED';
    }
    if (result.status === 'TRANSITIONAL') {
        return 'READY_FOR_REVIEW';
    }
    return 'BLOCKED';
}

function extractInheritedExecutionMetadata(payload: Record<string, unknown>): Record<string, unknown> {
    const inherited: Record<string, unknown> = {};

    for (const key of [
        'planning_session_id',
        'trace_selection_name',
        'trace_selection_tier',
        'trace_execution_profile',
    ] as const) {
        const value = compactTraceText(payload[key]);
        if (value) {
            inherited[key] = value;
        }
    }

    return inherited;
}

function resolveSkillBeadOperatorMode(payload: unknown): RuntimeContext['operator_mode'] {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const source = compactTraceText((payload as Record<string, unknown>).source)?.toLowerCase();
        if (source === 'cli') {
            return 'cli';
        }
        if (source === 'automation') {
            return 'automation';
        }
    }
    return 'subkernel';
}

function normalizeHostRecoveryAction(value: unknown): HostRecoveryAction {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'retry') {
        return 'retry';
    }
    if (normalized === 'replan') {
        return 'replan';
    }
    return 'abandon';
}

function buildKernelRecoveryPrompt(input: {
    weaveId: string;
    skillId?: string;
    workspaceRoot: string;
    error: string;
    payload: unknown;
    context: RuntimeContext;
}): string {
    return [
        'You are supervising a failed CStar kernel execution.',
        'Decide the next bounded recovery action and return strict JSON only.',
        'Allowed actions: retry, replan, abandon.',
        'Choose retry only for transient or obviously recoverable execution faults.',
        'Choose replan when the failure implies the current bead or execution route is wrong.',
        'Choose abandon when no safe automatic correction is justified.',
        'Format:',
        '{ "action": "retry|replan|abandon", "summary": "...", "operator_message": "...", "recovery_task": "..." }',
        '',
        `WEAVE_ID: ${input.weaveId}`,
        input.skillId ? `SKILL_ID: ${input.skillId}` : '',
        `WORKSPACE_ROOT: ${input.workspaceRoot}`,
        `MISSION_ID: ${input.context.mission_id}`,
        `TRACE_ID: ${input.context.trace_id}`,
        `ERROR: ${input.error}`,
        'PAYLOAD:',
        JSON.stringify(input.payload ?? {}, null, 2),
    ].filter(Boolean).join('\n');
}

/**
 * [Ω] THE CANONICAL RUNTIME DISPATCHER (v1.0)
 * Purpose: The singular authority for command and skill execution.
 * Mandate: "One mind, one spine."
 */
export class RuntimeDispatcher implements RuntimeDispatchPort {
    private static instance: RuntimeDispatcher;
    private adapters: Map<string, RuntimeAdapter> = new Map();

    private deps: {
        stateRegistry: typeof StateRegistry;
        resolveEstateTarget: typeof resolveEstateTarget;
        activePersona: typeof activePersona;
        hostTextInvoker: (request: HostTextRequest) => Promise<HostTextResult>;
    };

    private constructor(deps?: Partial<typeof RuntimeDispatcher.prototype.deps>) {
        this.deps = {
            stateRegistry: deps?.stateRegistry ?? StateRegistry,
            resolveEstateTarget: deps?.resolveEstateTarget ?? resolveEstateTarget,
            activePersona: deps?.activePersona ?? activePersona,
            hostTextInvoker: deps?.hostTextInvoker ?? requestHostText,
        };
    }

    public static getInstance(): RuntimeDispatcher {
        if (!this.instance) {
            this.instance = new RuntimeDispatcher();
        }
        return this.instance;
    }

    public static createIsolated(deps?: Partial<typeof RuntimeDispatcher.prototype.deps>): RuntimeDispatcher {
        return new RuntimeDispatcher(deps);
    }

    /**
     * Registers an adapter for a specific weave/command path.
     */
    public registerAdapter(adapter: RuntimeAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    /**
     * [🔱] THE SUPREME DISPATCH
     * The authoritative entrypoint for all high-level framework operations.
     */
    public async dispatch<T>(invocation: WeaveInvocation<T> | import('../skills/types.js').SkillBead<T>): Promise<WeaveResult> {
        const isSkillBead = 'skill_id' in invocation;
        const workspaceRoot = process.env.CSTAR_PROJECT_ROOT || registry.getRoot();
        const weaveId = isSkillBead
            ? resolveSkillAdapterAlias(workspaceRoot, invocation.skill_id)
            : invocation.weave_id;
        const payload = isSkillBead ? invocation.params : invocation.payload;
        const target = isSkillBead ? undefined : invocation.target;
        const session = isSkillBead ? undefined : invocation.session;
        const ownershipCapabilityId = isSkillBead ? invocation.skill_id : weaveId;
        const ownershipModel = getCapabilityOwnershipModel(workspaceRoot, ownershipCapabilityId);
        const kernelFallbackPolicy = getCapabilityKernelFallbackPolicy(workspaceRoot, ownershipCapabilityId);

        let estateTarget;
        try {
            estateTarget = this.deps.resolveEstateTarget(target);
        } catch (err: any) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I cannot resolve the requested estate target, sir: ${err.message}"`,
            };
        }

        registry.setRoot(estateTarget.workspaceRoot);

        const operatorMode = isSkillBead
            ? resolveSkillBeadOperatorMode(payload)
            : session?.mode ?? 'cli';
        const isObservationInvocation = ['weave:status', 'weave:hall', 'weave:vitals', 'weave:manifest'].includes(weaveId)
            || (weaveId === 'weave:pennyone' && ['search', 'stats', 'topology', 'view', 'scan', 'refresh_intents', 'normalize', 'report', 'artifacts', 'status'].includes(String((payload as any)?.action ?? '').trim()));
        const traceResolution = resolveInvocationTraceContract({
            workspaceRoot: estateTarget.workspaceRoot,
            weaveId,
            payload,
            operatorMode,
            skillId: isSkillBead ? invocation.skill_id : undefined,
            skillIntent: isSkillBead ? invocation.intent : undefined,
            targetPath: isSkillBead ? invocation.target_path : estateTarget.requestedRoot,
            allowObservationFallback: isObservationInvocation,
        });

        if (operatorMode === 'cli' && traceResolution.explicit && traceResolution.errors.length > 0) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: buildTraceSelectionGateError(
                    weaveId,
                    traceResolution.errors,
                    weaveId === 'weave:chant',
                ),
            };
        }

        if (operatorMode === 'cli' && !isObservationInvocation && !traceResolution.contract) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: buildTraceSelectionGateError(weaveId, traceResolution.errors, weaveId === 'weave:chant'),
            };
        }

        const context: RuntimeContext = {
            mission_id: `MISSION-${crypto.randomInt(10000, 99999)}`,
            bead_id: (payload as any)?.bead_id || (isSkillBead ? invocation.id : `bead_mission_${Date.now()}`),
            trace_id: crypto.randomUUID(),
            persona: this.deps.activePersona.name,
            workspace_root: estateTarget.workspaceRoot,
            operator_mode: operatorMode,
            target_domain: estateTarget.targetDomain,
            interactive: isSkillBead ? false : session?.interactive ?? true,
            spoke_name: estateTarget.spokeName,
            spoke_root: estateTarget.spokeRoot,
            requested_root: estateTarget.requestedRoot,
            session_id: isSkillBead ? undefined : session?.session_id,
            augury_contract: traceResolution.contract ?? undefined,
            augury_designation_source: traceResolution.source ?? undefined,
            trace_contract: traceResolution.contract ?? undefined,
            trace_designation_source: traceResolution.source ?? undefined,
            council_expert: traceResolution.contract?.council_expert,
            root_persona_directive: traceResolution.contract?.council_expert?.root_persona_directive,
            env: process.env,
            timestamp: Date.now()
        };

        // [🔱] THE BEAD-DRIVEN MANDATE: Ensure the Hall tracks the Engine
        const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
        const existingBead = getHallBead(context.bead_id);
        this.upsertMissionBead({
            repoId,
            beadId: context.bead_id,
            weaveId,
            requestedRoot: estateTarget.requestedRoot,
            existingBead,
            auguryContract: traceResolution.contract,
            augurySource: traceResolution.source,
            context,
        });

        // Update Global State: Mission Identity
        this.deps.stateRegistry.updateMission(context.mission_id, `Executing weave/skill: ${weaveId}`, context.bead_id);

        // [🔱] THE FRACTAL STRIKE: Create a Child Bead for this specific execution
        const childBeadId = `${context.bead_id}:exec:${weaveId}:${Date.now()}`;
        const assignedAgent = context.persona === 'O.D.I.N.' ? 'ONE-MIND' : 'ALFRED';
        this.upsertExecutionBead({
            beadId: childBeadId,
            repoId,
            weaveId,
            targetKind: isSkillBead ? 'SKILL' : 'WEAVE',
            targetPath: isSkillBead ? invocation.target_path : estateTarget.requestedRoot,
            assignedAgent,
            context,
            auguryContract: traceResolution.contract,
            augurySource: traceResolution.source,
            status: 'IN_PROGRESS',
        });

        // --- WAR ROOM HANDSHAKE ---
        // Map personae/weave to agents for the Roster
        const targetAgentId = weaveId === 'weave:autobot' ? 'autobot' :
                             weaveId.includes('droid') ? 'droid' :
                             resolveHostProvider(process.env) || 'gemini';

        const stateRegistry = this.deps.stateRegistry as any;
        const canTrackAgentState = typeof stateRegistry?.get === 'function'
            && typeof stateRegistry?.save === 'function';
        const canPostBlackboard = typeof stateRegistry?.postToBlackboard === 'function';
        const state = canTrackAgentState ? stateRegistry.get() : undefined;
        const restoreAgentState = () => {
            const finalState = canTrackAgentState ? stateRegistry.get() : undefined;
            if (finalState?.agents && finalState.agents[targetAgentId]) {
                finalState.agents[targetAgentId].status = 'SLEEPING';
                finalState.agents[targetAgentId].active_bead_id = undefined;
                finalState.agents[targetAgentId].pid = undefined;
                stateRegistry.save(finalState);
            }
        };
        if (state?.agents && state.agents[targetAgentId]) {
            state.agents[targetAgentId].status = 'WORKING';
            state.agents[targetAgentId].active_bead_id = childBeadId;
            state.agents[targetAgentId].last_seen = Date.now();
            stateRegistry.save(state);

            if (canPostBlackboard) {
                stateRegistry.postToBlackboard({
                    from: state.framework.active_persona,
                    to: targetAgentId,
                    message: `Starting task: ${weaveId} :: ${childBeadId}`,
                    type: 'INFO'
                });
            }
        }

        const finalizeResult = (result: WeaveResult): WeaveResult => {
            const finalized: WeaveResult = {
                ...result,
                metadata: mergeRuntimeAuguryMetadata({
                    metadata: result.metadata,
                    context,
                    weaveId,
                    auguryContract: traceResolution.contract,
                    augurySource: traceResolution.source,
                    executionBeadId: childBeadId,
                    resultStatus: result.status,
                }),
            };
            this.upsertExecutionBead({
                beadId: childBeadId,
                repoId,
                weaveId,
                targetKind: isSkillBead ? 'SKILL' : 'WEAVE',
                targetPath: isSkillBead ? invocation.target_path : estateTarget.requestedRoot,
                assignedAgent,
                context,
                auguryContract: traceResolution.contract,
                augurySource: traceResolution.source,
                existingBead: getHallBead(childBeadId),
                status: mapExecutionResultToBeadStatus(finalized),
                output: finalized.output,
                error: finalized.error,
                metadata: finalized.metadata,
            });
            return finalized;
        };

        if (isSkillBead) {
            const nativeHostResult = await this.tryExecuteSkillBeadViaHostSession(invocation, estateTarget.workspaceRoot, context);
            if (nativeHostResult) {
                restoreAgentState();
                return finalizeResult(nativeHostResult);
            }
        }

        if (ownershipModel === 'host-workflow' && kernelFallbackPolicy === 'forbidden') {
            restoreAgentState();
            const forbidden = buildHostWorkflowKernelExecutionError(isSkillBead ? invocation.skill_id : weaveId);
            return finalizeResult(forbidden);
        }

        const adapter = this.adapters.get(weaveId);
        if (!adapter) {
            restoreAgentState();
            return finalizeResult({
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I am unable to resolve the weave/skill '${weaveId}', sir. The spine remains disconnected for this path."`,
            });
        }

        try {
            // If it's a SkillBead, wrap it into a WeaveInvocation to pass down
            const invocationToPass: WeaveInvocation<any> = isSkillBead
                ? {
                    weave_id: weaveId,
                    payload: payload,
                    target: target,
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                }
                : invocation;
            const result = await adapter.execute(invocationToPass, context);

            restoreAgentState();

            // Sync status if needed
            if (result.status === 'SUCCESS' && result.metrics_delta) {
                this.deps.stateRegistry.updateFramework({ gungnir_score: getGungnirOverall(result.metrics_delta) });
            }

            let finalResult = result;
            if (result.status === 'FAILURE') {
                const recovered = await this.tryRecoverKernelFailure({
                    adapter,
                    invocationToPass,
                    context,
                    workspaceRoot: estateTarget.workspaceRoot,
                    weaveId,
                    payload,
                    initialResult: result,
                    skillId: isSkillBead ? invocation.skill_id : undefined,
                });
                if (recovered) {
                    finalResult = recovered;
                }
            }

            return finalizeResult(finalResult);
        } catch (err: any) {
            restoreAgentState();

            const failureResult: WeaveResult = {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "The execution of weave/skill '${weaveId}' has suffered a catastrophic failure: ${err.message}"`
            };
            const invocationToPass: WeaveInvocation<any> = isSkillBead
                ? {
                    weave_id: weaveId,
                    payload: payload,
                    target: target,
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                }
                : invocation;
            const recovered = await this.tryRecoverKernelFailure({
                adapter,
                invocationToPass,
                context,
                workspaceRoot: estateTarget.workspaceRoot,
                weaveId,
                payload,
                initialResult: failureResult,
                skillId: isSkillBead ? invocation.skill_id : undefined,
            });
            if (recovered) {
                return finalizeResult(recovered);
            }
            return finalizeResult(failureResult);
        }
    }

    public hasAdapter(id: string): boolean {
        return this.adapters.has(id);
    }

    public listAdapterIds(): string[] {
        return Array.from(this.adapters.keys()).sort();
    }

    /**
     * Triggers the shutdown hook for all registered adapters.
     */
    public async shutdown(): Promise<void> {
        const tasks = Array.from(this.adapters.values())
            .filter(a => typeof a.shutdown === 'function')
            .map(a => a.shutdown!());
        await Promise.all(tasks);
    }

    public clearAdapters(): void {
        this.adapters.clear();
    }

    private upsertMissionBead(input: {
        repoId: string;
        beadId: string;
        weaveId: string;
        requestedRoot?: string;
        existingBead: ReturnType<typeof getHallBead>;
        auguryContract: RuntimeAuguryContract | null;
        augurySource: RuntimeAuguryDesignationSource | null;
        context: RuntimeContext;
    }): void {
        const now = Date.now();
        const metadata = mergeRuntimeAuguryMetadata({
            metadata: input.existingBead?.metadata as Record<string, unknown> | undefined,
            context: input.context,
            weaveId: input.weaveId,
            auguryContract: input.auguryContract,
            augurySource: input.augurySource,
        });

        upsertHallBead({
            bead_id: input.beadId,
            repo_id: input.repoId,
            scan_id: input.existingBead?.scan_id,
            target_kind: input.existingBead?.target_kind ?? 'OTHER',
            target_ref: input.existingBead?.target_ref ?? input.weaveId,
            target_path: input.existingBead?.target_path ?? input.requestedRoot ?? null,
            rationale: input.existingBead?.rationale ?? `Mission execution: ${input.weaveId}`,
            contract_refs: input.existingBead?.contract_refs ?? [],
            baseline_scores: input.existingBead?.baseline_scores ?? {},
            acceptance_criteria: input.existingBead?.acceptance_criteria,
            checker_shell: input.existingBead?.checker_shell,
            status: input.existingBead?.status ?? 'OPEN',
            assigned_agent: input.existingBead?.assigned_agent,
            source_kind: input.existingBead?.source_kind ?? 'SYSTEM',
            triage_reason: input.existingBead?.triage_reason,
            resolution_note: input.existingBead?.resolution_note,
            resolved_validation_id: input.existingBead?.resolved_validation_id,
            superseded_by: input.existingBead?.superseded_by,
            architect_opinion: input.existingBead?.architect_opinion,
            critique_payload: input.existingBead?.critique_payload,
            metadata,
            created_at: input.existingBead?.created_at ?? now,
            updated_at: now,
        } as any);
    }

    private upsertExecutionBead(input: {
        beadId: string;
        repoId: string;
        weaveId: string;
        targetKind: 'SKILL' | 'WEAVE';
        targetPath?: string;
        assignedAgent: string;
        context: RuntimeContext;
        auguryContract: RuntimeAuguryContract | null;
        augurySource: RuntimeAuguryDesignationSource | null;
        metadata?: Record<string, unknown>;
        status: HallBeadStatus;
        output?: string;
        error?: string;
        existingBead?: ReturnType<typeof getHallBead>;
        createdAt?: number;
    }): void {
        const now = Date.now();
        const metadata = mergeRuntimeAuguryMetadata({
            metadata: {
                ...(input.existingBead?.metadata as Record<string, unknown> | undefined ?? {}),
                ...(input.metadata ?? {}),
                execution_status: input.status,
                execution_output: compactTraceText(input.output),
                execution_error: compactTraceText(input.error),
                execution_completed_at: input.status === 'IN_PROGRESS' ? undefined : now,
            },
            context: input.context,
            weaveId: input.weaveId,
            auguryContract: input.auguryContract,
            augurySource: input.augurySource,
            executionBeadId: input.beadId,
        });

        upsertHallBead({
            bead_id: input.beadId,
            repo_id: input.repoId,
            scan_id: input.existingBead?.scan_id,
            target_kind: input.existingBead?.target_kind ?? input.targetKind,
            target_ref: input.existingBead?.target_ref ?? input.weaveId,
            target_path: input.existingBead?.target_path ?? input.targetPath ?? null,
            rationale: input.existingBead?.rationale ?? `Execution of ${input.weaveId} under mission ${input.context.mission_id}`,
            contract_refs: input.existingBead?.contract_refs ?? [],
            baseline_scores: input.existingBead?.baseline_scores ?? {},
            acceptance_criteria: input.existingBead?.acceptance_criteria,
            checker_shell: input.existingBead?.checker_shell,
            status: input.status,
            assigned_agent: input.existingBead?.assigned_agent ?? input.assignedAgent,
            source_kind: input.existingBead?.source_kind ?? 'SYSTEM',
            triage_reason: input.existingBead?.triage_reason ?? compactTraceText(input.error),
            resolution_note: input.existingBead?.resolution_note ?? compactTraceText(input.output),
            resolved_validation_id: input.existingBead?.resolved_validation_id,
            superseded_by: input.existingBead?.superseded_by,
            architect_opinion: input.existingBead?.architect_opinion,
            critique_payload: input.existingBead?.critique_payload,
            metadata,
            created_at: input.existingBead?.created_at ?? input.createdAt ?? now,
            updated_at: now,
        } as any);
    }

    private async tryRecoverKernelFailure(args: {
        adapter: RuntimeAdapter;
        invocationToPass: WeaveInvocation<any>;
        context: RuntimeContext;
        workspaceRoot: string;
        weaveId: string;
        payload: unknown;
        initialResult: WeaveResult;
        skillId?: string;
    }): Promise<WeaveResult | null> {
        const { adapter, invocationToPass, context, workspaceRoot, weaveId, payload, initialResult, skillId } = args;
        if (weaveId === 'weave:host-governor') {
            return null;
        }

        const ownershipCapabilityId = skillId ?? weaveId;
        const ownershipModel = getCapabilityOwnershipModel(workspaceRoot, ownershipCapabilityId);
        if (ownershipModel !== 'kernel-primitive') {
            return null;
        }

        const executionMode = getCapabilityExecutionMode(workspaceRoot, ownershipCapabilityId);
        if (executionMode !== 'kernel-backed') {
            return null;
        }

        const provider = resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);
        if (!provider) {
            return null;
        }

        try {
            const hostResponse = await this.deps.hostTextInvoker({
                prompt: buildKernelRecoveryPrompt({
                    weaveId,
                    skillId,
                    workspaceRoot,
                    error: initialResult.error ?? 'Unknown kernel failure.',
                    payload,
                    context,
                }),
                projectRoot: workspaceRoot,
                source: `runtime:recovery:${weaveId}`,
                provider,
                env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                metadata: {
                    transport_mode: 'host_session',
                    one_mind_boundary: 'primary',
                    execution_mode: 'kernel-recovery',
                    failed_weave_id: weaveId,
                    failed_skill_id: skillId ?? null,
                    ...(context.augury_contract ?? context.trace_contract ? {
                        augury_contract: context.augury_contract ?? context.trace_contract,
                        trace_contract: context.augury_contract ?? context.trace_contract,
                        augury_learning_metadata: buildAuguryLearningMetadata((context.augury_contract ?? context.trace_contract) as unknown as Record<string, unknown>, {
                            session_id: context.session_id ?? null,
                            planning_session_id: context.session_id ?? null,
                            designation_source: context.augury_designation_source ?? context.trace_designation_source ?? null,
                            prompt_surface: `runtime:recovery:${weaveId}`,
                            bead_id: context.bead_id,
                            weave_id: weaveId,
                            target_domain: context.target_domain,
                            spoke_name: context.spoke_name ?? null,
                            requested_root: context.requested_root ?? null,
                        }),
                    } : {}),
                    ...(context.augury_designation_source ?? context.trace_designation_source ? {
                        augury_designation_source: context.augury_designation_source ?? context.trace_designation_source,
                        trace_designation_source: context.augury_designation_source ?? context.trace_designation_source,
                    } : {}),
                },
            });
            const decision = extractJsonObject(hostResponse.text) as HostRecoveryDecision;
            const action = normalizeHostRecoveryAction(decision.action);
            const summary = typeof decision.summary === 'string' ? decision.summary.trim() : '';
            const operatorMessage = typeof decision.operator_message === 'string' ? decision.operator_message.trim() : '';
            const recoveryTask = typeof decision.recovery_task === 'string' ? decision.recovery_task.trim() : '';

            if (action === 'retry') {
                const retryResult = await adapter.execute(invocationToPass, context);
                return {
                    ...retryResult,
                    metadata: {
                        ...(retryResult.metadata ?? {}),
                        host_recovery: {
                            action,
                            provider,
                            summary,
                            operator_message: operatorMessage,
                            attempted: true,
                            succeeded: retryResult.status !== 'FAILURE',
                        },
                    },
                };
            }

            if (action === 'replan') {
                const governorResult = await this.dispatch(inheritTraceInvocation({
                    weave_id: 'weave:host-governor',
                    payload: {
                        task: recoveryTask || operatorMessage || summary || `Recover from failed kernel execution: ${weaveId}`,
                        auto_execute: true,
                        auto_replan_blocked: true,
                        max_parallel: 1,
                        project_root: workspaceRoot,
                        cwd: workspaceRoot,
                        source: 'runtime',
                    },
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                }, context));
                return {
                    ...governorResult,
                    metadata: {
                        ...(governorResult.metadata ?? {}),
                        host_recovery: {
                            action,
                            provider,
                            summary,
                            operator_message: operatorMessage,
                            attempted: true,
                            failed_weave_id: weaveId,
                            failed_skill_id: skillId ?? null,
                        },
                    },
                };
            }

            return {
                ...initialResult,
                metadata: {
                    ...(initialResult.metadata ?? {}),
                    host_recovery: {
                        action,
                        provider,
                        summary,
                        operator_message: operatorMessage,
                        attempted: true,
                        failed_weave_id: weaveId,
                        failed_skill_id: skillId ?? null,
                    },
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                ...initialResult,
                metadata: {
                    ...(initialResult.metadata ?? {}),
                    host_recovery: {
                        action: 'abandon',
                        provider,
                        attempted: true,
                        failed_weave_id: weaveId,
                        failed_skill_id: skillId ?? null,
                        recovery_error: message,
                    },
                },
            };
        }
    }

    private async tryExecuteSkillBeadViaHostSession<T>(
        invocation: import('../skills/types.js').SkillBead<T>,
        workspaceRoot: string,
        context: RuntimeContext,
    ): Promise<WeaveResult | null> {
        const executionMode = getCapabilityExecutionMode(workspaceRoot, invocation.skill_id);
        if (executionMode !== 'agent-native') {
            return null;
        }

        const kernelFallbackPolicy = getCapabilityKernelFallbackPolicy(workspaceRoot, invocation.skill_id);
        const fallbackAdapterId = resolveSkillAdapterAlias(workspaceRoot, invocation.skill_id);
        const canFallbackToKernel = kernelFallbackPolicy !== 'forbidden'
            && (fallbackAdapterId !== invocation.skill_id || this.adapters.has(invocation.skill_id));

        const provider = resolveHostProvider(process.env);
        if (!provider) {
            if (kernelFallbackPolicy === 'forbidden') {
                return {
                    weave_id: invocation.skill_id,
                    status: 'FAILURE',
                    output: '',
                    error: `Skill '${invocation.skill_id}' requires an active host session and forbids kernel fallback.`,
                    metadata: {
                        adapter: 'host-session:agent-native-skill',
                        execution_mode: executionMode,
                        kernel_fallback_policy: kernelFallbackPolicy,
                    },
                };
            }
            return null;
        }

        const hostSupportError = explainCapabilityHostSupport(workspaceRoot, invocation.skill_id, provider);
        if (hostSupportError) {
            return {
                weave_id: invocation.skill_id,
                status: 'FAILURE',
                output: '',
                error: hostSupportError,
            };
        }

        const activationPayload = invocation.params && typeof invocation.params === 'object' && !Array.isArray(invocation.params)
            ? invocation.params as Record<string, unknown>
            : { value: invocation.params };
        const inheritedExecutionMetadata = extractInheritedExecutionMetadata(activationPayload);
        const targetPaths = Array.from(new Set([
            String(invocation.target_path ?? '').trim(),
            ...Object.values(activationPayload)
                .filter((value): value is string => typeof value === 'string')
                .filter((value) => /[\\/]|\.([a-z0-9]+)$/i.test(value)),
        ].filter(Boolean)));
        const timeoutMs = resolveHostEnvelopeTimeoutMs('CSTAR_HOST_SKILL_TIMEOUT_MS', 20000);

        try {
            const prompt = buildHostNativeSkillPrompt({
                skill_id: invocation.skill_id,
                intent: invocation.intent,
                project_root: workspaceRoot,
                target_paths: targetPaths,
                payload: activationPayload,
                augury_contract: (context.augury_contract ?? context.trace_contract ?? activationPayload.augury_contract ?? activationPayload.trace_contract) as Record<string, unknown> | undefined,
                augury_mode: 'lite',
                target_domain: context.target_domain,
                spoke_name: context.spoke_name,
                requested_root: context.requested_root,
            });
            const activationSessionId = typeof activationPayload.planning_session_id === 'string' && activationPayload.planning_session_id.trim()
                ? activationPayload.planning_session_id.trim()
                : typeof activationPayload.session_id === 'string' && activationPayload.session_id.trim()
                    ? activationPayload.session_id.trim()
                    : context.session_id ?? null;
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            try {
                const result = await Promise.race([
                    this.deps.hostTextInvoker({
                        prompt,
                        projectRoot: workspaceRoot,
                        source: `runtime:skill:${invocation.skill_id}`,
                        provider,
                        env: process.env,
                        metadata: {
                            transport_mode: 'host_session',
                            one_mind_boundary: 'primary',
                            execution_mode: 'agent-native',
                            skill_id: invocation.skill_id,
                            session_id: activationSessionId,
                            planning_session_id: activationSessionId,
                            trace_id: context.trace_id,
                            bead_id: invocation.id,
                            weave_id: `skill:${invocation.skill_id}`,
                            target_domain: context.target_domain,
                            spoke_name: context.spoke_name ?? null,
                            spoke_root: context.spoke_root ?? null,
                            requested_root: context.requested_root ?? null,
                            ...(context.augury_contract ?? context.trace_contract ? {
                                augury_contract: context.augury_contract ?? context.trace_contract,
                                trace_contract: context.augury_contract ?? context.trace_contract,
                                augury_learning_metadata: buildAuguryLearningMetadata((context.augury_contract ?? context.trace_contract) as unknown as Record<string, unknown>, {
                                    session_id: activationSessionId,
                                    planning_session_id: activationSessionId,
                                    designation_source: context.augury_designation_source ?? context.trace_designation_source ?? null,
                                    prompt_surface: `runtime:skill:${invocation.skill_id}`,
                                    bead_id: invocation.id,
                                    weave_id: `skill:${invocation.skill_id}`,
                                    provider,
                                    steering_mode: 'lite',
                                    target_domain: context.target_domain,
                                    spoke_name: context.spoke_name ?? null,
                                    requested_root: context.requested_root ?? null,
                                }),
                            } : {}),
                            ...(context.augury_designation_source ?? context.trace_designation_source ? {
                                augury_designation_source: context.augury_designation_source ?? context.trace_designation_source,
                                trace_designation_source: context.augury_designation_source ?? context.trace_designation_source,
                            } : {}),
                        },
                    }),
                    new Promise<never>((_, reject) => {
                        timeoutHandle = setTimeout(() => reject(new Error(`host-session timeout after ${timeoutMs}ms`)), timeoutMs);
                    }),
                ]);

                return {
                    weave_id: invocation.skill_id,
                    status: 'SUCCESS',
                    output: result.text,
                    metadata: {
                        adapter: 'host-session:agent-native-skill',
                        execution_mode: executionMode,
                        provider: result.provider,
                        kernel_fallback_policy: kernelFallbackPolicy,
                        target_paths: targetPaths,
                        ...inheritedExecutionMetadata,
                    },
                };
            } finally {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (canFallbackToKernel) {
                return null;
            }
            return {
                weave_id: invocation.skill_id,
                status: 'FAILURE',
                output: '',
                error: `Host-native skill activation failed for '${invocation.skill_id}': ${message}`,
                metadata: {
                    adapter: 'host-session:agent-native-skill',
                    execution_mode: executionMode,
                    kernel_fallback_policy: kernelFallbackPolicy,
                    target_paths: targetPaths,
                    ...inheritedExecutionMetadata,
                },
            };
        }
    }
}
