import { Command } from 'commander';
import chalk from 'chalk';

import { getHallBeads, listHallPlanningSessions } from '../../../tools/pennyone/intel/database.js';
import type { HallOneMindBranchDigest, HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../types/hall.js';
import { compactPlanningHandle, formatPlanningDigestBadge } from '../operator_resume.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';

const ACTIVE_PLANNING_STATUSES: HallPlanningSessionStatus[] = [
    'INTENT_RECEIVED',
    'RESEARCH_PHASE',
    'PROPOSAL_REVIEW',
    'BEAD_CRITIQUE_LOOP',
    'BEAD_USER_REVIEW',
    'PLAN_CONCRETE',
    'FORGE_EXECUTION',
    'NEEDS_INPUT',
    'PLAN_READY',
    'ROUTED',
];

function getPlanningBranchDigest(session: HallPlanningSessionRecord): HallOneMindBranchDigest | undefined {
    const digest = session.metadata?.branch_ledger_digest;
    if (!digest || typeof digest !== 'object' || Array.isArray(digest)) {
        return undefined;
    }

    const normalized = digest as HallOneMindBranchDigest;
    if (!Array.isArray(normalized.groups) || typeof normalized.total_branches !== 'number') {
        return undefined;
    }

    return normalized;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function resolveActivePlanningSession(rootPath: string): HallPlanningSessionRecord | null {
    const active = listHallPlanningSessions(rootPath, { statuses: ACTIVE_PLANNING_STATUSES });
    return active[0] ?? listHallPlanningSessions(rootPath)[0] ?? null;
}

export function summarizeSessionBeads(rootPath: string, session: HallPlanningSessionRecord): {
    total: number;
    set: number;
    open: number;
    review: number;
} {
    const beadIds = new Set(asStringArray(session.metadata?.bead_ids));
    if (beadIds.size === 0) {
        return { total: 0, set: 0, open: 0, review: 0 };
    }

    const beads = getHallBeads(rootPath).filter((bead) => beadIds.has(bead.id));
    return {
        total: beads.length,
        set: beads.filter((bead) => bead.status === 'SET').length,
        open: beads.filter((bead) => bead.status === 'OPEN' || bead.status === 'SET-PENDING').length,
        review: beads.filter((bead) => bead.status === 'READY_FOR_REVIEW').length,
    };
}

export interface TraceStatusPayload {
    trace_id?: string;
    session_id?: string;
    handle?: string;
    status: string;
    focus?: string;
    digest_badge?: string;
    bead_summary: {
        total: number;
        set: number;
        open: number;
        review: number;
    };
    artifacts: string[];
    branches: Array<{
        kind: string;
        count: number;
        needs_revision: boolean;
        labels: string[];
        summary?: string;
        artifacts: string[];
        evidence_sources: string[];
        proposed_paths: string[];
    }>;
}

export function buildTraceStatusPayload(session: HallPlanningSessionRecord | null, rootPath: string): TraceStatusPayload | null {
    if (!session) {
        return null;
    }

    const digest = getPlanningBranchDigest(session);
    return {
        trace_id: typeof session.metadata?.trace_id === 'string' && session.metadata.trace_id.trim()
            ? session.metadata.trace_id.trim()
            : undefined,
        session_id: session.session_id,
        handle: compactPlanningHandle(session),
        status: session.status,
        focus: session.latest_question ?? session.summary ?? session.normalized_intent,
        digest_badge: formatPlanningDigestBadge(session),
        bead_summary: summarizeSessionBeads(rootPath, session),
        artifacts: digest?.artifacts ?? [],
        branches: (digest?.groups ?? []).map((group) => ({
            kind: group.branch_kind,
            count: group.branch_count,
            needs_revision: group.needs_revision,
            labels: [...group.branch_labels],
            summary: group.summary,
            artifacts: [...group.artifacts],
            evidence_sources: [...group.evidence_sources],
            proposed_paths: [...group.proposed_paths],
        })),
    };
}

export function renderTraceStatusLines(session: HallPlanningSessionRecord | null, rootPath: string): string[] {
    if (!session) {
        return [chalk.dim('trace=none')];
    }

    const digest = getPlanningBranchDigest(session);
    const digestBadge = formatPlanningDigestBadge(session);
    const focus = session.latest_question ?? session.summary ?? session.normalized_intent;
    const beadSummary = summarizeSessionBeads(rootPath, session);
    const lines = [
        chalk.cyan(`[TRACE] ${session.status} ${compactPlanningHandle(session)}`),
        chalk.dim(`focus=${focus}`),
    ];

    if (digestBadge) {
        lines.push(chalk.dim(`digest=${digestBadge}`));
    }

    lines.push(chalk.dim(`beads total=${beadSummary.total} set=${beadSummary.set} open=${beadSummary.open} review=${beadSummary.review}`));

    if (digest?.artifacts.length) {
        lines.push(chalk.dim(`artifacts=${digest.artifacts.slice(0, 4).join(', ')}`));
    }

    for (const group of digest?.groups.slice(0, 4) ?? []) {
        const labels = group.branch_labels.slice(0, 3).join(', ');
        lines.push(chalk.dim(
            `branch ${group.branch_kind} x${group.branch_count}${group.needs_revision ? ' rev' : ''}${labels ? ` labels=${labels}` : ''}`,
        ));
    }

    return lines;
}

export function registerTraceCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('trace')
        .description('Inspect the active Hall-backed planning trace');

    command
        .command('status')
        .description('Show the active planning trace summary from Hall')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const session = resolveActivePlanningSession(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(buildTraceStatusPayload(session, rootPath), null, 2)}\n`);
                return;
            }
            for (const line of renderTraceStatusLines(session, rootPath)) {
                console.log(line);
            }
        });
}
