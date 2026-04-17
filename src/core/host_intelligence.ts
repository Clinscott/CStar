import type { IntelligenceResponse } from  '../types/intelligence-contract.js';
import { MimirClient, type MimirClientOptions } from  './mimir_client.js';
import type { AuguryLearningEvent, AuguryLearningMetadata, AugurySteeringMode, HostProvider } from  './host_session.js';
import {
    buildAuguryLearningMetadata,
    formatAugurySteeringBlock,
    recordAuguryLearningEvent,
    resolveHostProvider,
} from  './host_session.js';
import { loadCascadingContext } from './context_loader.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    projectRoot: string;
    source: string;
    provider?: HostProvider | null;
    env?: NodeJS.ProcessEnv;
    correlationId?: string;
    metadata?: Record<string, unknown>;
}

export interface HostTextResult {
    provider: HostProvider;
    response: IntelligenceResponse;
    text: string;
}

export type HostTextClient = Pick<MimirClient, 'request'>;
export type HostTextClientFactory = (options: MimirClientOptions) => HostTextClient;
export type HostSessionInvoker = NonNullable<MimirClientOptions['hostSessionInvoker']>;

let sharedHostSessionInvoker: HostSessionInvoker | undefined;
const auguryPromptHistory = new Set<string>();
const DEFAULT_AUGURY_PROMPT_HISTORY_LIMIT = 1024;

export interface HostTextDependencies {
    clientFactory?: HostTextClientFactory;
    hostSessionInvoker?: HostSessionInvoker;
}

function estimatePromptTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function bindSharedHostSessionInvoker(invoker: HostSessionInvoker): () => void {
    const previous = sharedHostSessionInvoker;
    sharedHostSessionInvoker = invoker;
    return () => {
        sharedHostSessionInvoker = previous;
    };
}

export function clearSharedHostSessionInvoker(): void {
    sharedHostSessionInvoker = undefined;
}

export function clearAuguryPromptHistory(): void {
    auguryPromptHistory.clear();
}

function asMetadataRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeAugurySteeringMode(value: unknown): AugurySteeringMode | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'full' || normalized === 'lite' ? normalized : undefined;
}

function getAuguryPromptHistoryLimit(env: NodeJS.ProcessEnv = process.env): number {
    const parsed = Number.parseInt(String(env.CSTAR_AUGURY_PROMPT_HISTORY_LIMIT ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AUGURY_PROMPT_HISTORY_LIMIT;
}

function markAuguryPromptKeySeen(promptKey: string, env: NodeJS.ProcessEnv = process.env): void {
    auguryPromptHistory.delete(promptKey);
    auguryPromptHistory.add(promptKey);
    const limit = getAuguryPromptHistoryLimit(env);
    while (auguryPromptHistory.size > limit) {
        const oldest = auguryPromptHistory.values().next().value;
        if (typeof oldest !== 'string') {
            break;
        }
        auguryPromptHistory.delete(oldest);
    }
}

function resolveAuguryPromptKey(
    request: HostTextRequest,
    learningMetadata: Record<string, unknown> | undefined,
): string {
    const metadata = request.metadata;
    const explicitKey = getMetadataString(metadata, 'augury_prompt_key');
    if (explicitKey) {
        return `explicit:${explicitKey}`;
    }

    const sessionId = getMetadataString(metadata, 'session_id');
    if (sessionId) {
        return `session:${sessionId}`;
    }

    const planningSessionId = getMetadataString(metadata, 'planning_session_id');
    if (planningSessionId) {
        return `planning:${planningSessionId}`;
    }

    const traceId = getMetadataString(metadata, 'trace_id');
    if (traceId) {
        return `trace:${traceId}`;
    }

    const contractHash = typeof learningMetadata?.contract_hash === 'string'
        ? learningMetadata.contract_hash
        : 'unknown';
    return [
        'contract',
        request.projectRoot,
        request.source,
        contractHash,
    ].join(':');
}

function resolveAugurySteeringMode(
    request: HostTextRequest,
    learningMetadata: Record<string, unknown> | undefined,
    env: NodeJS.ProcessEnv = process.env,
): { mode: AugurySteeringMode; promptKey: string } {
    const promptKey = resolveAuguryPromptKey(request, learningMetadata);
    const explicitMode = normalizeAugurySteeringMode(request.metadata?.augury_steering_mode)
        ?? normalizeAugurySteeringMode(request.metadata?.augury_prompt_mode);
    if (explicitMode) {
        markAuguryPromptKeySeen(promptKey, env);
        return { mode: explicitMode, promptKey };
    }

    if (!auguryPromptHistory.has(promptKey)) {
        markAuguryPromptKeySeen(promptKey, env);
        return { mode: 'full', promptKey };
    }

    markAuguryPromptKeySeen(promptKey, env);
    return { mode: 'lite', promptKey };
}

function buildAuguryLearningEvent(input: {
    projectRoot: string;
    promptKey: string | null;
    metadata: AuguryLearningMetadata;
    resultStatus: string | null;
    transportMode: string | null;
    error?: string | null;
}): AuguryLearningEvent {
    return {
        schema_version: 1,
        event_version: 1,
        event_type: 'host_prompt',
        recorded_at: new Date().toISOString(),
        project_root: input.projectRoot,
        prompt_key: input.promptKey,
        prompt_surface: input.metadata.prompt_surface ?? null,
        steering_mode: input.metadata.steering_mode,
        contract_hash: input.metadata.contract_hash,
        ...(typeof input.metadata.confidence === 'number' ? { confidence: input.metadata.confidence } : {}),
        confidence_source: input.metadata.confidence_source,
        ...(input.metadata.route ? { route: input.metadata.route } : {}),
        ...(input.metadata.intent_category ? { intent_category: input.metadata.intent_category } : {}),
        ...(input.metadata.selection_tier ? { selection_tier: input.metadata.selection_tier } : {}),
        ...(input.metadata.selection_name ? { selection_name: input.metadata.selection_name } : {}),
        ...(input.metadata.expert_id ? { expert_id: input.metadata.expert_id } : {}),
        ...(input.metadata.expert_label ? { expert_label: input.metadata.expert_label } : {}),
        ...(input.metadata.council_candidates ? { council_candidates: input.metadata.council_candidates } : {}),
        mimirs_well_count: input.metadata.mimirs_well_count,
        mimirs_well_omitted_count: input.metadata.mimirs_well_omitted_count,
        session_id: input.metadata.session_id ?? null,
        planning_session_id: input.metadata.planning_session_id ?? null,
        designation_source: input.metadata.designation_source ?? null,
        provider: input.metadata.provider ?? null,
        target_domain: input.metadata.target_domain ?? null,
        spoke_name: input.metadata.spoke_name ?? null,
        requested_root: input.metadata.requested_root ?? null,
        result_status: input.resultStatus,
        transport_mode: input.transportMode,
        error: input.error ?? null,
    };
}

export async function requestHostText(
    request: HostTextRequest,
    dependencies: HostTextDependencies = {},
): Promise<HostTextResult> {
    const env = request.env ?? process.env;
    const provider = request.provider ?? resolveHostProvider(env);

    if (!provider) {
        throw new Error('Host Agent session inactive.');
    }

    const clientFactory = dependencies.clientFactory ?? ((options: MimirClientOptions) => new MimirClient(options));
    const hostSessionInvoker = dependencies.hostSessionInvoker ?? sharedHostSessionInvoker;
    const timeoutRaw = Number(env.CSTAR_HOST_SESSION_TIMEOUT_MS ?? env.CORVUS_HOST_SESSION_TIMEOUT_MS ?? '');
    const hostSessionTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : undefined;
    const client = clientFactory({
        projectRoot: request.projectRoot,
        env,
        hostSessionActive: true,
        hostProvider: provider,
        hostSessionInvoker,
        hostSessionTimeoutMs,
    });

    const cascadingContext = loadCascadingContext(request.projectRoot);
    const auguryContract = (request.metadata?.augury_contract ?? request.metadata?.trace_contract) as Record<string, unknown> | undefined;
    const targetDomain = typeof request.metadata?.target_domain === 'string' ? request.metadata.target_domain : undefined;
    const spokeName = typeof request.metadata?.spoke_name === 'string' ? request.metadata.spoke_name : undefined;
    const requestedRoot = typeof request.metadata?.requested_root === 'string' ? request.metadata.requested_root : undefined;
    const existingLearningMetadata = asMetadataRecord(request.metadata?.augury_learning_metadata);
    const provisionalLearningMetadata = auguryContract
        ? existingLearningMetadata ?? buildAuguryLearningMetadata(auguryContract)
        : undefined;
    const auguryDecision = auguryContract
        ? resolveAugurySteeringMode(request, provisionalLearningMetadata, env)
        : undefined;
    const auguryMode = auguryDecision?.mode ?? 'full';
    const auguryPromptKey = auguryDecision?.promptKey ?? null;
    const auguryBlock = formatAugurySteeringBlock(auguryContract, {
        mode: auguryMode,
        project_root: request.projectRoot,
        target_domain: targetDomain,
        spoke_name: spokeName,
        requested_root: requestedRoot,
    });
    const finalSystemPrompt = [
        auguryBlock,
        request.systemPrompt,
        cascadingContext,
    ].filter((entry) => typeof entry === 'string' && entry.trim().length > 0).join('\n\n');
    const auguryLearningMetadata = auguryContract ? buildAuguryLearningMetadata(auguryContract, {
        session_id: typeof request.metadata?.session_id === 'string'
            ? request.metadata.session_id
            : typeof request.metadata?.planning_session_id === 'string'
                ? request.metadata.planning_session_id
                : null,
        planning_session_id: typeof request.metadata?.planning_session_id === 'string'
            ? request.metadata.planning_session_id
            : null,
        designation_source: typeof request.metadata?.augury_designation_source === 'string'
            ? request.metadata.augury_designation_source
            : typeof request.metadata?.trace_designation_source === 'string'
                ? request.metadata.trace_designation_source
                : null,
        prompt_surface: request.source,
        provider,
        prompt_token_estimate: finalSystemPrompt ? estimatePromptTokens(finalSystemPrompt) : null,
        steering_mode: auguryMode,
        target_domain: targetDomain ?? null,
        spoke_name: spokeName ?? null,
        requested_root: requestedRoot ?? null,
    }) : undefined;
    const requestMetadata = {
        ...(request.metadata ?? {}),
        ...(auguryContract && auguryLearningMetadata ? {
            augury_learning_metadata: auguryLearningMetadata,
            augury_steering_mode: auguryMode,
            augury_prompt_key: auguryPromptKey,
        } : {}),
    };

    const intelligenceRequest = {
        prompt: request.prompt,
        system_prompt: finalSystemPrompt || undefined,
        correlation_id: request.correlationId,
        caller: { source: request.source },
        metadata: requestMetadata,
        transport_mode: (requestMetadata.transport_mode as any) ?? 'host_session',
    };
    let response: IntelligenceResponse;
    try {
        response = await client.request({
            ...intelligenceRequest,
        });
    } catch (error) {
        if (auguryLearningMetadata) {
            recordAuguryLearningEvent(request.projectRoot, buildAuguryLearningEvent({
                projectRoot: request.projectRoot,
                promptKey: auguryPromptKey,
                metadata: auguryLearningMetadata,
                resultStatus: 'transport_error',
                transportMode: (requestMetadata.transport_mode as string | undefined) ?? 'host_session',
                error: error instanceof Error ? error.message : String(error),
            }), env);
        }
        throw error;
    }

    if (auguryLearningMetadata) {
        recordAuguryLearningEvent(request.projectRoot, buildAuguryLearningEvent({
            projectRoot: request.projectRoot,
            promptKey: auguryPromptKey,
            metadata: auguryLearningMetadata,
            resultStatus: response.status,
            transportMode: (requestMetadata.transport_mode as string | undefined) ?? 'host_session',
            error: response.status === 'success' ? null : response.error ?? null,
        }), env);
    }

    if (response.status !== 'success') {
        throw new Error(response.error ?? `${provider} host session invocation failed.`);
    }

    const text = String(response.raw_text ?? '').trim();
    if (!text) {
        throw new Error(`${provider} host session returned no output.`);
    }

    return {
        provider,
        response,
        text,
    };
}
