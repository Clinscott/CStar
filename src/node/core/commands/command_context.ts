import chalk from 'chalk';

import type { WeaveResult } from '../runtime/contracts.js';
import { saveHallPlanningSession } from '../../../tools/pennyone/intel/database.js';
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
    if (planningSummary) {
        const traceLine = `trace=${planningSummary}`;
        const persistedTraceLine = getPersistedHostContextValue(planningSession, 'trace');
        if (persistedTraceLine !== traceLine && shouldEmitLine('trace', traceLine)) {
            console.log(chalk.dim(traceLine));
            planningSession = persistHostContextValue(planningSession, 'trace', traceLine);
        }
    }

    const note = typeof result.metadata?.notes === 'string' && result.metadata.notes.trim()
        ? compactText(result.metadata.notes)
        : undefined;
    if (note) {
        const noteLine = `note=${note}`;
        const persistedNoteLine = getPersistedHostContextValue(planningSession, 'note');
        if (persistedNoteLine !== noteLine && shouldEmitLine('note', noteLine)) {
            console.log(chalk.dim(noteLine));
            planningSession = persistHostContextValue(planningSession, 'note', noteLine);
        }
    }
}
