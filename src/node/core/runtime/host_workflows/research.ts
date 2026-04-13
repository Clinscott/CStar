import {
    ResearchWeavePayload,
    ResearchHostResponse,
    ResearchWeaveMetadata,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import * as hostBridge from  '../weaves/host_bridge.js';
import { saveHallOneMindBranch, saveHallOneMindRequest, summarizeHallOneMindBranches } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import type { HallOneMindBranchRecord } from '../../../../types/hall.js';
import { requestHostDelegatedExecution } from '../../../../core/host_delegation.js';
import type { DelegatedExecutionResult } from '../../../../core/host_delegation.js';
import { getHostSubagentSpec, type HostSubagentProfile } from '../../../../core/host_subagents.js';
import { resolveConfiguredDelegatePollBridge } from '../../../../core/host_session.js';
import { formatCouncilAntiBehavior, listDefaultCouncilProtocols, type CouncilExpertProtocol } from '../../../../core/council_experts.js';

/**
 * External dependencies for the ResearchWeave.
 * Supports 1:1 unit test isolation via dependency injection.
 */
export const deps = {
    ...Object.assign({}, hostBridge),
    saveHallOneMindBranch,
    saveHallOneMindRequest,
    summarizeHallOneMindBranches,
    requestHostDelegatedExecution,
    resolveConfiguredDelegatePollBridge,
};

const RESEARCH_SUBAGENT_PROFILES = new Set<HostSubagentProfile>([
    'architect',
    'backend',
    'frontend',
    'reviewer',
    'tester',
    'debugger',
    'security',
    'documenter',
    'devops',
    'refactorer',
    'performance',
    'api_designer',
    'scout',
    'droid',
    'torvalds',
    'karpathy',
    'hamilton',
    'shannon',
    'dean',
    'carmack',
]);

interface ResearchCouncilBranch {
    label: string;
    question?: string;
    profile: HostSubagentProfile;
    protocol?: CouncilExpertProtocol;
}

const DEFAULT_RESEARCH_COUNCIL: ResearchCouncilBranch[] = listDefaultCouncilProtocols().map((protocol) => ({
    label: protocol.label,
    profile: protocol.profile,
    question: protocol.lens,
    protocol,
}));

export function normalizeResearchResponse(parsed: ResearchHostResponse): { summary: string; researchArtifacts: string[] } {
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
        throw new Error('Research host response must include a non-empty summary string.');
    }

    if (parsed.research_artifacts !== undefined && !Array.isArray(parsed.research_artifacts)) {
        throw new Error('Research host response research_artifacts must be an array of strings when provided.');
    }

    const researchArtifacts = Array.isArray(parsed.research_artifacts)
        ? parsed.research_artifacts.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
        : [];

    return { summary, researchArtifacts };
}

function buildResearchPrompt(intent: string, workspaceRoot: string, branch?: ResearchCouncilBranch): string {
    const spec = branch ? getHostSubagentSpec(branch.profile) : undefined;
    return [
        `Intent: ${intent}`,
        branch ? `Council Expert: ${branch.label} (${spec?.title ?? branch.profile})` : '',
        spec ? `Expert Lens: ${spec.instruction}` : '',
        branch?.protocol ? `Protocol: ${branch.protocol.protocol}` : '',
        branch?.protocol ? `Anti-Behavior: ${formatCouncilAntiBehavior(branch.protocol)}` : '',
        branch?.protocol ? `Root Persona Overlay: ${branch.protocol.root_persona_directive}` : '',
        branch?.question ? `Subquestion: ${branch.question}` : '',
        `Workspace root: ${workspaceRoot}`,
        'Instructions:',
        '1. Inspect the repository first.',
        '2. Use web search only if your host environment supports it and the intent needs external context.',
        '3. Use the named expert lens to attack assumptions and surface concrete mutations, not generic advice.',
        '4. Return strict JSON only in this format:',
        '{ "summary": "...", "research_artifacts": ["artifact-1", "artifact-2"] }',
    ].filter(Boolean).join('\n');
}

function buildResearchBranchGroupId(payload: ResearchWeavePayload, context: RuntimeContext): string {
    return `research:${context.trace_id}:${payload.intent.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 48)}`;
}

function buildResearchBranchMetadata(
    payload: ResearchWeavePayload,
    context: RuntimeContext,
    branchCount: number,
): Record<string, unknown> {
    return {
        mission_id: context.mission_id,
        trace_id: context.trace_id,
        session_id: context.session_id ?? null,
        intent: payload.intent,
        branch_count: branchCount,
    };
}

function normalizeResearchSubagentProfile(value: unknown, fallback: HostSubagentProfile): HostSubagentProfile {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized && RESEARCH_SUBAGENT_PROFILES.has(normalized as HostSubagentProfile)) {
        return normalized as HostSubagentProfile;
    }
    return fallback;
}

function buildResearchCouncilBranches(payload: ResearchWeavePayload): ResearchCouncilBranch[] {
    const explicitQuestions = payload.subquestions?.map((question) => question.trim()).filter(Boolean) ?? [];
    if (explicitQuestions.length > 0) {
        const explicitProfile = normalizeResearchSubagentProfile(payload.subagent_profile, 'architect');
        return explicitQuestions.map((question) => ({
            label: question,
            question,
            profile: explicitProfile,
        }));
    }

    const requestedProfile = typeof payload.subagent_profile === 'string' && payload.subagent_profile.trim()
        ? normalizeResearchSubagentProfile(payload.subagent_profile, 'scout')
        : null;
    if (requestedProfile && requestedProfile !== 'scout') {
        return [{
            label: requestedProfile.toUpperCase(),
            question: payload.intent,
            profile: requestedProfile,
        }];
    }

    return DEFAULT_RESEARCH_COUNCIL;
}

function shouldFallbackToDirectHost(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /configured delegated-execution bridge/i.test(message)
        || /delegate bridge .* returned no output/i.test(message);
}

function getResearchTimeoutMs(provider: string, env: NodeJS.ProcessEnv): number {
    const defaultTimeoutMs = provider === 'codex' && env.CODEX_SHELL !== '1'
        ? 300000
        : 15000;
    const timeoutMsRaw = Number(
        env.CSTAR_RESEARCH_HOST_TIMEOUT_MS
        ?? env.CSTAR_HOST_SESSION_TIMEOUT_MS
        ?? env.CORVUS_HOST_SESSION_TIMEOUT_MS
        ?? defaultTimeoutMs,
    );
    return Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : defaultTimeoutMs;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export class ResearchHostWorkflow implements RuntimeAdapter<ResearchWeavePayload> {
    public readonly id = 'weave:research';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = deps.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<ResearchWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        const provider = deps.resolveRuntimeHostProvider(context);

        if (provider && provider !== 'gemini') {
            try {
                const workspaceRoot = payload.project_root || context.workspace_root;
                const councilBranches = buildResearchCouncilBranches(payload);
                const branchGroupId = buildResearchBranchGroupId(payload, context);
                const now = Date.now();
                const runtimeEnv = { ...process.env, ...context.env } as NodeJS.ProcessEnv;
                const timeoutMs = getResearchTimeoutMs(provider, runtimeEnv);
                const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));
                const metadataBase = buildResearchBranchMetadata(payload, context, councilBranches.length);
                const hasDelegatePollBridge = deps.resolveConfiguredDelegatePollBridge(runtimeEnv, provider);

                if (hasDelegatePollBridge) {
                    const requestIds = councilBranches.map((branch, index) => {
                        const branchId = `${branchGroupId}:${index}`;
                        const requestId = `${branchId}:request`;
                        const source = `runtime:research:branch:${index}`;
                        deps.saveHallOneMindRequest({
                            request_id: requestId,
                            repo_id: repoId,
                            caller_source: source,
                            boundary: 'subagent',
                            request_status: 'PENDING',
                            transport_preference: 'host_session',
                            prompt: buildResearchPrompt(payload.intent, workspaceRoot, branch),
                            metadata: {
                                ...metadataBase,
                                provider,
                                task_kind: 'research',
                                target_paths: [workspaceRoot],
                                runtime_weave: this.id,
                                activation_id: context.bead_id,
                                branch_id: branchId,
                                branch_group_id: branchGroupId,
                                branch_kind: 'research',
                                branch_label: branch.label,
                                branch_index: index,
                                source,
                                one_mind_boundary: 'subagent',
                                execution_role: 'subagent',
                                execution_boundary: 'subagent',
                                subagent_profile: branch.profile,
                                council_expert: branch.label,
                            },
                            created_at: now,
                            updated_at: now,
                        }, workspaceRoot);
                        return requestId;
                    });

                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `Queued ${councilBranches.length} delegated research council branch(es) for broker fulfillment.`,
                        metadata: {
                            context_policy: 'project',
                            delegated: true,
                            parallel: councilBranches.length > 1,
                            branch_count: councilBranches.length,
                            provider,
                            intent: payload.intent,
                            branch_group_id: branchGroupId,
                            activation_id: context.bead_id,
                            queued_request_ids: requestIds,
                        },
                    };
                }

                const branchStates = await Promise.all(councilBranches.map(async (branch, index) => {
                    const branchId = `${branchGroupId}:${index}`;
                    const source = `runtime:research:branch:${index}`;
                    const recordBase: Omit<HallOneMindBranchRecord, 'status'> = {
                        branch_id: branchId,
                        repo_id: repoId,
                        source_weave: this.id,
                        branch_group_id: branchGroupId,
                        branch_kind: 'research',
                        branch_label: branch.label,
                        branch_index: index,
                        provider,
                        session_id: context.session_id,
                        trace_id: context.trace_id,
                        created_at: now,
                        updated_at: Date.now(),
                    };

                    try {
                        let rawText = '';
                        let executionMetadata: Record<string, unknown> = {
                            ...metadataBase,
                            execution_boundary: 'subagent',
                            subagent_profile: branch.profile,
                            council_expert: branch.label,
                        };

                        try {
                            const delegatedResult = await withTimeout(
                                deps.requestHostDelegatedExecution(
                                    {
                                        request_id: `${branchId}:delegate`,
                                        repo_root: workspaceRoot,
                                        boundary: 'subagent',
                                        task_kind: 'research',
                                        subagent_profile: branch.profile,
                                        prompt: buildResearchPrompt(payload.intent, workspaceRoot, branch),
                                        target_paths: [workspaceRoot],
                                        metadata: {
                                            mission_id: context.mission_id,
                                            trace_id: context.trace_id,
                                            session_id: context.session_id ?? null,
                                            source,
                                            one_mind_boundary: 'subagent',
                                            execution_role: 'subagent',
                                            subagent_profile: branch.profile,
                                            council_expert: branch.label,
                                        },
                                    },
                                    runtimeEnv,
                                ),
                                timeoutMs,
                                'research delegated execution',
                            );

                            if (delegatedResult.status === 'completed') {
                                rawText = String((delegatedResult as DelegatedExecutionResult).raw_text ?? '').trim();
                                if (!rawText) {
                                    throw new Error('Research delegated execution completed without raw_text.');
                                }
                                executionMetadata = {
                                    ...executionMetadata,
                                    delegation_mode: delegatedResult.metadata?.delegation_mode ?? 'provider-native',
                                    execution_surface: delegatedResult.metadata?.execution_surface ?? 'host-cli-inference',
                                    handle_id: delegatedResult.handle_id,
                                };
                            } else if (delegatedResult.status === 'failed' || delegatedResult.status === 'cancelled') {
                                const failureMessage = delegatedResult.error || `Research delegated execution returned ${delegatedResult.status}.`;
                                deps.saveHallOneMindBranch({
                                    ...recordBase,
                                    status: 'FAILED',
                                    error_text: failureMessage,
                                    metadata: {
                                        ...executionMetadata,
                                        delegation_status: delegatedResult.status,
                                        handle_id: delegatedResult.handle_id,
                                    },
                                }, workspaceRoot);
                                return { kind: 'failed' as const, error: failureMessage };
                            } else {
                                const nonTerminalMessage = `Research delegated execution returned non-terminal status '${delegatedResult.status}' without a completion bridge.`;
                                deps.saveHallOneMindBranch({
                                    ...recordBase,
                                    status: 'FAILED',
                                    error_text: nonTerminalMessage,
                                    metadata: {
                                        ...executionMetadata,
                                        delegation_status: delegatedResult.status,
                                        handle_id: delegatedResult.handle_id,
                                    },
                                }, workspaceRoot);
                                return { kind: 'failed' as const, error: nonTerminalMessage };
                            }
                        } catch (error) {
                            if (!shouldFallbackToDirectHost(error)) {
                                throw error;
                            }

                            rawText = await withTimeout(
                                this.hostTextInvoker({
                                    provider,
                                    projectRoot: workspaceRoot,
                                    source,
                                    metadata: {
                                        transport_mode: 'host_session',
                                        one_mind_boundary: 'subagent',
                                        execution_role: 'subagent',
                                        subagent_profile: branch.profile,
                                        council_expert: branch.label,
                                    },
                                    systemPrompt: `You are the Corvus Star Council Expert ${branch.label}. Return strict JSON only.`,
                                    prompt: buildResearchPrompt(payload.intent, workspaceRoot, branch),
                                }),
                                timeoutMs,
                                'research host-session',
                            );
                            executionMetadata = {
                                ...executionMetadata,
                                execution_boundary: 'host-session-fallback',
                            };
                        }

                        const parsed = deps.extractJsonObject(rawText) as ResearchHostResponse;
                        const normalized = normalizeResearchResponse(parsed);
                        deps.saveHallOneMindBranch({
                            ...recordBase,
                            status: 'COMPLETED',
                            summary: normalized.summary,
                            artifacts: normalized.researchArtifacts,
                            metadata: executionMetadata,
                        }, workspaceRoot);
                        return {
                            kind: 'completed' as const,
                            question: branch.label,
                            summary: normalized.summary,
                            research_artifacts: normalized.researchArtifacts,
                            parsed,
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        deps.saveHallOneMindBranch({
                            ...recordBase,
                            status: 'FAILED',
                            error_text: message,
                            metadata: {
                                ...metadataBase,
                                execution_boundary: 'subagent',
                                subagent_profile: branch.profile,
                                council_expert: branch.label,
                            },
                        }, workspaceRoot);
                        return { kind: 'failed' as const, error: message };
                    }
                }));

                const failedBranches = branchStates.filter((entry) => entry.kind === 'failed');
                if (failedBranches.length > 0) {
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: `The Research Agent failed through the ${provider} delegated host session: ${failedBranches.map((entry) => entry.error).join(' | ')}`,
                        metadata: {
                            context_policy: 'project',
                            delegated: true,
                            parallel: councilBranches.length > 1,
                            branch_count: councilBranches.length,
                            provider,
                            intent: payload.intent,
                            branch_group_id: branchGroupId,
                        },
                    };
                }

                const branchResults = branchStates.filter((entry) => entry.kind === 'completed');

                const summary = branchResults.map((entry) => entry.summary).join(' ');
                const researchArtifacts = Array.from(new Set(branchResults.flatMap((entry) => entry.research_artifacts)));
                const branchLedgerDigest = deps.summarizeHallOneMindBranches(workspaceRoot, {
                    branchGroupId,
                    traceId: context.trace_id,
                    sessionId: context.session_id,
                });
                const metadata: ResearchWeaveMetadata = {
                    context_policy: 'project',
                    delegated: true,
                    parallel: branchResults.length > 1,
                    branch_count: branchResults.length,
                    provider,
                    intent: payload.intent,
                    branch_group_id: branchGroupId,
                    branch_ledger_digest: branchLedgerDigest ?? undefined,
                    research_artifacts: researchArtifacts,
                    research_payload: branchResults.length === 1 ? branchResults[0]?.parsed : undefined,
                    research_branches: branchResults.map((entry) => ({
                        question: entry.question,
                        summary: entry.summary,
                        research_artifacts: entry.research_artifacts,
                    })),
                };
                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: summary,
                    metadata,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `The Research Agent failed through the ${provider} host session: ${message}`,
                };
            }
        }

        if (provider === 'gemini') {
            const directive = `
[SUB_AGENT_DIRECTIVE]
Task: You are the Corvus Star Council of Experts working through the Trace Gate.
Model Hint: gemini-2.5-flash-lite
Intent: "${payload.intent}"
Council:
- TORVALDS: first-principles systems critique; attack bloat, weak interfaces, and maintenance risk.
- KARPATHY: AI-systems critique; attack model/tool boundaries, eval gaps, and deterministic guards.
- HAMILTON: fault-tolerance critique; attack safety invariants and rollback gaps.
- SHANNON: information-theory critique; attack noisy channels, compression loss, and observability gaps.
- DEAN: distributed-systems critique; attack partitions, stale state, leases, and coordination bottlenecks.
Instructions: 
1. Inspect the repository first.
2. Use google_web_search only if external context is required.
3. If you find a relevant github repo, use your terminal tools to invoke 'python src/skills/local/WildHunt/wild_hunt.py --ingest <url> --name <alias>' to ingest it into Corvus Star.
4. Synthesize the named council findings into a strict JSON object containing a comprehensive summary and a list of artifacts. Do NOT propose beads.
   Format: { "summary": "...", "research_artifacts": ["url1", "url2", "skill:ref-alias"] }
[/SUB_AGENT_DIRECTIVE]
`;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Delegating research to native ONE MIND environment.\n${directive}`,
                metadata: {
                    delegated: true,
                    intent: payload.intent
                }
            };
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Research Agent requires an active host session (Gemini or Codex).',
        };
    }
}

export { ResearchHostWorkflow as ResearchWeave };
