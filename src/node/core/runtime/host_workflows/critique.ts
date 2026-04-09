import {
    CritiqueWeaveMetadata,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, type HostTextInvoker } from  '../weaves/host_bridge.js';
import { saveHallOneMindBranch, saveHallOneMindRequest, summarizeHallOneMindBranches } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath, type HallOneMindBranchRecord } from '../../../../types/hall.js';
import { requestHostDelegatedExecution } from '../../../../core/host_delegation.js';
import type { DelegatedExecutionResult } from '../../../../core/host_delegation.js';
import { resolveConfiguredDelegatePollBridge } from '../../../../core/host_session.js';

export interface CritiqueWeavePayload {
    bead: Record<string, unknown>;
    research: Record<string, unknown>;
    context?: string;
    focus_areas?: string[];
    project_root?: string;
    cwd: string;
}

export const deps = {
    requestHostDelegatedExecution,
    saveHallOneMindBranch,
    saveHallOneMindRequest,
    summarizeHallOneMindBranches,
    resolveConfiguredDelegatePollBridge,
};

function buildCritiquePrompt(payload: CritiqueWeavePayload, focusArea?: string): string {
    return [
        'Stress-test the proposed bead against the supplied research and return strict JSON only.',
        'Expected format: { "needs_revision": boolean, "critique": "...", "evidence_source": "...", "proposed_path": "..." }',
        focusArea ? `FOCUS AREA: ${focusArea}` : '',
        '',
        `PROPOSED BEAD:\n${JSON.stringify(payload.bead, null, 2)}`,
        '',
        `RESEARCH CONTEXT:\n${JSON.stringify(payload.research, null, 2)}`,
        '',
        `ROLLING CONTEXT:\n${payload.context ?? 'None'}`,
    ].filter(Boolean).join('\n');
}

function buildCritiqueBranchGroupId(context: RuntimeContext): string {
    return `critique:${context.trace_id}`;
}

function buildCritiqueBranchMetadata(
    context: RuntimeContext,
    parsed: Record<string, unknown>,
    branchCount: number,
): Record<string, unknown> {
    return {
        mission_id: context.mission_id,
        trace_id: context.trace_id,
        session_id: context.session_id ?? null,
        branch_count: branchCount,
        needs_revision: parsed.needs_revision === true,
        evidence_source: typeof parsed.evidence_source === 'string' ? parsed.evidence_source.trim() : null,
        proposed_path: typeof parsed.proposed_path === 'string' ? parsed.proposed_path.trim() : null,
    };
}

function shouldFallbackToDirectHost(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /configured delegated-execution bridge/i.test(message)
        || /delegate bridge .* returned no output/i.test(message);
}

function getCritiqueTimeoutMs(provider: string, env: NodeJS.ProcessEnv): number {
    const defaultTimeoutMs = provider === 'codex' && env.CODEX_SHELL !== '1'
        ? 300000
        : 15000;
    const timeoutMsRaw = Number(
        env.CSTAR_CRITIQUE_HOST_TIMEOUT_MS
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

export class CritiqueHostWorkflow implements RuntimeAdapter<CritiqueWeavePayload> {
    public readonly id = 'weave:critique';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<CritiqueWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        const provider = resolveRuntimeHostProvider(context);

        if (provider) {
            try {
                const focusAreas = payload.focus_areas?.map((entry) => entry.trim()).filter(Boolean) ?? [];
                const branches = focusAreas.length > 0 ? focusAreas : [undefined];
                const branchGroupId = buildCritiqueBranchGroupId(context);
                const workspaceRoot = payload.project_root || context.workspace_root;
                const now = Date.now();
                const runtimeEnv = { ...process.env, ...context.env } as NodeJS.ProcessEnv;
                const timeoutMs = getCritiqueTimeoutMs(provider, runtimeEnv);
                const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));
                const hasDelegatePollBridge = deps.resolveConfiguredDelegatePollBridge(runtimeEnv, provider);

                if (hasDelegatePollBridge) {
                    const requestIds = branches.map((focusArea, index) => {
                        const prompt = buildCritiquePrompt(payload, focusArea);
                        const branchId = `${branchGroupId}:${index}`;
                        const branchLabel = focusArea ?? 'full-critique';
                        const source = `runtime:critique:branch:${index}`;
                        deps.saveHallOneMindRequest({
                            request_id: `${branchId}:request`,
                            repo_id: repoId,
                            caller_source: source,
                            boundary: 'subagent',
                            request_status: 'PENDING',
                            transport_preference: 'host_session',
                            prompt,
                            metadata: {
                                mission_id: context.mission_id,
                                trace_id: context.trace_id,
                                session_id: context.session_id ?? null,
                                provider,
                                task_kind: 'critique',
                                target_paths: [workspaceRoot],
                                runtime_weave: this.id,
                                activation_id: context.bead_id,
                                branch_id: branchId,
                                branch_group_id: branchGroupId,
                                branch_kind: 'critique',
                                branch_label: branchLabel,
                                branch_index: index,
                                branch_count: branches.length,
                                source,
                                one_mind_boundary: 'subagent',
                                execution_role: 'subagent',
                                execution_boundary: 'subagent',
                                subagent_profile: 'reviewer',
                            },
                            created_at: now,
                            updated_at: now,
                        }, workspaceRoot);
                        return `${branchId}:request`;
                    });

                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `Queued ${branches.length} delegated critique branch(es) for broker fulfillment.`,
                        metadata: {
                            context_policy: 'project',
                            delegated: true,
                            provider,
                            bead_title: payload.bead.title,
                            branch_group_id: branchGroupId,
                            parallel: branches.length > 1,
                            branch_count: branches.length,
                            activation_id: context.bead_id,
                            queued_request_ids: requestIds,
                        },
                    };
                }

                const parsedBranches = await Promise.all(branches.map(async (focusArea, index) => {
                    const prompt = buildCritiquePrompt(payload, focusArea);
                    const branchId = `${branchGroupId}:${index}`;
                    const recordBase: Omit<HallOneMindBranchRecord, 'status'> = {
                        branch_id: branchId,
                        repo_id: repoId,
                        source_weave: this.id,
                        branch_group_id: branchGroupId,
                        branch_kind: 'critique',
                        branch_label: focusArea ?? 'full-critique',
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
                            runtime_weave: this.id,
                            branch_group_id: branchGroupId,
                            branch_index: index,
                            trace_id: context.trace_id,
                            session_id: context.session_id ?? null,
                            execution_boundary: 'subagent',
                            subagent_profile: 'reviewer',
                        };

                        try {
                            const delegatedResult = await withTimeout(
                                deps.requestHostDelegatedExecution(
                                    {
                                        request_id: `${branchId}:delegate`,
                                        repo_root: workspaceRoot,
                                        boundary: 'subagent',
                                        task_kind: 'critique',
                                        subagent_profile: 'reviewer',
                                        prompt,
                                        target_paths: [workspaceRoot],
                                        metadata: {
                                            runtime_weave: this.id,
                                            branch_group_id: branchGroupId,
                                            branch_index: index,
                                            trace_id: context.trace_id,
                                            session_id: context.session_id ?? null,
                                            one_mind_boundary: 'subagent',
                                            execution_role: 'subagent',
                                            subagent_profile: 'reviewer',
                                        },
                                    },
                                    runtimeEnv,
                                ),
                                timeoutMs,
                                'critique delegated execution',
                            );

                            if (delegatedResult.status === 'completed') {
                                rawText = String((delegatedResult as DelegatedExecutionResult).raw_text ?? '').trim();
                                if (!rawText) {
                                    throw new Error('Critique delegated execution completed without raw_text.');
                                }
                                executionMetadata = {
                                    ...executionMetadata,
                                    delegation_mode: delegatedResult.metadata?.delegation_mode ?? 'provider-native',
                                    execution_surface: delegatedResult.metadata?.execution_surface ?? 'host-cli-inference',
                                    handle_id: delegatedResult.handle_id,
                                };
                            } else if (delegatedResult.status === 'failed' || delegatedResult.status === 'cancelled') {
                                const failureMessage = delegatedResult.error || `Critique delegated execution returned ${delegatedResult.status}.`;
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
                                const nonTerminalMessage = `Critique delegated execution returned non-terminal status '${delegatedResult.status}' without a completion bridge.`;
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
                                    prompt,
                                    systemPrompt: 'You are the Corvus Star Adversarial Critique Agent. Return strict JSON only.',
                                    provider,
                                    projectRoot: workspaceRoot,
                                    source: 'critique:host-workflow',
                                    env: context.env,
                                    metadata: {
                                        runtime_weave: this.id,
                                        branch_group_id: branchGroupId,
                                        branch_index: index,
                                        trace_id: context.trace_id,
                                        session_id: context.session_id ?? null,
                                        one_mind_boundary: 'subagent',
                                        execution_role: 'subagent',
                                        subagent_profile: 'reviewer',
                                    },
                                }),
                                timeoutMs,
                                'critique host-session',
                            );
                            executionMetadata = {
                                ...executionMetadata,
                                execution_boundary: 'host-session-fallback',
                            };
                        }

                        const parsed = extractJsonObject(rawText);
                        const critique = typeof parsed.critique === 'string' ? parsed.critique.trim() : '';
                        deps.saveHallOneMindBranch({
                            ...recordBase,
                            status: 'COMPLETED',
                            summary: critique || 'Critique branch completed.',
                            artifacts: [],
                            metadata: {
                                ...buildCritiqueBranchMetadata(context, parsed, branches.length),
                                ...executionMetadata,
                            },
                        }, workspaceRoot);
                        return {
                            kind: 'completed' as const,
                            focus_area: focusArea,
                            parsed,
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        deps.saveHallOneMindBranch({
                            ...recordBase,
                            status: 'FAILED',
                            error_text: message,
                            metadata: {
                                runtime_weave: this.id,
                                branch_group_id: branchGroupId,
                                branch_index: index,
                                trace_id: context.trace_id,
                                session_id: context.session_id ?? null,
                                execution_boundary: 'subagent',
                                subagent_profile: 'reviewer',
                            },
                        }, workspaceRoot);
                        return { kind: 'failed' as const, error: message };
                    }
                }));
                const failedBranches = parsedBranches.filter((entry) => entry.kind === 'failed');
                if (failedBranches.length > 0) {
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: `The Critique Agent failed through the ${provider} delegated host session: ${failedBranches.map((entry) => entry.error).join(' | ')}`,
                    };
                }
                const completedBranches = parsedBranches.filter((entry) => entry.kind === 'completed');
                const parsed = completedBranches.length === 1
                    ? completedBranches[0]?.parsed
                    : {
                        needs_revision: completedBranches.some((entry) => entry.parsed.needs_revision === true),
                        critique: completedBranches
                            .map((entry) => {
                                const critique = typeof entry.parsed.critique === 'string' ? entry.parsed.critique.trim() : '';
                                if (!critique) {
                                    return '';
                                }
                                return entry.focus_area ? `[${entry.focus_area}] ${critique}` : critique;
                            })
                            .filter(Boolean)
                            .join('\n'),
                        evidence_source: completedBranches
                            .map((entry) => typeof entry.parsed.evidence_source === 'string' ? entry.parsed.evidence_source.trim() : '')
                            .filter(Boolean)
                            .join(' | '),
                        proposed_path: completedBranches.find((entry) => typeof entry.parsed.proposed_path === 'string' && entry.parsed.proposed_path.trim())?.parsed.proposed_path,
                        branches: completedBranches.map((entry) => ({
                            focus_area: entry.focus_area ?? null,
                            ...entry.parsed,
                        })),
                    };
                const branchLedgerDigest = deps.summarizeHallOneMindBranches(workspaceRoot, {
                    branchGroupId,
                    traceId: context.trace_id,
                    sessionId: context.session_id,
                });
                const metadata: CritiqueWeaveMetadata = {
                    context_policy: 'project',
                    delegated: true,
                    provider,
                    bead_title: payload.bead.title,
                    branch_group_id: branchGroupId,
                    branch_ledger_digest: branchLedgerDigest
                        ? branchLedgerDigest as unknown as Record<string, unknown>
                        : undefined,
                    parallel: completedBranches.length > 1,
                    branch_count: completedBranches.length,
                    critique_payload: parsed,
                };
                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: typeof parsed.critique === 'string' && parsed.critique.trim()
                        ? parsed.critique.trim()
                        : 'Critique complete.',
                    metadata,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `The Critique Agent failed through the ${provider} host session: ${message}`,
                };
            }
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Critique Agent requires an active host session.',
        };
    }
}

export { CritiqueHostWorkflow as CritiqueWeave };
