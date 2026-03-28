import {
    CritiqueWeaveMetadata,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, type HostTextInvoker } from  './host_bridge.js';
import { saveHallOneMindBranch, summarizeHallOneMindBranches } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath, type HallOneMindBranchRecord } from '../../../../types/hall.js';

export interface CritiqueWeavePayload {
    bead: Record<string, unknown>;
    research: Record<string, unknown>;
    context?: string;
    focus_areas?: string[];
    project_root?: string;
    cwd: string;
}

const critiqueDeps = {
    saveHallOneMindBranch,
    summarizeHallOneMindBranches,
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

export class CritiqueWeave implements RuntimeAdapter<CritiqueWeavePayload> {
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
                const parsedBranches = await Promise.all(branches.map(async (focusArea, index) => {
                    const rawText = await this.hostTextInvoker({
                        provider,
                        projectRoot: workspaceRoot,
                        source: focusArea ? `runtime:critique:branch:${index}` : 'runtime:critique',
                        env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                        metadata: {
                            transport_mode: 'host_session',
                            one_mind_boundary: 'primary',
                            execution_role: 'primary',
                        },
                        systemPrompt: 'You are the Corvus Star Adversarial Critique Agent. Return strict JSON only.',
                        prompt: buildCritiquePrompt(payload, focusArea),
                    });
                    const parsed = extractJsonObject(rawText);
                    const critique = typeof parsed.critique === 'string' ? parsed.critique.trim() : '';
                    const record: HallOneMindBranchRecord = {
                        branch_id: `${branchGroupId}:${index}`,
                        repo_id: buildHallRepositoryId(normalizeHallPath(workspaceRoot)),
                        source_weave: this.id,
                        branch_group_id: branchGroupId,
                        branch_kind: 'critique',
                        branch_label: focusArea ?? 'full-critique',
                        branch_index: index,
                        status: 'COMPLETED',
                        provider,
                        session_id: context.session_id,
                        trace_id: context.trace_id,
                        summary: critique || 'Critique branch completed.',
                        artifacts: [],
                        metadata: buildCritiqueBranchMetadata(context, parsed, branches.length),
                        created_at: now,
                        updated_at: now,
                    };
                    critiqueDeps.saveHallOneMindBranch(record, workspaceRoot);
                    return {
                        focus_area: focusArea,
                        parsed,
                    };
                }));
                const parsed = parsedBranches.length === 1
                    ? parsedBranches[0]?.parsed
                    : {
                        needs_revision: parsedBranches.some((entry) => entry.parsed.needs_revision === true),
                        critique: parsedBranches
                            .map((entry) => {
                                const critique = typeof entry.parsed.critique === 'string' ? entry.parsed.critique.trim() : '';
                                if (!critique) {
                                    return '';
                                }
                                return entry.focus_area ? `[${entry.focus_area}] ${critique}` : critique;
                            })
                            .filter(Boolean)
                            .join('\n'),
                        evidence_source: parsedBranches
                            .map((entry) => typeof entry.parsed.evidence_source === 'string' ? entry.parsed.evidence_source.trim() : '')
                            .filter(Boolean)
                            .join(' | '),
                        proposed_path: parsedBranches.find((entry) => typeof entry.parsed.proposed_path === 'string' && entry.parsed.proposed_path.trim())?.parsed.proposed_path,
                        branches: parsedBranches.map((entry) => ({
                            focus_area: entry.focus_area ?? null,
                            ...entry.parsed,
                        })),
                    };
                const branchLedgerDigest = critiqueDeps.summarizeHallOneMindBranches(workspaceRoot, {
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
                    branch_ledger_digest: branchLedgerDigest ?? undefined,
                    parallel: parsedBranches.length > 1,
                    branch_count: parsedBranches.length,
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
