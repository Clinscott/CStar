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
import { saveHallOneMindBranch, summarizeHallOneMindBranches } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import type { HallOneMindBranchRecord } from '../../../../types/hall.js';

/**
 * External dependencies for the ResearchWeave.
 * Supports 1:1 unit test isolation via dependency injection.
 */
export const deps = {
    ...Object.assign({}, hostBridge),
    saveHallOneMindBranch,
    summarizeHallOneMindBranches,
};

function normalizeResearchResponse(parsed: ResearchHostResponse): { summary: string; researchArtifacts: string[] } {
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

function buildResearchPrompt(intent: string, workspaceRoot: string, question?: string): string {
    return [
        `Intent: ${intent}`,
        question ? `Subquestion: ${question}` : '',
        `Workspace root: ${workspaceRoot}`,
        'Instructions:',
        '1. Inspect the repository first.',
        '2. Use web search only if your host environment supports it and the intent needs external context.',
        '3. Synthesize only the findings needed for the planner to continue.',
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
                const branches = payload.subquestions && payload.subquestions.length > 0
                    ? payload.subquestions.map((question) => question.trim()).filter(Boolean)
                    : [];
                const branchQuestions = branches.length > 0 ? branches : [payload.intent];
                const branchGroupId = buildResearchBranchGroupId(payload, context);
                const now = Date.now();
                const branchResults = await Promise.all(branchQuestions.map(async (question, index) => {
                    const defaultTimeoutMs = provider === 'codex' && process.env.CODEX_SHELL !== '1'
                        ? 300000
                        : 15000;
                    const timeoutMsRaw = Number(
                        process.env.CSTAR_RESEARCH_HOST_TIMEOUT_MS
                        ?? process.env.CSTAR_HOST_SESSION_TIMEOUT_MS
                        ?? process.env.CORVUS_HOST_SESSION_TIMEOUT_MS
                        ?? defaultTimeoutMs,
                    );
                    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : defaultTimeoutMs;
                    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
                    const rawText = await (async () => {
                        try {
                            return await Promise.race([
                                this.hostTextInvoker({
                                    provider,
                                    projectRoot: workspaceRoot,
                                    source: branches.length > 0 ? `runtime:research:branch:${index}` : 'runtime:research',
                                    metadata: {
                                        transport_mode: 'host_session',
                                        one_mind_boundary: 'primary',
                                        execution_role: 'primary',
                                    },
                                    systemPrompt: 'You are the Corvus Star Research Agent. Return strict JSON only.',
                                    prompt: buildResearchPrompt(payload.intent, workspaceRoot, branches.length > 0 ? question : undefined),
                                }),
                                new Promise<string>((_, reject) => {
                                    timeoutHandle = setTimeout(() => reject(new Error(`research host-session timeout after ${timeoutMs}ms`)), timeoutMs);
                                }),
                            ]);
                        } finally {
                            if (timeoutHandle) {
                                clearTimeout(timeoutHandle);
                            }
                        }
                    })();
                    const parsed = deps.extractJsonObject(rawText) as ResearchHostResponse;
                    const normalized = normalizeResearchResponse(parsed);
                    const record: HallOneMindBranchRecord = {
                        branch_id: `${branchGroupId}:${index}`,
                        repo_id: buildHallRepositoryId(normalizeHallPath(workspaceRoot)),
                        source_weave: this.id,
                        branch_group_id: branchGroupId,
                        branch_kind: 'research',
                        branch_label: question,
                        branch_index: index,
                        status: 'COMPLETED',
                        provider,
                        session_id: context.session_id,
                        trace_id: context.trace_id,
                        summary: normalized.summary,
                        artifacts: normalized.researchArtifacts,
                        metadata: buildResearchBranchMetadata(payload, context, branchQuestions.length),
                        created_at: now,
                        updated_at: now,
                    };
                    deps.saveHallOneMindBranch(record, workspaceRoot);
                    return {
                        question,
                        summary: normalized.summary,
                        research_artifacts: normalized.researchArtifacts,
                        parsed,
                    };
                }));

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
Task: You are the Corvus Star Research Agent.
Model Hint: gemini-2.5-flash-lite
Intent: "${payload.intent}"
Instructions: 
1. Inspect the repository first.
2. Use google_web_search only if external context is required.
3. If you find a relevant github repo, use your terminal tools to invoke 'python src/skills/local/WildHunt/wild_hunt.py --ingest <url> --name <alias>' to ingest it into Corvus Star.
4. Synthesize your findings into a strict JSON object containing a comprehensive summary and a list of artifacts. Do NOT propose beads.
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
