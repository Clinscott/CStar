import chalk from 'chalk';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { StateRegistry, type SovereignState, type AgentState, type BlackboardEntry } from  '../state.js';
import { HUD } from  '../hud.js';
import {
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
import type { RuntimeDispatchPort } from  '../runtime/contracts.js';
import {
    compactPlanningHandle,
    formatPlanningDigestBadge,
} from  '../operator_resume.js';
import {
    dispatchOperatorInput,
    type OperatorEvent,
    type OperatorTab,
} from './operator_tui_commands.js';

export type { OperatorEvent, OperatorTab } from './operator_tui_commands.js';

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

export const operatorTuiRuntimeDeps = {
    getWorkspaceRoot: (): string => registry.getRoot(),
    getHallSummary: (workspaceRoot: string): HallRepositorySummary | null => getHallSummary(workspaceRoot),
    readSnapshot: (events: OperatorEvent[], activeTab: OperatorTab): OperatorSnapshot => (
        readOperatorSnapshot(events, activeTab)
    ),
    isInteractive: (): boolean => Boolean(input.isTTY && output.isTTY),
    write: (value: string): void => {
        output.write(value);
    },
    createInterface: (): ReturnType<typeof readline.createInterface> => (
        readline.createInterface({ input, output })
    ),
};

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
    interactive: boolean = operatorTuiRuntimeDeps.isInteractive(),
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

export async function runOperatorTui(dispatchPort: RuntimeDispatchPort): Promise<void> {
    const workspaceRoot = operatorTuiRuntimeDeps.getWorkspaceRoot();
    const initialSummary = operatorTuiRuntimeDeps.getHallSummary(workspaceRoot);
    let events = buildSeedEvents(workspaceRoot, initialSummary);
    let activePlanningSessionId: string | undefined;
    let activeTab: OperatorTab = 'OVERVIEW';

    if (!operatorTuiRuntimeDeps.isInteractive()) {
        operatorTuiRuntimeDeps.write(renderOperatorShell(operatorTuiRuntimeDeps.readSnapshot(events, activeTab)));
        return;
    }

    const rl = operatorTuiRuntimeDeps.createInterface();
    operatorTuiRuntimeDeps.write('\u001b[?1049h\u001b[?25l');

    let isRefreshing = false;
    const redraw = () => {
        if (isRefreshing) return;
        isRefreshing = true;

        // Save cursor, clear screen, render, restore cursor
        operatorTuiRuntimeDeps.write('\u001bc');
        operatorTuiRuntimeDeps.write(renderOperatorShell(operatorTuiRuntimeDeps.readSnapshot(events, activeTab)));
        operatorTuiRuntimeDeps.write(chalk.greenBright.bold(`\nINTENT [${activeTab}] > `));

        isRefreshing = false;
    };

    try {
        while (true) {
            redraw();
            const command = await rl.question('');

            const result = await dispatchOperatorInput(
                command,
                dispatchPort,
                operatorTuiRuntimeDeps.getWorkspaceRoot(),
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
        rl.close();
        operatorTuiRuntimeDeps.write('\u001b[?25h\u001b[?1049l');
    }
}
