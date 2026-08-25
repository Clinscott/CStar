import { Command } from 'commander';
import chalk from 'chalk';

import { listHallAgentPresence, listHallCoordinationEvents, listHallPlanningSessions } from '../../../tools/pennyone/intel/database.js';
import { formatPlanningSessionSummary } from '../operator_resume.js';
import { getOneMindBrokerStatus } from '../one_mind_broker/manager.js';
import { fulfillNextOneMindRequest, fulfillOneMindRequestById, getOneMindQueueSummary } from '../one_mind_broker/fulfillment.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';
import { type HallAgentPresenceRecord, type HallCoordinationEventRecord } from '../../../types/hall.js';

export interface OneMindStatusPayload {
    broker: {
        running: boolean;
        responsive: boolean;
        binding_state: string;
        fulfillment_ready: boolean;
        fulfillment_reason: string | null;
        fulfillment_mode: string | null;
        execution_surface: string | null;
        provider: string | null;
        session_id: string | null;
    };
    planning: string | null;
    queue: {
        pending: number;
        claimed: number;
        completed: number;
        failed: number;
    };
}

export interface OneMindAgentPresencePayload {
    agents: HallAgentPresenceRecord[];
}

export interface OneMindCoordinationEventsPayload {
    events: HallCoordinationEventRecord[];
}

function renderStatus(status: Awaited<ReturnType<typeof getOneMindBrokerStatus>>): void {
    const stateLine = status.running
        ? `hall-backed responsive=${status.responsive} binding=${status.bindingState.toLowerCase()}`
        : 'hall-backed offline';
    console.log(chalk.cyan(`[ONE MIND BROKER] ${stateLine}`));
    console.log(chalk.dim(`fulfillment_ready=${status.fulfillmentReady} provider=${status.provider ?? 'none'} session=${status.sessionId ?? 'none'}`));
    if (status.fulfillmentReason) {
        console.log(chalk.dim(`fulfillment_reason=${status.fulfillmentReason}`));
    }
    if (status.fulfillmentMode || status.executionSurface) {
        console.log(chalk.dim(`fulfillment_mode=${status.fulfillmentMode ?? 'none'} execution_surface=${status.executionSurface ?? 'none'}`));
    }
}

function getPlanningStatus(rootPath: string): string | null {
    const session = listHallPlanningSessions(rootPath)[0] ?? null;
    return formatPlanningSessionSummary(session) ?? null;
}

function renderPlanningStatus(rootPath: string): void {
    const summary = getPlanningStatus(rootPath);
    if (!summary) {
        console.log(chalk.dim('planning=none'));
        return;
    }
    console.log(chalk.dim(`planning=${summary}`));
}

export function buildOneMindStatusPayload(
    status: Awaited<ReturnType<typeof getOneMindBrokerStatus>>,
    rootPath: string,
): OneMindStatusPayload {
    const queue = getOneMindQueueSummary(rootPath);
    return {
        broker: {
            running: status.running,
            responsive: status.responsive,
            binding_state: status.bindingState,
            fulfillment_ready: status.fulfillmentReady,
            fulfillment_reason: status.fulfillmentReason,
            fulfillment_mode: status.fulfillmentMode,
            execution_surface: status.executionSurface,
            provider: status.provider,
            session_id: status.sessionId,
        },
        planning: getPlanningStatus(rootPath),
        queue: {
            pending: queue.PENDING ?? 0,
            claimed: queue.CLAIMED ?? 0,
            completed: queue.COMPLETED ?? 0,
            failed: queue.FAILED ?? 0,
        },
    };
}

export function buildOneMindAgentPresencePayload(rootPath: string): OneMindAgentPresencePayload {
    return {
        agents: listHallAgentPresence(rootPath),
    };
}

export function buildOneMindCoordinationEventsPayload(
    rootPath: string,
    options: {
        threadId?: string;
        beadId?: string;
        sessionId?: string;
        traceId?: string;
        limit?: number;
    } = {},
): OneMindCoordinationEventsPayload {
    return {
        events: listHallCoordinationEvents(rootPath, {
            threadId: options.threadId,
            beadId: options.beadId,
            sessionId: options.sessionId,
            traceId: options.traceId,
            limit: options.limit,
        }),
    };
}

export function registerOneMindCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('one-mind')
        .description('Inspect retired One Mind Hall history (read-only)');

    command
        .command('agents')
        .description('Show the Hall-backed multi-agent roster and active focus')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = buildOneMindAgentPresencePayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            if (payload.agents.length === 0) {
                console.log(chalk.dim('agents=none'));
                return;
            }
            for (const agent of payload.agents) {
                console.log(chalk.cyan(`[AGENT] ${agent.agent_id} status=${agent.status} bead=${agent.active_bead_id ?? 'none'} task=${agent.current_task ?? 'none'}`));
            }
        });

    command
        .command('events')
        .description('Show the Hall-backed multi-agent coordination event ledger')
        .option('--thread <id>', 'Filter to a coordination thread id')
        .option('--bead <id>', 'Filter to a bead id')
        .option('--session <id>', 'Filter to a planning session id')
        .option('--trace <id>', 'Filter to a trace id')
        .option('--limit <n>', 'Maximum events to show', '20')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { thread?: string; bead?: string; session?: string; trace?: string; limit?: string; json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = buildOneMindCoordinationEventsPayload(rootPath, {
                threadId: options.thread,
                beadId: options.bead,
                sessionId: options.session,
                traceId: options.trace,
                limit: Math.max(1, Number(options.limit ?? '20') || 20),
            });
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            if (payload.events.length === 0) {
                console.log(chalk.dim('events=none'));
                return;
            }
            for (const event of payload.events) {
                console.log(chalk.cyan(`[EVENT] ${event.event_kind} thread=${event.thread_id} from=${event.from_agent_id} to=${event.to_agent_id ?? 'all'}`));
                console.log(chalk.dim(`scope=${event.scope_kind}:${event.scope_ref} bead=${event.bead_id ?? 'none'} summary=${event.summary}`));
            }
        });

    command
        .command('status')
        .description('Show Hall-backed broker status')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action(async (options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const status = await getOneMindBrokerStatus(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(buildOneMindStatusPayload(status, rootPath), null, 2)}\n`);
                return;
            }
            renderStatus(status);
            renderPlanningStatus(rootPath);
            const queue = getOneMindQueueSummary(rootPath);
            console.log(chalk.dim(`queue pending=${queue.PENDING ?? 0} claimed=${queue.CLAIMED ?? 0} completed=${queue.COMPLETED ?? 0} failed=${queue.FAILED ?? 0}`));
        });

    command
        .command('start')
        .description('Retired compatibility command; never starts or mutates One Mind')
        .option('--silent', 'Suppress command chatter')
        .action((options: { silent?: boolean }) => {
            if (!options.silent) {
                console.error(chalk.red('[ALFRED]: "One Mind is retired and read-only; no broker was started."'));
            }
            process.exitCode = 1;
        });

    command
        .command('stop')
        .description('Retired compatibility command; never mutates Hall')
        .action(() => {
            console.error(chalk.red('[ALFRED]: "One Mind is retired and read-only; Hall was not changed."'));
            process.exitCode = 1;
        });

    command
        .command('queue')
        .description('Show Hall-backed One Mind queue counts')
        .action(() => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const queue = getOneMindQueueSummary(rootPath);
            console.log(chalk.cyan(`[ONE MIND QUEUE] pending=${queue.PENDING ?? 0} claimed=${queue.CLAIMED ?? 0} completed=${queue.COMPLETED ?? 0} failed=${queue.FAILED ?? 0}`));
        });

    command
        .command('fulfill-next')
        .description('Retired compatibility command; never claims or fulfills a request')
        .action(async () => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const result = await fulfillNextOneMindRequest(rootPath, process.env);
            console.error(chalk.red(`[ALFRED]: "${result.error}"`));
            process.exitCode = 1;
        });

    command
        .command('fulfill <requestId>')
        .description('Retired compatibility command; never fulfills a request')
        .action(async (requestId: string) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const result = await fulfillOneMindRequestById(rootPath, requestId, process.env);
            console.error(chalk.red(`[ALFRED]: "${result.error}"`));
            process.exitCode = 1;
        });

    command
        .command('serve')
        .description('Retired compatibility command; never polls or fulfills requests')
        .option('--poll-ms <ms>', 'Polling interval while idle', '1000')
        .option('--idle-exit-ms <ms>', 'Exit after remaining idle for this many milliseconds', '0')
        .action(() => {
            console.error(chalk.red('[ALFRED]: "One Mind is retired and read-only; no serve loop was started."'));
            process.exitCode = 1;
        });
}
