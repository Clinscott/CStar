import chalk from 'chalk';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { StateRegistry, type SovereignState } from  '../state.js';
import { HUD } from  '../hud.js';
import {
    getHallPlanningSession,
    getHallBeads,
    getHallSummary,
    listHallPlanningSessions,
    listHallSkillProposals,
} from '../../../tools/pennyone/intel/database.ts';
import { registry } from  '../../../tools/pennyone/pathRegistry.js';
import type { SovereignBead } from  '../../../types/bead.js';
import type {
    HallPlanningSessionRecord,
    HallRepositorySummary,
    HallSkillProposalRecord,
} from '../../../types/hall.ts';
import { buildChantInvocation, buildDynamicCommandInvocation } from  '../commands/dispatcher.js';
import type { RuntimeDispatchPort } from  '../runtime/contracts.js';
import {
    compactPlanningHandle,
    formatPlanningDigestBadge,
    resumeHostGovernorIfAvailable,
    type OperatorResumeResult,
} from  '../operator_resume.js';

type OperatorEventLevel = 'INFO' | 'WARN' | 'FAIL' | 'PASS';

export interface OperatorEvent {
    at: number;
    level: OperatorEventLevel;
    message: string;
    detail?: string;
}

export interface OperatorSnapshot {
    workspaceRoot: string;
    state: SovereignState;
    hallSummary: HallRepositorySummary | null;
    beads: SovereignBead[];
    planningSessions: HallPlanningSessionRecord[];
    proposals: HallSkillProposalRecord[];
    events: OperatorEvent[];
}

const KNOWN_DIRECT_COMMANDS = new Set([
    'chant',
    'evolve',
    'forge',
    'pennyone',
    'ravens',
    'start',
]);

function pushEvent(
    events: OperatorEvent[],
    level: OperatorEventLevel,
    message: string,
    detail?: string,
): OperatorEvent[] {
    return [...events, { at: Date.now(), level, message, detail }].slice(-10);
}

function appendResumeEvents(events: OperatorEvent[], resumeResult: OperatorResumeResult): OperatorEvent[] {
    if (!resumeResult.resumed) {
        return events;
    }

    if (resumeResult.governorResult?.status === 'FAILURE') {
        return pushEvent(
            events,
            'FAIL',
            'Host governor resume failed.',
            resumeResult.governorResult.error ?? resumeResult.provider ?? 'unknown',
        );
    }

    let next = pushEvent(
        events,
        'PASS',
        'Host governor synchronized.',
        resumeResult.provider ?? 'host',
    );
    if (resumeResult.planningSummary) {
        next = pushEvent(next, 'INFO', 'Planning trace.', resumeResult.planningSummary);
    }
    if (resumeResult.governorResult?.output?.trim()) {
        next = pushEvent(next, 'INFO', 'Governor summary.', resumeResult.governorResult.output.trim());
    }
    return next;
}

function truncate(value: string, length: number): string {
    if (value.length <= length) {
        return value;
    }
    return `${value.slice(0, Math.max(0, length - 1))}…`;
}

function formatTimestamp(timestamp?: number): string {
    if (!timestamp) {
        return 'never';
    }
    return new Date(timestamp).toLocaleString();
}

function formatEvent(event: OperatorEvent): string {
    const level =
        event.level === 'FAIL'
            ? chalk.red(event.level)
            : event.level === 'WARN'
                ? chalk.yellow(event.level)
                : event.level === 'PASS'
                    ? chalk.green(event.level)
                    : chalk.cyan(event.level);
    const ts = new Date(event.at).toLocaleTimeString();
    return `${chalk.dim(`[${ts}]`)} ${level} ${event.message}${event.detail ? ` ${chalk.dim(event.detail)}` : ''}`;
}

function formatBead(bead: SovereignBead): string {
    const target = bead.target_ref ?? bead.target_path ?? bead.rationale;
    return truncate(`[${bead.status}] ${bead.id} :: ${target}`, 88);
}

function formatProposal(proposal: HallSkillProposalRecord): string {
    const focus = proposal.summary ?? proposal.target_path ?? proposal.contract_path ?? proposal.skill_id;
    return truncate(`[${proposal.status}] ${proposal.skill_id} :: ${focus}`, 88);
}

function formatPlanningSession(session: HallPlanningSessionRecord): string {
    const focus = session.latest_question ?? session.summary ?? session.normalized_intent;
    const handle = compactPlanningHandle(session);
    const digestBadge = formatPlanningDigestBadge(session);
    return truncate(
        `[${session.status}] ${handle}${digestBadge ? ` {${digestBadge}}` : ''} :: ${focus}`,
        104,
    );
}

function formatPlanningStatusEvent(session: HallPlanningSessionRecord | null): string | undefined {
    if (!session) {
        return undefined;
    }

    const digestBadge = formatPlanningDigestBadge(session);
    const parts = [
        session.status,
        compactPlanningHandle(session),
        digestBadge,
    ].filter(Boolean);
    return parts.join(' | ');
}

function buildSeedEvents(workspaceRoot: string, hallSummary: HallRepositorySummary | null): OperatorEvent[] {
    const events: OperatorEvent[] = [
        {
            at: Date.now(),
            level: 'INFO',
            message: 'Operator matrix online.',
            detail: workspaceRoot,
        },
        {
            at: Date.now(),
            level: hallSummary ? 'PASS' : 'WARN',
            message: hallSummary ? 'Hall summary projected.' : 'Hall summary not found yet.',
            detail: hallSummary?.repo_id,
        },
        {
            at: Date.now(),
            level: 'INFO',
            message: 'Intent lane armed.',
            detail: "Type natural language or a direct command. 'exit' leaves the shell.",
        },
    ];
    return events;
}

export function shouldLaunchOperatorTui(
    argv: string[],
    interactive: boolean = Boolean(input.isTTY && output.isTTY),
): boolean {
    let explicitTui = false;
    let skipNext = false;
    for (const token of argv) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        if (token === '--help' || token === '-h' || token === '--version' || token === '-V' || token === '--silent') {
            return false;
        }
        if (token === '--root' || token === '-r') {
            skipNext = true;
            continue;
        }
        if (token === '--verbose' || token === '-v') {
            continue;
        }
        if (token.startsWith('--root=')) {
            continue;
        }
        if (!token.startsWith('-')) {
            explicitTui = token.toLowerCase() === 'tui';
            return explicitTui;
        }
    }

    return interactive && explicitTui;
}

export function readOperatorSnapshot(events: OperatorEvent[]): OperatorSnapshot {
    const workspaceRoot = registry.getRoot();
    const state = StateRegistry.get();
    const hallSummary = getHallSummary(workspaceRoot);
    const beads = getHallBeads(workspaceRoot).slice(0, 5);
    const planningSessions = listHallPlanningSessions(workspaceRoot).slice(0, 3);
    const proposals = listHallSkillProposals(workspaceRoot).slice(0, 3);

    return {
        workspaceRoot,
        state,
        hallSummary,
        beads,
        planningSessions,
        proposals,
        events,
    };
}

export function renderOperatorShell(snapshot: OperatorSnapshot): string {
    const state = snapshot.state.framework;
    const hall = snapshot.hallSummary;
    const spokes = snapshot.state.managed_spokes.length;
    const out: string[] = [];

    out.push(chalk.greenBright.bold('▓▒░ CORVUS STAR OPERATOR MATRIX ░▒▓'));
    out.push(chalk.dim('Top-lane command input. Live Hall state. No dead air.'));
    out.push(HUD.boxTop('◤ OPERATOR SHELL ◢'));
    out.push(HUD.boxRow('INTENT LANE', 'Natural language or direct command. Enter = refresh. exit = leave.', chalk.greenBright));
    out.push(HUD.boxSeparator());
    out.push(HUD.boxRow('WORKSPACE', snapshot.workspaceRoot, chalk.cyanBright));
    out.push(HUD.boxRow('STATUS', state.status, chalk.greenBright));
    out.push(HUD.boxRow('PERSONA', state.active_persona, chalk.magentaBright));
    out.push(HUD.boxRow('GUNGNIR', state.gungnir_score.toFixed(2), chalk.yellowBright));
    out.push(HUD.boxRow('INTEGRITY', `${state.intent_integrity.toFixed(1)}%`, chalk.greenBright));
    out.push(HUD.boxRow('SPOKES', String(spokes), chalk.blueBright));
    out.push(HUD.boxSeparator());
    out.push(HUD.boxRow('LAST SCAN', hall?.last_scan_id ?? 'none', chalk.blueBright));
    out.push(HUD.boxRow('LAST SCAN AT', formatTimestamp(hall?.last_scan_at), chalk.gray));
    out.push(HUD.boxRow('OPEN BEADS', String(hall?.open_beads ?? 0), chalk.yellowBright));
    out.push(HUD.boxRow('VALIDATIONS', String(hall?.validation_runs ?? 0), chalk.greenBright));
    out.push(HUD.boxRow('LAST VALIDATION', formatTimestamp(hall?.last_validation_at), chalk.gray));
    out.push(HUD.boxSeparator());

    if (snapshot.beads.length === 0) {
        out.push(HUD.boxRow('QUEUE', 'No active bead previews.', chalk.gray));
    } else {
        snapshot.beads.forEach((bead, index) => {
            out.push(HUD.boxRow(`BEAD ${index + 1}`, formatBead(bead), chalk.yellow));
        });
    }

    out.push(HUD.boxSeparator());

    if (snapshot.planningSessions.length === 0) {
        out.push(HUD.boxRow('PLANNING', 'No collaborative chant sessions in flight.', chalk.gray));
    } else {
        snapshot.planningSessions.forEach((session, index) => {
            out.push(HUD.boxRow(`PLAN ${index + 1}`, formatPlanningSession(session), chalk.cyanBright));
        });
    }

    out.push(HUD.boxSeparator());

    if (snapshot.proposals.length === 0) {
        out.push(HUD.boxRow('PROPOSALS', 'No live proposal previews.', chalk.gray));
    } else {
        snapshot.proposals.forEach((proposal, index) => {
            out.push(HUD.boxRow(`PROPOSAL ${index + 1}`, formatProposal(proposal), chalk.magentaBright));
        });
    }

    out.push(HUD.boxSeparator());
    snapshot.events.slice(-8).forEach((event, index) => {
        out.push(HUD.boxRow(`EVENT ${index + 1}`, formatEvent(event), undefined));
    });
    out.push(HUD.boxBottom());
    return out.join('');
}

async function dispatchOperatorInput(
    rawInput: string,
    dispatchPort: RuntimeDispatchPort,
    workspaceRoot: string,
    activePlanningSessionId?: string,
): Promise<{ events: OperatorEvent[]; exit?: boolean; planningSessionId?: string }> {
    const normalized = rawInput.trim();
    let events: OperatorEvent[] = [];

    if (!normalized) {
        events = pushEvent(events, 'INFO', 'Refresh requested.', workspaceRoot);
        return { events };
    }

    const lower = normalized.toLowerCase();
    if (lower === 'exit' || lower === 'quit') {
        events = pushEvent(events, 'PASS', 'Operator shell closing.');
        return { events, exit: true };
    }

    if (lower === 'clear') {
        events = pushEvent(events, 'INFO', 'Event crawl cleared.');
        return { events, planningSessionId: undefined };
    }

    if (lower === 'status' || lower === 'hall') {
        if (lower === 'status') {
            const resumeResult = await resumeHostGovernorIfAvailable(dispatchPort, {
                workspaceRoot,
                cwd: workspaceRoot,
                env: process.env,
                task: 'Resume host-governed operator status review.',
                source: 'cli',
            });
            events = appendResumeEvents(events, resumeResult);
        }
        events = pushEvent(events, 'PASS', 'Operator state refreshed.', lower);
        return { events, planningSessionId: activePlanningSessionId };
    }

    events = pushEvent(events, 'INFO', 'Intent received.', normalized);

    const [head, ...rest] = normalized.split(/\s+/);
    const isDirectCommand = KNOWN_DIRECT_COMMANDS.has(head.toLowerCase()) && head.toLowerCase() !== 'chant';
    const invocation = isDirectCommand
        ? buildDynamicCommandInvocation(head, rest, workspaceRoot, workspaceRoot)
        : buildChantInvocation(
            head.toLowerCase() === 'chant' ? rest : [normalized],
            workspaceRoot,
            workspaceRoot,
            activePlanningSessionId,
        );

    events = pushEvent(events, 'INFO', 'Dispatching weave.', invocation.weave_id);

    const result = await dispatchPort.dispatch(invocation);
    if (result.status === 'FAILURE') {
        events = pushEvent(events, 'FAIL', 'Dispatch failed.', result.error ?? result.weave_id);
        return { events, planningSessionId: activePlanningSessionId };
    }

    events = pushEvent(events, result.status === 'TRANSITIONAL' ? 'WARN' : 'PASS', 'Dispatch completed.', result.output);
    const planningSessionId = typeof result.metadata?.planning_session_id === 'string'
        ? result.metadata.planning_session_id
        : activePlanningSessionId;

    if (typeof result.metadata?.planning_status === 'string') {
        const session = planningSessionId ? getHallPlanningSession(planningSessionId) : null;
        events = pushEvent(
            events,
            'INFO',
            'Planning state updated.',
            formatPlanningStatusEvent(session) ?? String(result.metadata.planning_status),
        );
    }

    if (Array.isArray(result.metadata?.follow_up_questions)) {
        for (const question of result.metadata.follow_up_questions as unknown[]) {
            if (typeof question === 'string') {
                events = pushEvent(events, 'WARN', 'Chant follow-up.', question);
            }
        }
    }

    const metadataBits = [
        result.metadata?.proposal_id ? `proposal=${String(result.metadata.proposal_id)}` : null,
        result.metadata?.validation_id ? `validation=${String(result.metadata.validation_id)}` : null,
        Array.isArray(result.metadata?.emitted_beads)
            ? `beads=${String((result.metadata?.emitted_beads as unknown[]).length)}`
            : null,
        planningSessionId ? `session=${planningSessionId}` : null,
    ].filter(Boolean);

    if (metadataBits.length > 0) {
        events = pushEvent(events, 'INFO', 'Result metadata captured.', metadataBits.join(' '));
    }

    return { events, planningSessionId };
}

export async function runOperatorTui(dispatchPort: RuntimeDispatchPort): Promise<void> {
    const workspaceRoot = registry.getRoot();
    const resumeResult = await resumeHostGovernorIfAvailable(dispatchPort, {
        workspaceRoot,
        cwd: workspaceRoot,
        env: process.env,
        task: 'Resume host-governed operator matrix.',
        source: 'cli',
    });
    const initialSummary = getHallSummary(workspaceRoot);
    let events = buildSeedEvents(workspaceRoot, initialSummary);
    events = appendResumeEvents(events, resumeResult);
    let activePlanningSessionId: string | undefined;

    if (!input.isTTY || !output.isTTY) {
        output.write(renderOperatorShell(readOperatorSnapshot(events)));
        return;
    }

    const rl = readline.createInterface({ input, output });
    output.write('\u001b[?1049h\u001b[?25l');

    try {
        while (true) {
            output.write('\u001bc');
            output.write(renderOperatorShell(readOperatorSnapshot(events)));
            const command = await rl.question(chalk.greenBright.bold('INTENT > '));
            const result = await dispatchOperatorInput(command, dispatchPort, registry.getRoot(), activePlanningSessionId);
            events = result.events.length > 0
                ? [...events, ...result.events].slice(-10)
                : events;
            activePlanningSessionId = result.planningSessionId;

            if (result.exit) {
                break;
            }
        }
    } finally {
        rl.close();
        output.write('\u001b[?25h\u001b[?1049l');
    }
}
