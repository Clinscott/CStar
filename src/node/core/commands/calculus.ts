import { Command } from 'commander';

import { renderStandardCommandResult } from './command_context.js';
import { CalculusAdapter, type CalculusReport } from '../runtime/adapters/calculus.js';
import type {
    CalculusWeavePayload,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../runtime/contracts.js';
import {
    resolveWorkspaceRoot,
    withCliWorkspaceTarget,
    type WorkspaceRootSource,
} from '../runtime/invocation.js';

export type CalculusCommandRunner = (
    invocation: WeaveInvocation<CalculusWeavePayload>,
    context: RuntimeContext,
) => Promise<WeaveResult>;

export function buildCalculusInvocation(
    action: CalculusWeavePayload['action'],
    file: string,
    workspaceRoot: string,
): WeaveInvocation<CalculusWeavePayload> {
    return withCliWorkspaceTarget({
        weave_id: 'prime:calculus',
        payload: { action, file },
    }, workspaceRoot, file);
}

function buildCalculusContext(workspaceRoot: string, requestedFile: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CALCULUS-READ-ONLY',
        bead_id: 'bead:calculus:read-only',
        trace_id: 'TRACE-CALCULUS-READ-ONLY',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        requested_root: requestedFile,
        env: process.env,
        timestamp: 0,
    };
}

const directCalculusRunner: CalculusCommandRunner = async (invocation, context) => (
    new CalculusAdapter().execute(invocation, context)
);

function getCalculusReport(result: WeaveResult): CalculusReport | null {
    const report = result.metadata?.calculus;
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
        return null;
    }
    return report as CalculusReport;
}

function renderCalculusResult(
    action: CalculusWeavePayload['action'],
    file: string,
    result: WeaveResult,
    workspaceRoot: string,
    json: boolean,
): void {
    const report = getCalculusReport(result);
    const malformedSuccess = result.status !== 'FAILURE' && report === null;
    if (json) {
        const payload = report ?? {
            schema_version: '1.0',
            action,
            file,
            status: 'ERROR',
            error: {
                code: String(result.metadata?.error_code ?? (
                    malformedSuccess ? 'INVALID_CALCULUS_REPORT' : 'CALCULUS_FAILED'
                )),
                message: result.error ?? (
                    malformedSuccess
                        ? 'Gungnir Calculus returned an invalid report.'
                        : 'Gungnir Calculus failed.'
                ),
            },
        };
        console.log(JSON.stringify(payload, null, 2));
    } else {
        renderStandardCommandResult(result, workspaceRoot);
    }

    process.exitCode = result.status === 'FAILURE' || malformedSuccess
        ? 1
        : action === 'audit' && report?.verdict === 'BREACH'
            ? 2
            : 0;
}

export function registerCalculusCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    runner: CalculusCommandRunner = directCalculusRunner,
): void {
    const calculus = program
        .command('calculus')
        .description('Deterministically score or audit one file with Gungnir Calculus');

    for (const action of ['score', 'audit'] as const) {
        calculus
            .command(`${action} <file>`)
            .description(`${action === 'score' ? 'Score' : 'Audit'} one supported workspace file`)
            .option('--json', 'Emit stable machine-readable JSON')
            .action(async (file: string, options: { json?: boolean }) => {
                const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
                const invocation = buildCalculusInvocation(action, file, workspaceRoot);
                const result = await runner(
                    invocation,
                    buildCalculusContext(workspaceRoot, file),
                );
                renderCalculusResult(action, file, result, workspaceRoot, options.json === true);
            });
    }
}
