import { Command } from 'commander';
import chalk from 'chalk';

import { isHostSessionActive, resolveHostProvider } from '../../../core/host_session.js';
import { listHallPlanningSessions } from '../../../tools/pennyone/intel/database.js';
import { formatPlanningSessionSummary } from '../operator_resume.js';
import { ensureOneMindBroker, getOneMindBrokerStatus, stopOneMindBroker } from '../one_mind_broker/manager.js';
import { fulfillNextOneMindRequest, fulfillOneMindRequestById, getOneMindQueueSummary, seedHallBrokerIfMissing } from '../one_mind_broker/fulfillment.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';

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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

export function registerOneMindCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('one-mind')
        .description('Inspect or manage the Hall-backed One Mind broker state');

    command
        .command('status')
        .description('Show Hall-backed broker status')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action(async (options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            seedHallBrokerIfMissing(rootPath, process.env);
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
        .description('Register broker readiness in Hall for the current workspace')
        .option('--silent', 'Suppress command chatter')
        .action(async (options: { silent?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const hostActive = isHostSessionActive(process.env);
            const provider = resolveHostProvider(process.env);
            const status = await ensureOneMindBroker(rootPath, {
                ...process.env,
                CORVUS_HOST_PROVIDER: process.env.CORVUS_HOST_PROVIDER ?? provider ?? undefined,
            });

            if (!options.silent) {
                console.log(chalk.green(`[ALFRED]: "One Mind broker ${status.running ? 'active' : 'unavailable'}."`));
                console.log(chalk.dim(`host_session=${hostActive} provider=${provider ?? 'none'} fulfillment_ready=${status.fulfillmentReady}`));
                renderStatus(status);
            }
        });

    command
        .command('stop')
        .description('Mark the Hall-backed broker offline')
        .action(async () => {
            const stopped = await stopOneMindBroker(resolveWorkspaceRoot(workspaceRootSource), process.env);
            if (stopped) {
                console.log(chalk.green('[ALFRED]: "One Mind broker marked offline in Hall."'));
                return;
            }
            console.log(chalk.yellow('[ALFRED]: "One Mind broker was already offline."'));
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
        .description('Claim and fulfill the oldest pending Hall One Mind request')
        .action(async () => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const result = await fulfillNextOneMindRequest(rootPath, process.env);
            if (result.outcome === 'idle') {
                console.log(chalk.yellow('[ALFRED]: "No pending Hall One Mind requests."'));
                return;
            }
            if (result.outcome === 'failed') {
                const target = result.requestId ? ` for ${result.requestId}` : '';
                console.error(chalk.red(`[ALFRED]: "One Mind fulfillment failed${target}: ${result.error}"`));
                process.exit(1);
            }
            console.log(chalk.green(`[ALFRED]: "One Mind fulfilled ${result.requestId}."`));
        });

    command
        .command('fulfill <requestId>')
        .description('Fulfill a specific Hall One Mind request by request id')
        .action(async (requestId: string) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const result = await fulfillOneMindRequestById(rootPath, requestId, process.env);
            if (result.outcome === 'failed') {
                console.error(chalk.red(`[ALFRED]: "One Mind fulfillment failed for ${requestId}: ${result.error}"`));
                process.exit(1);
            }
            if (result.outcome === 'idle') {
                console.log(chalk.yellow('[ALFRED]: "No pending Hall One Mind requests."'));
                return;
            }
            console.log(chalk.green(`[ALFRED]: "One Mind fulfilled ${requestId}."`));
        });

    command
        .command('serve')
        .description('Continuously fulfill pending Hall One Mind requests until interrupted')
        .option('--poll-ms <ms>', 'Polling interval while idle', '1000')
        .option('--idle-exit-ms <ms>', 'Exit after remaining idle for this many milliseconds', '0')
        .action(async (options: { pollMs?: string; idleExitMs?: string }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const pollMs = Math.max(50, Number(options.pollMs ?? '1000') || 1000);
            const idleExitMs = Math.max(0, Number(options.idleExitMs ?? '0') || 0);
            let stopping = false;
            let lastActivityAt = Date.now();

            const stop = (): void => {
                stopping = true;
            };

            process.once('SIGINT', stop);
            process.once('SIGTERM', stop);

            try {
                seedHallBrokerIfMissing(rootPath, process.env);
                console.log(chalk.green('[ALFRED]: "One Mind serve loop active."'));

                while (!stopping) {
                    const result = await fulfillNextOneMindRequest(rootPath, process.env);

                    if (result.outcome === 'fulfilled') {
                        lastActivityAt = Date.now();
                        console.log(chalk.green(`[ALFRED]: "One Mind fulfilled ${result.requestId}."`));
                        continue;
                    }

                    if (result.outcome === 'failed') {
                        console.error(chalk.red(`[ALFRED]: "One Mind fulfillment failed${result.requestId ? ` for ${result.requestId}` : ''}: ${result.error}"`));
                        process.exitCode = 1;
                        return;
                    }

                    if (idleExitMs > 0 && (Date.now() - lastActivityAt) >= idleExitMs) {
                        console.log(chalk.dim('[ALFRED]: "One Mind serve loop exiting after idle timeout."'));
                        return;
                    }

                    await sleep(pollMs);
                }
            } finally {
                process.removeListener('SIGINT', stop);
                process.removeListener('SIGTERM', stop);
            }
        });
}
