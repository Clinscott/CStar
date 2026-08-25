import { Command } from 'commander';
import chalk from 'chalk';

import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';
import { buildAuguryDoctorFromStatus, buildAuguryExplainFromStatus } from './trace_augury.js';
import {
    buildTraceFailuresPayload,
    parseTraceLimit,
    resolveActivePlanningSession,
    resolveActiveTraceHandoffPayload,
    resolveActiveTraceStatusPayload,
    resolveFailedPlanningSessions,
} from './trace_payload.js';
import {
    renderAuguryDoctorLines,
    renderAuguryExplainLines,
    renderAuguryFailureLines,
    renderAuguryHandoffLines,
    renderAuguryStatusLines,
    renderTraceFailureLines,
    renderTraceHandoffLines,
    renderTraceStatusLines,
} from './trace_render.js';

export type {
    TraceExecutionGate,
    TraceFailureDiagnosticsPayload,
    TraceHostContextPayload,
    TraceContractPayload,
    TraceLineagePayload,
    TraceWorkItemPayload,
    TraceAgentHandoffPayload,
    TraceStatusPayload,
    TraceFailureEntryPayload,
    TraceFailuresPayload,
    AuguryDiagnosticCheck,
    AuguryGuardrailPayload,
    AuguryDoctorPayload,
    AuguryExplainPayload,
} from './trace_types.js';
export { getTraceContract } from './trace_contract.js';
export {
    hydratePlanningSession,
    resolveActivePlanningSession,
    summarizeSessionBeads,
    buildTraceAgentHandoffPayload,
    buildRuntimeTraceHandoffPayload,
    buildTraceStatusPayload,
    resolveActiveTraceHandoffPayload,
    buildTraceFailuresPayload,
    buildTraceHandoffPayload,
} from './trace_payload.js';
export { buildAuguryDoctorPayload, buildAuguryExplainPayload } from './trace_augury.js';
export {
    renderTraceHandoffLines,
    renderAuguryStatusLines,
    renderAuguryHandoffLines,
    renderAuguryFailureLines,
    renderTraceStatusLines,
    renderTraceFailureLines,
} from './trace_render.js';

export function registerTraceCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('trace')
        .description('Compatibility alias for active Hall-backed Augury/runtime state');

    command
        .command('status')
        .description('Show the active planning or runtime trace summary from Hall')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = resolveActiveTraceStatusPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of payload ? renderTraceStatusLines(
                payload.origin === 'planning_session' ? resolveActivePlanningSession(rootPath) : null,
                rootPath,
            ) : [chalk.dim('trace=none')]) {
                console.log(line);
            }
        });

    command
        .command('handoff')
        .description('Show the active planning or runtime trace as an agent-ready handoff packet')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const handoff = resolveActiveTraceHandoffPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
                return;
            }
            for (const line of renderTraceHandoffLines(handoff)) {
                console.log(line);
            }
        });

    command
        .command('failures')
        .description('List recent failed planning sessions from Hall')
        .option('-l, --limit <n>', 'Maximum failed sessions to show', '5')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { limit?: string; json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const limit = parseTraceLimit(options.limit, 5);
            const sessions = resolveFailedPlanningSessions(rootPath, limit);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(buildTraceFailuresPayload(sessions, rootPath), null, 2)}\n`);
                return;
            }
            for (const line of renderTraceFailureLines(sessions, rootPath)) {
                console.log(line);
            }
        });
}

export function registerAuguryCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
): void {
    const command = program
        .command('augury')
        .description('Inspect the active Hall-backed Corvus Star Augury state');

    command
        .command('status')
        .description('Show the active planning or runtime Augury summary from Hall')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = resolveActiveTraceStatusPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of payload ? renderAuguryStatusLines(
                payload.origin === 'planning_session' ? resolveActivePlanningSession(rootPath) : null,
                rootPath,
            ) : [chalk.dim('augury=none')]) {
                console.log(line);
            }
        });

    command
        .command('handoff')
        .description('Show the active planning or runtime Augury as an agent-ready handoff packet')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const handoff = resolveActiveTraceHandoffPayload(rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
                return;
            }
            for (const line of renderAuguryHandoffLines(handoff)) {
                console.log(line);
            }
        });

    command
        .command('failures')
        .description('List recent failed planning sessions from Hall as Augury recovery leads')
        .option('-l, --limit <n>', 'Maximum failed sessions to show', '5')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { limit?: string; json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const limit = parseTraceLimit(options.limit, 5);
            const sessions = resolveFailedPlanningSessions(rootPath, limit);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(buildTraceFailuresPayload(sessions, rootPath), null, 2)}\n`);
                return;
            }
            for (const line of renderAuguryFailureLines(sessions, rootPath)) {
                console.log(line);
            }
        });

    command
        .command('doctor')
        .description('Diagnose whether the active Augury is safe and useful for agent routing')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = buildAuguryDoctorFromStatus(resolveActiveTraceStatusPayload(rootPath), rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderAuguryDoctorLines(payload)) {
                console.log(line);
            }
        });

    command
        .command('explain')
        .description('Explain the active Augury route, scope, expert, and Mimir basis')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action((options: { json?: boolean }) => {
            const rootPath = resolveWorkspaceRoot(workspaceRootSource);
            const payload = buildAuguryExplainFromStatus(resolveActiveTraceStatusPayload(rootPath), rootPath);
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderAuguryExplainLines(payload)) {
                console.log(line);
            }
        });
}
