import { Command, InvalidArgumentError } from 'commander';

import { requestHostText, type HostTextResult } from '../../../core/host_intelligence.js';
import type { HostProvider } from '../../../core/host_session.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from '../runtime/invocation.js';

export interface OracleCommandOptions {
    system?: string;
    silent?: boolean;
    provider?: HostProvider;
}

export interface OracleSamplingOptions {
    projectRoot: string;
    env?: NodeJS.ProcessEnv;
    source?: string;
    provider?: HostProvider;
}

export interface OracleDependencies {
    hostTextInvoker?: (request: {
        prompt: string;
        projectRoot: string;
        source: string;
        env?: NodeJS.ProcessEnv;
        provider?: HostProvider | null;
    }) => Promise<HostTextResult>;
}

export const ORACLE_ADVISORY_ONLY = 'CSTAR_ORACLE_ADVISORY_ONLY';

export function parseOracleProvider(value: string): HostProvider {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'gemini' || normalized === 'codex' || normalized === 'claude') {
        return normalized;
    }

    throw new InvalidArgumentError(`Expected one of gemini, codex, claude but received '${value}'.`);
}

export function buildOraclePrompt(prompt: string, systemPrompt?: string): string {
    if (!systemPrompt) {
        return prompt;
    }
    return `SYSTEM:\n${systemPrompt}\n\nUSER:\n${prompt}`;
}

/**
 * Prompt arguments are always literal text. The advisory surface never reads
 * an operator-supplied path implicitly.
 */
export function resolveOraclePromptTarget(target: string, systemPrompt?: string): string {
    return buildOraclePrompt(target, systemPrompt);
}

/**
 * Request one advisory response. This does not write Hall/Synapse state, files,
 * memory, or lifecycle records, and it cannot dispatch implementation.
 */
export async function sampleOraclePrompt(
    prompt: string,
    options: OracleSamplingOptions,
    dependencies: OracleDependencies = {},
): Promise<string> {
    const hostTextInvoker = dependencies.hostTextInvoker ?? requestHostText;
    const result = await hostTextInvoker({
        prompt,
        projectRoot: options.projectRoot,
        source: options.source ?? 'cli:oracle:advisory',
        env: options.env,
        provider: options.provider,
    });
    return result.text;
}

/** @deprecated Synapse fulfillment was an alternate lifecycle mutation lane. */
export async function fulfillOracleSynapseRequest(): Promise<never> {
    throw new Error(`${ORACLE_ADVISORY_ONLY}: Synapse mutation is decommissioned`);
}

export function registerOracleCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dependencies: OracleDependencies = {},
): void {
    program
        .command('oracle <prompt>')
        .description('Request one non-authoritative host advisory response (stdout only)')
        .option('-s, --system <prompt>', 'Add a non-authoritative advisory system prompt')
        .option('--silent', 'Suppress the advisory label')
        .option('-p, --provider <provider>', 'Request an available host provider (gemini|codex|claude)', parseOracleProvider)
        .action(async (target: string, options: OracleCommandOptions) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const response = await sampleOraclePrompt(
                resolveOraclePromptTarget(target, options.system),
                {
                    projectRoot: workspaceRoot,
                    env: process.env,
                    provider: options.provider,
                },
                dependencies,
            );

            if (options.silent) {
                process.stdout.write(response);
                return;
            }
            console.log(`[${ORACLE_ADVISORY_ONLY}] ${response}`);
        });
}
