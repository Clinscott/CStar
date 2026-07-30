import type { HallOneMindRequestRecord } from '../../../../types/hall.js';
import { extractJsonObject } from '../weaves/host_bridge.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../reaper.js';

export type DelegatedWorkflowKind = 'research' | 'critique';

interface CompletedBranch {
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

interface FailedBranch {
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

export type NormalizedDelegatedBranch = CompletedBranch | FailedBranch;

export function asDelegatedString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

export function isTerminalDelegatedStatus(status: HallOneMindRequestRecord['request_status']): boolean {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

export function delegatedWorkflowKind(request: HallOneMindRequestRecord): DelegatedWorkflowKind | null {
    const runtimeWeave = asDelegatedString(request.metadata?.runtime_weave);
    if (runtimeWeave === 'weave:research') return 'research';
    if (runtimeWeave === 'weave:critique') return 'critique';
    return null;
}

function branchBase(request: HallOneMindRequestRecord) {
    return {
        request,
        branchId: asDelegatedString(request.metadata?.branch_id) ?? request.request_id,
        branchGroupId: asDelegatedString(request.metadata?.branch_group_id) ?? request.request_id,
        branchIndex: Number(request.metadata?.branch_index ?? 0),
        branchLabel: asDelegatedString(request.metadata?.branch_label) ?? request.request_id,
        provider: asDelegatedString(request.metadata?.provider),
        traceId: asDelegatedString(request.metadata?.trace_id),
        sessionId: asDelegatedString(request.metadata?.session_id),
    };
}

function executionMetadata(request: HallOneMindRequestRecord): Record<string, unknown> {
    return {
        mission_id: request.metadata?.mission_id ?? null,
        trace_id: request.metadata?.trace_id ?? null,
        session_id: request.metadata?.session_id ?? null,
        execution_boundary: 'subagent',
        subagent_profile: request.metadata?.subagent_profile ?? null,
        delegation_status: request.metadata?.delegation_status ?? request.request_status.toLowerCase(),
        handle_id: request.metadata?.handle_id ?? null,
        execution_surface: request.metadata?.execution_surface ?? null,
        delegation_mode: request.metadata?.delegation_mode ?? null,
    };
}

export function normalizeDelegatedBranch(
    request: HallOneMindRequestRecord,
    workflowKind: DelegatedWorkflowKind,
): NormalizedDelegatedBranch {
    const base = branchBase(request);
    if (request.request_status !== 'COMPLETED') {
        const fallback = request.request_status === 'CANCELLED' ? 'cancelled' : 'failed';
        return {
            kind: 'failed',
            ...base,
            error: asDelegatedString(request.error_text) ?? `Delegated request '${request.request_id}' ${fallback}.`,
            metadata: executionMetadata(request),
        };
    }

    const rawText = asDelegatedString(request.response_text);
    if (!rawText) throw new Error(`Delegated ${workflowKind} request '${request.request_id}' completed without response_text.`);
    const parsed = extractJsonObject(rawText) as Record<string, unknown>;
    if (workflowKind === 'research') {
        const summary = asDelegatedString(parsed.summary);
        if (!summary) throw new Error(`Delegated research request '${request.request_id}' must include a non-empty summary string.`);
        return {
            kind: 'completed',
            ...base,
            branchLabel: asDelegatedString(request.metadata?.branch_label)
                ?? asDelegatedString(request.metadata?.intent)
                ?? 'research',
            summary,
            artifacts: stringArray(parsed.research_artifacts),
            parsed,
            metadata: {
                ...executionMetadata(request),
                intent: request.metadata?.intent ?? null,
                branch_count: Number(request.metadata?.branch_count ?? 1),
            },
        };
    }

    const summary = asDelegatedString(parsed.critique) ?? 'Critique branch completed.';
    return {
        kind: 'completed',
        ...base,
        branchLabel: asDelegatedString(request.metadata?.branch_label) ?? 'full-critique',
        summary,
        artifacts: [],
        parsed,
        metadata: {
            ...executionMetadata(request),
            branch_count: Number(request.metadata?.branch_count ?? 1),
            needs_revision: parsed.needs_revision === true,
            evidence_source: asDelegatedString(parsed.evidence_source) ?? null,
            proposed_path: asDelegatedString(parsed.proposed_path) ?? null,
            runtime_weave: request.metadata?.runtime_weave ?? 'weave:critique',
            branch_group_id: request.metadata?.branch_group_id ?? null,
            branch_index: Number(request.metadata?.branch_index ?? 0),
        },
    };
}

export function persistDelegatedBranch(input: {
    rootPath: string;
    repoId: string;
    workflowKind: DelegatedWorkflowKind;
    request: HallOneMindRequestRecord;
    normalized: NormalizedDelegatedBranch;
}): void {
    void input;
    throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
}

export function buildDelegatedActivationResult(input: {
    workflowKind: DelegatedWorkflowKind;
    normalized: NormalizedDelegatedBranch[];
    provider?: string;
    branchGroupId: string;
    branchLedgerDigest?: Record<string, unknown>;
    intent?: string;
}) {
    const { workflowKind, normalized, provider, branchGroupId, branchLedgerDigest, intent } = input;
    const failures = normalized.filter((entry): entry is FailedBranch => entry.kind === 'failed');
    const common = {
        context_policy: 'project',
        delegated: true,
        provider,
        branch_group_id: branchGroupId,
        branch_ledger_digest: branchLedgerDigest,
        branch_count: normalized.length,
        parallel: normalized.length > 1,
    };
    if (failures.length > 0) {
        return {
            status: 'FAILURE' as const,
            output: '',
            error: failures.map((entry) => entry.error).join(' | '),
            metadata: { ...common, intent },
        };
    }

    const completed = normalized as CompletedBranch[];
    if (workflowKind === 'research') {
        return {
            status: 'SUCCESS' as const,
            output: completed.map((entry) => entry.summary).join(' '),
            error: undefined,
            metadata: {
                ...common,
                intent,
                research_artifacts: Array.from(new Set(completed.flatMap((entry) => entry.artifacts))),
                research_payload: completed.length === 1 ? completed[0]?.parsed : undefined,
                research_branches: completed.map((entry) => ({
                    question: entry.branchLabel,
                    summary: entry.summary,
                    research_artifacts: entry.artifacts,
                })),
            },
        };
    }

    const parsed = completed.length === 1
        ? completed[0]!.parsed
        : {
            needs_revision: completed.some((entry) => entry.parsed.needs_revision === true),
            critique: completed.map((entry) => `[${entry.branchLabel}] ${entry.summary}`).join('\n'),
            evidence_source: completed
                .map((entry) => asDelegatedString(entry.parsed.evidence_source))
                .filter((value): value is string => Boolean(value))
                .join(' | '),
            proposed_path: completed
                .map((entry) => asDelegatedString(entry.parsed.proposed_path))
                .find((value): value is string => Boolean(value)),
            branches: completed.map((entry) => ({ focus_area: entry.branchLabel, ...entry.parsed })),
        };
    return {
        status: 'SUCCESS' as const,
        output: asDelegatedString(parsed.critique) ?? 'Critique complete.',
        error: undefined,
        metadata: { ...common, bead_title: intent, critique_payload: parsed },
    };
}
