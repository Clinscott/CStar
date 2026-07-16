import chalk from 'chalk';

import type { RuntimeAuguryContract, WeaveResult } from '../runtime/contracts.js';

let lastTraceLine: string | null = null;
let lastNoteLine: string | null = null;

function compactText(value: string, limit: number = 180): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function shouldEmitLine(kind: 'trace' | 'note', line: string): boolean {
    if (kind === 'trace') {
        if (lastTraceLine === line) return false;
        lastTraceLine = line;
        return true;
    }
    if (lastNoteLine === line) return false;
    lastNoteLine = line;
    return true;
}

function getRuntimeAuguryContract(result: WeaveResult): RuntimeAuguryContract | undefined {
    const contract = result.metadata?.augury_contract ?? result.metadata?.trace_contract;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return undefined;

    const normalized = contract as Record<string, unknown>;
    const councilExpert = normalized.council_expert
        && typeof normalized.council_expert === 'object'
        && !Array.isArray(normalized.council_expert)
        ? normalized.council_expert as RuntimeAuguryContract['council_expert']
        : undefined;
    return {
        intent_category: typeof normalized.intent_category === 'string' ? normalized.intent_category : undefined,
        intent: typeof normalized.intent === 'string' ? normalized.intent : undefined,
        selection_tier: typeof normalized.selection_tier === 'string' ? normalized.selection_tier : undefined,
        selection_name: typeof normalized.selection_name === 'string' ? normalized.selection_name : undefined,
        trajectory_status: typeof normalized.trajectory_status === 'string' ? normalized.trajectory_status : undefined,
        trajectory_reason: typeof normalized.trajectory_reason === 'string' ? normalized.trajectory_reason : undefined,
        mimirs_well: Array.isArray(normalized.mimirs_well)
            ? normalized.mimirs_well.filter((entry): entry is string => typeof entry === 'string')
            : [],
        gungnir_verdict: typeof normalized.gungnir_verdict === 'string' ? normalized.gungnir_verdict : undefined,
        body: typeof normalized.body === 'string' ? normalized.body : undefined,
        canonical_intent: typeof normalized.canonical_intent === 'string' ? normalized.canonical_intent : undefined,
        council_expert: councilExpert,
    };
}

function buildRuntimeAuguryLine(result: WeaveResult): string | undefined {
    const contract = getRuntimeAuguryContract(result);
    const designation = contract?.selection_tier && contract.selection_name
        ? `${contract.selection_tier}: ${contract.selection_name}`
        : contract?.selection_name;
    if (!contract || !designation) return undefined;

    const focus = compactText(
        contract.canonical_intent ?? contract.intent ?? result.output ?? result.error ?? 'Runtime result.',
        120,
    );
    const category = contract.intent_category ? ` | ${contract.intent_category}` : '';
    const expert = contract.council_expert?.label ? ` | expert=${contract.council_expert.label}` : '';
    return `augury=${result.status} | ${designation}${category}${expert} | ${focus}`;
}

function buildPlanningLine(result: WeaveResult): string | undefined {
    const sessionId = [
        result.metadata?.planning_session_id,
        result.metadata?.replan_planning_session_id,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (!sessionId) return undefined;
    const status = typeof result.metadata?.planning_status === 'string'
        ? result.metadata.planning_status.trim()
        : 'planning';
    return `handoff=${status || 'planning'} | ${sessionId.trim()}`;
}

export function resetCommandContextDedupe(): void {
    lastTraceLine = null;
    lastNoteLine = null;
}

export function shouldProjectOperationalContext(result: WeaveResult): boolean {
    const policy = typeof result.metadata?.context_policy === 'string'
        ? result.metadata.context_policy.trim().toLowerCase()
        : undefined;
    if (policy === 'silent') return false;
    if (policy === 'project') return true;
    return Boolean(
        (typeof result.metadata?.planning_session_id === 'string' && result.metadata.planning_session_id.trim())
        || (typeof result.metadata?.replan_planning_session_id === 'string' && result.metadata.replan_planning_session_id.trim())
        || (typeof result.metadata?.notes === 'string' && result.metadata.notes.trim())
        || getRuntimeAuguryContract(result),
    );
}

/** Output-only compatibility renderer. It never reads or writes Hall/state. */
export function renderStandardCommandResult(result: WeaveResult, workspaceRoot: string): boolean {
    if (result.status === 'FAILURE') {
        console.error(chalk.red(`\n[SYSTEM FAILURE]: ${result.error ?? 'Unknown runtime failure.'}`));
        return false;
    }
    const printer = result.status === 'TRANSITIONAL' ? chalk.yellow : chalk.green;
    console.log(printer(`\n[CSTAR]: "${result.output}"`));
    renderOperationalContext(result, workspaceRoot);
    return true;
}

/** Project result metadata to stdout only; workspaceRoot is compatibility data. */
export function renderOperationalContext(result: WeaveResult, _workspaceRoot: string): void {
    if (!shouldProjectOperationalContext(result)) return;

    const traceLine = buildPlanningLine(result) ?? buildRuntimeAuguryLine(result);
    if (traceLine && shouldEmitLine('trace', traceLine)) console.log(chalk.dim(traceLine));

    const note = typeof result.metadata?.notes === 'string' && result.metadata.notes.trim()
        ? compactText(result.metadata.notes)
        : undefined;
    if (note) {
        const noteLine = `note=${note}`;
        if (shouldEmitLine('note', noteLine)) console.log(chalk.dim(noteLine));
    }
}
