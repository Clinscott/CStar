import chalk from 'chalk';

import type { RuntimeTraceContract, WeaveResult } from '../runtime/contracts.js';
import { getHallBead, saveHallPlanningSession, upsertHallBead } from '../../../tools/pennyone/intel/database.js';
import type { HallPlanningSessionRecord } from '../../../types/hall.js';
import { buildResultPlanningSummary, resolveResultPlanningSession } from '../operator_resume.js';

let lastTraceLine: string | null = null;
let lastNoteLine: string | null = null;

function compactText(value: string, limit: number = 180): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function shouldEmitLine(kind: 'trace' | 'note', line: string): boolean {
    if (kind === 'trace') {
        if (lastTraceLine === line) {
            return false;
        }
        lastTraceLine = line;
        return true;
    }

    if (lastNoteLine === line) {
        return false;
    }
    lastNoteLine = line;
    return true;
}

function getPersistedHostContextValue(
    session: HallPlanningSessionRecord | null,
    kind: 'trace' | 'note',
): string | undefined {
    const context = session?.metadata?.host_cli_context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return undefined;
    }

    const key = kind === 'trace' ? 'trace_line' : 'note_line';
    const value = (context as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getPersistedBeadContextValue(
    beadId: string | undefined,
    kind: 'trace' | 'note',
): string | undefined {
    if (!beadId) {
        return undefined;
    }

    const bead = getHallBead(beadId);
    const context = bead?.metadata?.host_cli_context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return undefined;
    }

    const key = kind === 'trace' ? 'trace_line' : 'note_line';
    const value = (context as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function persistHostContextValue(
    session: HallPlanningSessionRecord | null,
    kind: 'trace' | 'note',
    line: string,
): HallPlanningSessionRecord | null {
    if (!session) {
        return session;
    }

    const existing = session.metadata?.host_cli_context;
    const metadataContext = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    metadataContext[kind === 'trace' ? 'trace_line' : 'note_line'] = line;
    metadataContext.updated_at = Date.now();

    const nextSession: HallPlanningSessionRecord = {
        ...session,
        updated_at: Date.now(),
        metadata: {
            ...(session.metadata ?? {}),
            host_cli_context: metadataContext,
        },
    };
    saveHallPlanningSession(nextSession);
    return nextSession;
}

function persistBeadContextValue(
    beadId: string | undefined,
    kind: 'trace' | 'note',
    line: string,
): void {
    if (!beadId) {
        return;
    }

    const bead = getHallBead(beadId);
    if (!bead) {
        return;
    }

    const existing = bead.metadata?.host_cli_context;
    const metadataContext = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    metadataContext[kind === 'trace' ? 'trace_line' : 'note_line'] = line;
    metadataContext.updated_at = Date.now();

    upsertHallBead({
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: bead.status,
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: bead.resolved_validation_id,
        superseded_by: bead.superseded_by,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        metadata: {
            ...(bead.metadata ?? {}),
            host_cli_context: metadataContext,
        },
        created_at: bead.created_at,
        updated_at: Date.now(),
    });
}

function getRuntimeTraceContract(result: WeaveResult): RuntimeTraceContract | undefined {
    const contract = result.metadata?.trace_contract;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
        return undefined;
    }

    const normalized = contract as Record<string, unknown>;
    return {
        intent_category: typeof normalized.intent_category === 'string' ? normalized.intent_category : undefined,
        intent: typeof normalized.intent === 'string' ? normalized.intent : undefined,
        selection_tier: typeof normalized.selection_tier === 'string' ? normalized.selection_tier : undefined,
        selection_name: typeof normalized.selection_name === 'string' ? normalized.selection_name : undefined,
        trajectory_status: typeof normalized.trajectory_status === 'string' ? normalized.trajectory_status : undefined,
        trajectory_reason: typeof normalized.trajectory_reason === 'string' ? normalized.trajectory_reason : undefined,
        mimirs_well: Array.isArray(normalized.mimirs_well)
            ? normalized.mimirs_well.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : [],
        gungnir_verdict: typeof normalized.gungnir_verdict === 'string' ? normalized.gungnir_verdict : undefined,
        confidence: typeof normalized.confidence === 'number' ? normalized.confidence : undefined,
        body: typeof normalized.body === 'string' ? normalized.body : undefined,
        canonical_intent: typeof normalized.canonical_intent === 'string' ? normalized.canonical_intent : undefined,
    };
}

function formatDesignation(contract: RuntimeTraceContract | undefined): string | undefined {
    if (!contract) {
        return undefined;
    }
    if (contract.selection_tier && contract.selection_name) {
        return `${contract.selection_tier}: ${contract.selection_name}`;
    }
    return contract.selection_name;
}

function buildRuntimeTraceLine(result: WeaveResult): string | undefined {
    const contract = getRuntimeTraceContract(result);
    const designation = formatDesignation(contract);
    if (!designation) {
        return undefined;
    }

    const focus = compactText(
        contract.canonical_intent
        ?? contract.intent
        ?? result.output
        ?? result.error
        ?? 'Runtime execution designated.',
        120,
    );
    const category = contract.intent_category ? ` | ${contract.intent_category}` : '';
    return `trace=${result.status} | ${designation}${category} | ${focus}`;
}

function getRuntimeContextBeadId(result: WeaveResult): string | undefined {
    const executionBeadId = typeof result.metadata?.execution_bead_id === 'string' && result.metadata.execution_bead_id.trim()
        ? result.metadata.execution_bead_id.trim()
        : undefined;
    if (executionBeadId) {
        return executionBeadId;
    }

    return typeof result.metadata?.mission_bead_id === 'string' && result.metadata.mission_bead_id.trim()
        ? result.metadata.mission_bead_id.trim()
        : undefined;
}

export function resetCommandContextDedupe(): void {
    lastTraceLine = null;
    lastNoteLine = null;
}

export function shouldProjectOperationalContext(result: WeaveResult): boolean {
    const explicitPolicy = typeof result.metadata?.context_policy === 'string'
        ? result.metadata.context_policy.trim().toLowerCase()
        : undefined;
    if (explicitPolicy === 'silent') {
        return false;
    }
    if (explicitPolicy === 'project') {
        return true;
    }

    if (typeof result.metadata?.planning_session_id === 'string' && result.metadata.planning_session_id.trim()) {
        return true;
    }
    if (typeof result.metadata?.replan_planning_session_id === 'string' && result.metadata.replan_planning_session_id.trim()) {
        return true;
    }
    if (typeof result.metadata?.notes === 'string' && result.metadata.notes.trim()) {
        return true;
    }
    if (getRuntimeTraceContract(result)) {
        return true;
    }
    return false;
}

export function renderStandardCommandResult(result: WeaveResult, workspaceRoot: string): boolean {
    if (result.status === 'FAILURE') {
        console.error(chalk.red(`\n[SYSTEM FAILURE]: ${result.error ?? 'Unknown runtime failure.'}`));
        return false;
    }

    const printer = result.status === 'TRANSITIONAL' ? chalk.yellow : chalk.green;
    console.log(printer(`\n[ALFRED]: "${result.output}"`));
    renderOperationalContext(result, workspaceRoot);
    return true;
}

export function renderOperationalContext(result: WeaveResult, workspaceRoot: string): void {
    if (!shouldProjectOperationalContext(result)) {
        return;
    }
    let planningSession = resolveResultPlanningSession(workspaceRoot, result);
    const planningSummary = buildResultPlanningSummary(workspaceRoot, result);
    const runtimeBeadId = getRuntimeContextBeadId(result);
    const traceLine = planningSummary
        ? `trace=${planningSummary}`
        : buildRuntimeTraceLine(result);
    if (traceLine) {
        const persistedTraceLine = planningSession
            ? getPersistedHostContextValue(planningSession, 'trace')
            : getPersistedBeadContextValue(runtimeBeadId, 'trace');
        if (persistedTraceLine !== traceLine && shouldEmitLine('trace', traceLine)) {
            console.log(chalk.dim(traceLine));
            if (planningSession) {
                planningSession = persistHostContextValue(planningSession, 'trace', traceLine);
            } else {
                persistBeadContextValue(runtimeBeadId, 'trace', traceLine);
            }
        }
    }

    const note = typeof result.metadata?.notes === 'string' && result.metadata.notes.trim()
        ? compactText(result.metadata.notes)
        : undefined;
    if (note) {
        const noteLine = `note=${note}`;
        const persistedNoteLine = planningSession
            ? getPersistedHostContextValue(planningSession, 'note')
            : getPersistedBeadContextValue(runtimeBeadId, 'note');
        if (persistedNoteLine !== noteLine && shouldEmitLine('note', noteLine)) {
            console.log(chalk.dim(noteLine));
            if (planningSession) {
                planningSession = persistHostContextValue(planningSession, 'note', noteLine);
            } else {
                persistBeadContextValue(runtimeBeadId, 'note', noteLine);
            }
        }
    }
}
