import {
    getHallBead,
    getHallSkillActivation,
    listHallOneMindRequests,
    saveHallOneMindBranch,
    saveHallSkillActivation,
    summarizeHallOneMindBranches,
} from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath, type HallOneMindBranchRecord, type HallOneMindRequestRecord } from '../../../../types/hall.js';
import { extractJsonObject } from '../weaves/host_bridge.js';
import { OrchestratorReaper } from '../reaper.js';
import { engraveReadyForReviewMemory } from '../episodic_memory.js';

type WorkflowKind = 'research' | 'critique';

interface NormalizedBranchSuccess {
    kind: 'completed';
    request: HallOneMindRequestRecord;
    branchId: string;
    branchGroupId: string;
    branchIndex: number;
    branchLabel: string;
    provider?: string;
    traceId?: string;
    sessionId?: string;
    summary: string;
    artifacts: string[];
    parsed: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

interface NormalizedBranchFailure {
    kind: 'failed';
    request: HallOneMindRequestRecord;
    branchId: string;
    branchGroupId: string;
    branchIndex: number;
    branchLabel: string;
    provider?: string;
    traceId?: string;
    sessionId?: string;
    error: string;
    metadata: Record<string, unknown>;
}

type NormalizedBranchResult = NormalizedBranchSuccess | NormalizedBranchFailure;

function asString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function isTerminalStatus(status: HallOneMindRequestRecord['request_status']): boolean {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

function getWorkflowKind(request: HallOneMindRequestRecord): WorkflowKind | null {
    const runtimeWeave = asString(request.metadata?.runtime_weave);
    if (runtimeWeave === 'weave:research') {
        return 'research';
    }
    if (runtimeWeave === 'weave:critique') {
        return 'critique';
    }
    return null;
}

function normalizeResearchSuccess(request: HallOneMindRequestRecord): NormalizedBranchSuccess {
    const rawText = asString(request.response_text);
    if (!rawText) {
        throw new Error(`Delegated research request '${request.request_id}' completed without response_text.`);
    }

    const parsed = extractJsonObject(rawText) as Record<string, unknown>;
    const summary = asString(parsed.summary);
    if (!summary) {
        throw new Error(`Delegated research request '${request.request_id}' must include a non-empty summary string.`);
    }

    const artifacts = asStringArray(parsed.research_artifacts);
    return {
        kind: 'completed',
        request,
        branchId: asString(request.metadata?.branch_id) ?? request.request_id,
        branchGroupId: asString(request.metadata?.branch_group_id) ?? request.request_id,
        branchIndex: Number(request.metadata?.branch_index ?? 0),
        branchLabel: asString(request.metadata?.branch_label) ?? asString(request.metadata?.intent) ?? 'research',
        provider: asString(request.metadata?.provider),
        traceId: asString(request.metadata?.trace_id),
        sessionId: asString(request.metadata?.session_id),
        summary,
        artifacts,
        parsed,
        metadata: {
            mission_id: request.metadata?.mission_id ?? null,
            trace_id: request.metadata?.trace_id ?? null,
            session_id: request.metadata?.session_id ?? null,
            intent: request.metadata?.intent ?? null,
            branch_count: Number(request.metadata?.branch_count ?? 1),
            execution_boundary: 'subagent',
            subagent_profile: request.metadata?.subagent_profile ?? null,
            delegation_status: request.metadata?.delegation_status ?? request.request_status.toLowerCase(),
            handle_id: request.metadata?.handle_id ?? null,
            execution_surface: request.metadata?.execution_surface ?? null,
            delegation_mode: request.metadata?.delegation_mode ?? null,
        },
    };
}

function normalizeCritiqueSuccess(request: HallOneMindRequestRecord): NormalizedBranchSuccess {
    const rawText = asString(request.response_text);
    if (!rawText) {
        throw new Error(`Delegated critique request '${request.request_id}' completed without response_text.`);
    }

    const parsed = extractJsonObject(rawText) as Record<string, unknown>;
    const critique = asString(parsed.critique) ?? 'Critique branch completed.';
    return {
        kind: 'completed',
        request,
        branchId: asString(request.metadata?.branch_id) ?? request.request_id,
        branchGroupId: asString(request.metadata?.branch_group_id) ?? request.request_id,
        branchIndex: Number(request.metadata?.branch_index ?? 0),
        branchLabel: asString(request.metadata?.branch_label) ?? 'full-critique',
        provider: asString(request.metadata?.provider),
        traceId: asString(request.metadata?.trace_id),
        sessionId: asString(request.metadata?.session_id),
        summary: critique,
        artifacts: [],
        parsed,
        metadata: {
            mission_id: request.metadata?.mission_id ?? null,
            trace_id: request.metadata?.trace_id ?? null,
            session_id: request.metadata?.session_id ?? null,
            branch_count: Number(request.metadata?.branch_count ?? 1),
            needs_revision: parsed.needs_revision === true,
            evidence_source: asString(parsed.evidence_source) ?? null,
            proposed_path: asString(parsed.proposed_path) ?? null,
            runtime_weave: request.metadata?.runtime_weave ?? 'weave:critique',
            branch_group_id: request.metadata?.branch_group_id ?? null,
            branch_index: Number(request.metadata?.branch_index ?? 0),
            execution_boundary: 'subagent',
            subagent_profile: request.metadata?.subagent_profile ?? 'reviewer',
            delegation_status: request.metadata?.delegation_status ?? request.request_status.toLowerCase(),
            handle_id: request.metadata?.handle_id ?? null,
            execution_surface: request.metadata?.execution_surface ?? null,
            delegation_mode: request.metadata?.delegation_mode ?? null,
        },
    };
}

function normalizeFailure(request: HallOneMindRequestRecord): NormalizedBranchFailure {
    const fallbackStatus = request.request_status === 'CANCELLED' ? 'cancelled' : 'failed';
    const error = asString(request.error_text)
        ?? `Delegated request '${request.request_id}' ${fallbackStatus}.`;
    return {
        kind: 'failed',
        request,
        branchId: asString(request.metadata?.branch_id) ?? request.request_id,
        branchGroupId: asString(request.metadata?.branch_group_id) ?? request.request_id,
        branchIndex: Number(request.metadata?.branch_index ?? 0),
        branchLabel: asString(request.metadata?.branch_label) ?? request.request_id,
        provider: asString(request.metadata?.provider),
        traceId: asString(request.metadata?.trace_id),
        sessionId: asString(request.metadata?.session_id),
        error,
        metadata: {
            mission_id: request.metadata?.mission_id ?? null,
            trace_id: request.metadata?.trace_id ?? null,
            session_id: request.metadata?.session_id ?? null,
            execution_boundary: 'subagent',
            subagent_profile: request.metadata?.subagent_profile ?? null,
            delegation_status: request.metadata?.delegation_status ?? request.request_status.toLowerCase(),
            handle_id: request.metadata?.handle_id ?? null,
            execution_surface: request.metadata?.execution_surface ?? null,
            delegation_mode: request.metadata?.delegation_mode ?? null,
        },
    };
}

function normalizeBranchResult(request: HallOneMindRequestRecord, workflowKind: WorkflowKind): NormalizedBranchResult {
    if (request.request_status !== 'COMPLETED') {
        return normalizeFailure(request);
    }

    return workflowKind === 'research'
        ? normalizeResearchSuccess(request)
        : normalizeCritiqueSuccess(request);
}

function persistBranchRecord(
    rootPath: string,
    repoId: string,
    workflowKind: WorkflowKind,
    request: HallOneMindRequestRecord,
    normalized: NormalizedBranchResult,
): void {
    const recordBase: Omit<HallOneMindBranchRecord, 'status'> = {
        branch_id: normalized.branchId,
        repo_id: repoId,
        source_weave: workflowKind === 'research' ? 'weave:research' : 'weave:critique',
        branch_group_id: normalized.branchGroupId,
        branch_kind: workflowKind,
        branch_label: normalized.branchLabel,
        branch_index: normalized.branchIndex,
        provider: normalized.provider,
        session_id: normalized.sessionId,
        trace_id: normalized.traceId,
        parent_request_id: request.request_id,
        created_at: request.created_at,
        updated_at: Date.now(),
    };

    if (normalized.kind === 'completed') {
        saveHallOneMindBranch({
            ...recordBase,
            status: 'COMPLETED',
            summary: normalized.summary,
            artifacts: normalized.artifacts,
            metadata: normalized.metadata,
        }, rootPath);
        return;
    }

    saveHallOneMindBranch({
        ...recordBase,
        status: 'FAILED',
        error_text: normalized.error,
        metadata: normalized.metadata,
    }, rootPath);
}

function buildResearchActivationResult(
    normalized: NormalizedBranchResult[],
    provider: string | undefined,
    branchGroupId: string,
    branchLedgerDigest: Record<string, unknown> | undefined,
    intent: string | undefined,
): {
    status: 'SUCCESS' | 'FAILURE';
    output: string;
    error?: string;
    metadata: Record<string, unknown>;
} {
    const failures = normalized.filter((entry) => entry.kind === 'failed');
    if (failures.length > 0) {
        const error = failures.map((entry) => entry.error).join(' | ');
        return {
            status: 'FAILURE',
            output: '',
            error,
            metadata: {
                context_policy: 'project',
                delegated: true,
                provider,
                intent,
                branch_group_id: branchGroupId,
                branch_ledger_digest: branchLedgerDigest,
                branch_count: normalized.length,
                parallel: normalized.length > 1,
            },
        };
    }

    const completed = normalized as NormalizedBranchSuccess[];
    const output = completed.map((entry) => entry.summary).join(' ');
    const artifacts = Array.from(new Set(completed.flatMap((entry) => entry.artifacts)));
    return {
        status: 'SUCCESS',
        output,
        metadata: {
            context_policy: 'project',
            delegated: true,
            parallel: completed.length > 1,
            branch_count: completed.length,
            provider,
            intent,
            branch_group_id: branchGroupId,
            branch_ledger_digest: branchLedgerDigest,
            research_artifacts: artifacts,
            research_payload: completed.length === 1 ? completed[0]?.parsed : undefined,
            research_branches: completed.map((entry) => ({
                question: entry.branchLabel,
                summary: entry.summary,
                research_artifacts: entry.artifacts,
            })),
        },
    };
}

function buildCritiqueActivationResult(
    normalized: NormalizedBranchResult[],
    provider: string | undefined,
    branchGroupId: string,
    branchLedgerDigest: Record<string, unknown> | undefined,
    beadTitle: unknown,
): {
    status: 'SUCCESS' | 'FAILURE';
    output: string;
    error?: string;
    metadata: Record<string, unknown>;
} {
    const failures = normalized.filter((entry) => entry.kind === 'failed');
    if (failures.length > 0) {
        const error = failures.map((entry) => entry.error).join(' | ');
        return {
            status: 'FAILURE',
            output: '',
            error,
            metadata: {
                context_policy: 'project',
                delegated: true,
                provider,
                bead_title: beadTitle,
                branch_group_id: branchGroupId,
                branch_ledger_digest: branchLedgerDigest,
                parallel: normalized.length > 1,
                branch_count: normalized.length,
            },
        };
    }

    const completed = normalized as NormalizedBranchSuccess[];
    const parsed = completed.length === 1
        ? completed[0]?.parsed
        : {
            needs_revision: completed.some((entry) => entry.parsed.needs_revision === true),
            critique: completed
                .map((entry) => entry.branchLabel ? `[${entry.branchLabel}] ${entry.summary}` : entry.summary)
                .join('\n'),
            evidence_source: completed
                .map((entry) => asString(entry.parsed.evidence_source))
                .filter((value): value is string => Boolean(value))
                .join(' | '),
            proposed_path: completed
                .map((entry) => asString(entry.parsed.proposed_path))
                .find((value): value is string => Boolean(value)),
            branches: completed.map((entry) => ({
                focus_area: entry.branchLabel,
                ...entry.parsed,
            })),
        };
    const output = asString(parsed.critique) ?? 'Critique complete.';
    return {
        status: 'SUCCESS',
        output,
        metadata: {
            context_policy: 'project',
            delegated: true,
            provider,
            bead_title: beadTitle,
            branch_group_id: branchGroupId,
            branch_ledger_digest: branchLedgerDigest,
            parallel: completed.length > 1,
            branch_count: completed.length,
            critique_payload: parsed,
        },
    };
}

export async function reconcileDelegatedWorkflowRequest(
    rootPath: string,
    request: HallOneMindRequestRecord,
    env: NodeJS.ProcessEnv = process.env,
): Promise<{ reconciled: boolean; activationId?: string; beadId?: string; finalStatus?: string }> {
    const workflowKind = getWorkflowKind(request);
    if (!workflowKind) {
        return { reconciled: false };
    }

    const activationId = asString(request.metadata?.activation_id);
    const branchGroupId = asString(request.metadata?.branch_group_id);
    if (!activationId || !branchGroupId) {
        throw new Error(`Delegated workflow request '${request.request_id}' is missing activation_id or branch_group_id metadata.`);
    }

    const activation = getHallSkillActivation(activationId, rootPath);
    if (!activation) {
        throw new Error(`Unable to resolve Hall skill activation '${activationId}' for delegated workflow reconciliation.`);
    }

    const relatedRequests = listHallOneMindRequests(rootPath)
        .filter((entry) => asString(entry.metadata?.activation_id) === activationId)
        .filter((entry) => asString(entry.metadata?.branch_group_id) === branchGroupId)
        .sort((left, right) => Number(left.metadata?.branch_index ?? 0) - Number(right.metadata?.branch_index ?? 0));

    if (relatedRequests.length === 0) {
        throw new Error(`No Hall One Mind requests were found for activation '${activationId}' and branch group '${branchGroupId}'.`);
    }

    const normalizedCurrent = normalizeBranchResult(request, workflowKind);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    persistBranchRecord(rootPath, repoId, workflowKind, request, normalizedCurrent);

    if (!relatedRequests.every((entry) => isTerminalStatus(entry.request_status))) {
        return {
            reconciled: false,
            activationId,
            beadId: activation.bead_id,
        };
    }

    const normalized = relatedRequests.map((entry) => {
        const branch = normalizeBranchResult(entry, workflowKind);
        persistBranchRecord(rootPath, repoId, workflowKind, entry, branch);
        return branch;
    });

    const provider = asString(request.metadata?.provider)
        ?? normalized.map((entry) => entry.provider).find((value): value is string => Boolean(value));
    const branchLedgerDigest = summarizeHallOneMindBranches(rootPath, {
        branchGroupId,
        traceId: asString(request.metadata?.trace_id),
        sessionId: asString(request.metadata?.session_id),
    }) as Record<string, unknown> | null;
    const result = workflowKind === 'research'
        ? buildResearchActivationResult(
            normalized,
            provider,
            branchGroupId,
            branchLedgerDigest ?? undefined,
            asString(request.metadata?.intent),
        )
        : buildCritiqueActivationResult(
            normalized,
            provider,
            branchGroupId,
            branchLedgerDigest ?? undefined,
            activation.intent,
        );

    const beadId = activation.bead_id;
    const reaper = new OrchestratorReaper(rootPath);
    const finalStatus = beadId
        ? await reaper.mapOutcome(beadId, {
            exitCode: result.status === 'SUCCESS' ? 0 : 1,
            stdout: result.output,
            stderr: result.error ?? '',
            timedOut: false,
        })
        : undefined;

    const now = Date.now();
    saveHallSkillActivation({
        ...activation,
        status: result.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
        result_summary: result.output || undefined,
        error_text: result.error,
        updated_at: now,
        completed_at: now,
        metadata: {
            ...(activation.metadata ?? {}),
            dispatch_status: result.status,
            result_weave_id: workflowKind === 'research' ? 'weave:research' : 'weave:critique',
            result_metadata: {
                ...result.metadata,
                final_bead_status: finalStatus,
            },
            async_completion_mode: 'one-mind-broker',
            async_reconciled_at: now,
            async_request_ids: relatedRequests.map((entry) => entry.request_id),
            async_branch_group_id: branchGroupId,
        },
    });

    if (finalStatus === 'READY_FOR_REVIEW') {
        const bead = beadId ? getHallBead(beadId) : null;
        const beadIntent = bead?.rationale?.trim() || activation.intent;
        if (beadId && beadIntent) {
            await engraveReadyForReviewMemory({
                bead_id: beadId,
                bead_intent: beadIntent,
                project_root: rootPath,
                cwd: rootPath,
                target_paths: bead?.target_path ? [bead.target_path] : (activation.target_path ? [activation.target_path] : []),
                context: {
                    mission_id: asString(request.metadata?.mission_id) ?? `MISSION-RECONCILE-${activationId}`,
                    bead_id: activationId,
                    trace_id: asString(request.metadata?.trace_id) ?? branchGroupId,
                    persona: 'ALFRED',
                    workspace_root: rootPath,
                    operator_mode: 'subkernel',
                    target_domain: 'brain',
                    interactive: false,
                    session_id: asString(request.metadata?.session_id),
                    env,
                    timestamp: now,
                },
                session_id: asString(request.metadata?.session_id),
                target_domain: 'brain',
            });
        }
    }

    return {
        reconciled: true,
        activationId,
        beadId,
        finalStatus,
    };
}
