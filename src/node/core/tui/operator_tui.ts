import chalk from 'chalk';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { StateRegistry, type SovereignState, type AgentState, type BlackboardEntry } from  '../state.js';
import { BlackboardManager } from '../blackboard_manager.js';
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

export type OperatorTab = 'OVERVIEW' | 'BLACKBOARD' | 'AGENTS' | 'TERMINALS';

export interface OperatorSnapshot {
    workspaceRoot: string;
    state: SovereignState;
    hallSummary: HallRepositorySummary | null;
    beads: SovereignBead[];
    planningSessions: HallPlanningSessionRecord[];
    proposals: HallSkillProposalRecord[];
    events: OperatorEvent[];
    activeTab: OperatorTab;
}

const KNOWN_DIRECT_COMMANDS = new Set([
    'chant',
    'evolve',
    'forge',
    'pennyone',
    'ravens',
    'start',
    'hand',
    'broadcast',
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

export function readOperatorSnapshot(events: OperatorEvent[], activeTab: OperatorTab = 'OVERVIEW'): OperatorSnapshot {
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
        activeTab,
    };
}

function formatAgentStatus(agent: AgentState): string {
    const statusColor =
        agent.status === 'WORKING' || agent.status === 'THINKING'
            ? chalk.greenBright
            : agent.status === 'WAITING_FOR_HANDOFF'
                ? chalk.yellowBright
                : agent.status === 'SLEEPING'
                    ? chalk.dim
                    : chalk.red;

    const details = [
        agent.pid ? `PID:${agent.pid}` : null,
        agent.active_bead_id ? `BEAD:${agent.active_bead_id}` : null,
        agent.current_task ? truncate(agent.current_task, 30) : null
    ].filter(Boolean).join(' | ');

    return `${chalk.bold(agent.name.padEnd(15))} :: ${statusColor(agent.status)} ${details ? chalk.dim(`(${details})`) : ''}`;
}

function formatBlackboardEntry(entry: BlackboardEntry): string {
    const ts = new Date(entry.at).toLocaleTimeString();
    const typeLabel =
        entry.type === 'HANDOFF'
            ? chalk.bgYellow.black.bold(' HANDOFF ')
            : entry.type === 'BROADCAST'
                ? chalk.bgBlue.white.bold(' BROADCAST ')
                : entry.type === 'ALERT'
                    ? chalk.bgRed.white.bold(' ALERT ')
                    : chalk.bgWhite.black(' INFO ');

    const context = entry.to ? `${chalk.bold(entry.from)} -> ${chalk.bold(entry.to)}` : chalk.bold(entry.from);
    return `${chalk.dim(`[${ts}]`)} ${typeLabel} ${context} :: ${entry.message}`;
}

export function renderOperatorShell(snapshot: OperatorSnapshot): string {
    const state = snapshot.state.framework;
    const hall = snapshot.hallSummary;
    const spokes = snapshot.state.managed_spokes.length;
    const out: string[] = [];

    const tabs: OperatorTab[] = ['OVERVIEW', 'BLACKBOARD', 'AGENTS', 'TERMINALS'];
    const tabHeader = tabs.map((t) => {
        const label = ` [${t}] `;
        return t === snapshot.activeTab ? chalk.bgGreen.black.bold(label) : chalk.dim(label);
    }).join('');

    out.push(chalk.greenBright.bold('▓▒░ CORVUS STAR WAR ROOM MATRIX ░▒▓'));
    out.push(tabHeader);
    out.push(chalk.dim('Multi-agent command orchestration. Unified state blackboard.'));
    out.push(HUD.boxTop(`◤ WAR ROOM : ${snapshot.activeTab} ◢`));

    if (snapshot.activeTab === 'OVERVIEW') {
        out.push(HUD.boxRow('INTENT LANE', 'Natural language or direct command. Enter = refresh. exit = leave.', chalk.greenBright));
        out.push(HUD.boxSeparator());
        out.push(HUD.boxRow('WORKSPACE', snapshot.workspaceRoot, chalk.cyanBright));
        out.push(HUD.boxRow('STATUS', state.status, chalk.greenBright));
        out.push(HUD.boxRow('PERSONA', state.active_persona, chalk.magentaBright));
        out.push(HUD.boxRow('GUNGNIR', state.gungnir_score.toFixed(2), chalk.yellowBright));
        out.push(HUD.boxRow('INTEGRITY', `${state.intent_integrity.toFixed(1)}%`, chalk.greenBright));
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
    }

    if (snapshot.activeTab === 'AGENTS') {
        const agents = snapshot.state.agents || {};
        const agentKeys = Object.keys(agents);
        if (agentKeys.length === 0) {
            out.push(HUD.boxRow('AGENTS', 'No agents registered.', chalk.gray));
        } else {
            agentKeys.forEach((key) => {
                out.push(HUD.boxRow('AGENT', formatAgentStatus(agents[key]), undefined));
            });
        }
    }

    if (snapshot.activeTab === 'BLACKBOARD') {
        const blackboard = snapshot.state.blackboard || [];
        if (blackboard.length === 0) {
            out.push(HUD.boxRow('STATE', 'The blackboard is empty.', chalk.gray));
        } else {
            blackboard.slice(-15).forEach((entry, index) => {
                out.push(HUD.boxRow(`DATA ${index + 1}`, formatBlackboardEntry(entry), undefined));
            });
        }
    }

    if (snapshot.activeTab === 'TERMINALS') {
        const logs = snapshot.state.terminal_logs || [];
        if (logs.length === 0) {
            out.push(HUD.boxRow('TERMINAL', 'No background activity recorded yet.', chalk.gray));
        } else {
            logs.slice(-15).forEach((line, index) => {
                out.push(HUD.boxRow(`LOG ${index + 1}`, line, undefined));
            });
        }
        out.push(HUD.boxSeparator());
        out.push(HUD.boxRow('STATUS', 'Listening for background agent output...', chalk.dim));
    }

    out.push(HUD.boxBottom());
    return out.join('');
}

async function dispatchOperatorInput(
    rawInput: string,
    dispatchPort: RuntimeDispatchPort,
    workspaceRoot: string,
    activeTab: OperatorTab,
    activePlanningSessionId?: string,
): Promise<{ events: OperatorEvent[]; exit?: boolean; planningSessionId?: string; activeTab: OperatorTab }> {
    const normalized = rawInput.trim();
    let events: OperatorEvent[] = [];

    if (!normalized) {
        events = pushEvent(events, 'INFO', 'Refresh requested.', workspaceRoot);
        return { events, activeTab };
    }

    const lower = normalized.toLowerCase();
    if (lower === 'exit' || lower === 'quit') {
        events = pushEvent(events, 'PASS', 'Operator shell closing.');
        return { events, exit: true, activeTab };
    }

    if (lower === 'clear') {
        events = pushEvent(events, 'INFO', 'Event crawl cleared.');
        return { events, planningSessionId: undefined, activeTab };
    }

    const [head, ...rest] = normalized.split(/\s+/);

    if (lower === '1' || lower === 'overview') return { events: pushEvent(events, 'INFO', 'Tab: OVERVIEW'), activeTab: 'OVERVIEW', planningSessionId: activePlanningSessionId };
    if (lower === '2' || lower === 'blackboard') return { events: pushEvent(events, 'INFO', 'Tab: BLACKBOARD'), activeTab: 'BLACKBOARD', planningSessionId: activePlanningSessionId };
    if (lower === '3' || lower === 'agents') return { events: pushEvent(events, 'INFO', 'Tab: AGENTS'), activeTab: 'AGENTS', planningSessionId: activePlanningSessionId };
    if (lower === '4' || lower === 'terminals') return { events: pushEvent(events, 'INFO', 'Tab: TERMINALS'), activeTab: 'TERMINALS', planningSessionId: activePlanningSessionId };

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
        return { events, planningSessionId: activePlanningSessionId, activeTab };
    }

    if (head.toLowerCase() === 'hand') {
        const targetAgent = rest[0]?.toLowerCase();
        const handoffContext = rest.slice(1).join(' ');
        if (!targetAgent) {
            events = pushEvent(events, 'FAIL', 'Handoff target required.', 'Usage: hand <agent> <context>');
            return { events, planningSessionId: activePlanningSessionId, activeTab };
        }

        const state = StateRegistry.get();
        if (state.agents && state.agents[targetAgent]) {
            state.agents[targetAgent].status = 'WORKING';
            state.agents[targetAgent].current_task = handoffContext;
            StateRegistry.save(state);

            StateRegistry.postToBlackboard({
                from: state.framework.active_persona,
                to: targetAgent,
                message: handoffContext,
                type: 'HANDOFF'
            });

            events = pushEvent(events, 'PASS', `Handoff to ${targetAgent} initiated.`, handoffContext);
        } else {
            events = pushEvent(events, 'FAIL', 'Unknown agent target.', targetAgent);
        }
        return { events, planningSessionId: activePlanningSessionId, activeTab };
    }

    if (head.toLowerCase() === 'broadcast') {
        const message = rest.join(' ');
        const state = StateRegistry.get();

        StateRegistry.postToBlackboard({
            from: state.framework.active_persona,
            message: message,
            type: 'BROADCAST'
        });

        events = pushEvent(events, 'INFO', 'BROADCAST', message);
        return { events, planningSessionId: activePlanningSessionId, activeTab };
    }

    events = pushEvent(events, 'INFO', 'Intent received.', normalized);

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
        return { events, planningSessionId: activePlanningSessionId, activeTab };
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

    return { events, planningSessionId, activeTab };
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
    let activeTab: OperatorTab = 'OVERVIEW';

    if (!input.isTTY || !output.isTTY) {
        output.write(renderOperatorShell(readOperatorSnapshot(events, activeTab)));
        return;
    }

    const rl = readline.createInterface({ input, output });
    output.write('\u001b[?1049h\u001b[?25l');

    let isRefreshing = false;
    const redraw = () => {
        if (isRefreshing) return;
        isRefreshing = true;

        // Save cursor, clear screen, render, restore cursor
        output.write('\u001bc');
        output.write(renderOperatorShell(readOperatorSnapshot(events, activeTab)));
        output.write(chalk.greenBright.bold(`\nINTENT [${activeTab}] > `));

        isRefreshing = false;
    };

    // --- WAR ROOM HEARTBEAT ---
    // Pulse every 5 seconds to sync background agent state and blackboard updates.
    const heartbeat = setInterval(async () => {
        await BlackboardManager.compactIfNecessary();
        redraw();
    }, 5000);

    try {
        while (true) {
            redraw();
            const command = await rl.question(''); // Blocking prompt, but heartbeat handles redraw

            const result = await dispatchOperatorInput(
                command,
                dispatchPort,
                registry.getRoot(),
                activeTab,
                activePlanningSessionId
            );

            events = result.events.length > 0
                ? [...events, ...result.events].slice(-15)
                : events;
            activePlanningSessionId = result.planningSessionId;
            activeTab = result.activeTab;

            if (result.exit) {
                break;
            }
        }
    } finally {
        clearInterval(heartbeat);
        rl.close();
        output.write('\u001b[?25h\u001b[?1049l');
    }
}
