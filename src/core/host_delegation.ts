import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildHostSubagentPrompt, type HostSubagentProfile } from './host_subagents.js';
import type { HostProvider } from './host_session.js';
import {
    expandDelegateBridgeArgs,
    resolveConfiguredDelegateBridge,
    resolveHostProvider,
} from './host_session.js';

const execFileAsync = promisify(execFile);
const DEFAULT_DELEGATE_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_DELEGATE_REASONING_EFFORT = 'medium';

export type DelegatedExecutionBoundary = 'subagent' | 'autobot';
export type DelegatedExecutionTaskKind = 'research' | 'implementation' | 'verification' | 'critique';
export type DelegatedExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DelegatedExecutionRequest {
    request_id: string;
    repo_root: string;
    boundary: DelegatedExecutionBoundary;
    task_kind: DelegatedExecutionTaskKind;
    subagent_profile?: HostSubagentProfile;
    prompt: string;
    target_paths?: string[];
    acceptance_criteria?: string[];
    checker_shell?: string | null;
    metadata?: Record<string, unknown>;
}

export interface DelegatedExecutionHandle {
    handle_id: string;
    provider: HostProvider;
    status: Exclude<DelegatedExecutionStatus, 'completed' | 'failed' | 'cancelled'>;
    correlation_id?: string;
    metadata?: Record<string, unknown>;
}

export interface DelegatedExecutionResult {
    handle_id: string;
    provider: HostProvider;
    status: Extract<DelegatedExecutionStatus, 'completed' | 'failed' | 'cancelled'>;
    summary?: string;
    artifacts?: string[];
    raw_text?: string;
    error?: string;
    verification?: {
        checker_shell?: string | null;
        status?: 'passed' | 'failed' | 'not_run';
        output?: string;
    };
    metadata?: Record<string, unknown>;
}

export interface HostDelegationDependencies {
    execRunner?: (
        command: string,
        args: string[],
        options: {
            cwd: string;
            env: NodeJS.ProcessEnv;
            maxBuffer?: number;
        },
    ) => Promise<{ stdout: string; stderr: string }>;
}

const defaultExecRunner = async (
    command: string,
    args: string[],
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        maxBuffer?: number;
    },
): Promise<{ stdout: string; stderr: string }> => {
    const result = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env,
        encoding: 'utf-8',
        maxBuffer: options.maxBuffer ?? DEFAULT_DELEGATE_MAX_BUFFER,
    });
    return {
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
    };
};

function parseBridgeResult(raw: string): DelegatedExecutionHandle | DelegatedExecutionResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Delegate bridge returned invalid JSON: ${message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Delegate bridge returned a non-object payload.');
    }

    const record = parsed as Record<string, unknown>;
    const status = String(record.status ?? '').trim().toLowerCase();
    const handleId = String(record.handle_id ?? '').trim();
    const provider = String(record.provider ?? '').trim().toLowerCase();

    if (!handleId) {
        throw new Error('Delegate bridge response is missing handle_id.');
    }
    if (provider !== 'codex' && provider !== 'gemini' && provider !== 'claude') {
        throw new Error('Delegate bridge response is missing a valid provider.');
    }
    if (!status) {
        throw new Error('Delegate bridge response is missing status.');
    }

    return parsed as DelegatedExecutionHandle | DelegatedExecutionResult;
}

async function invokeProviderNativeDelegation(
    provider: HostProvider,
    request: DelegatedExecutionRequest,
    env: NodeJS.ProcessEnv,
    execRunner: NonNullable<HostDelegationDependencies['execRunner']>,
): Promise<DelegatedExecutionResult> {
    const delegatedPrompt = buildHostSubagentPrompt(
        request.subagent_profile ?? 'backend',
        request.prompt,
        request,
    );

    if (provider === 'codex') {
        const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'corvus-delegate-native-'));
        const outputPath = path.join(scratchDir, 'last-message.txt');
        try {
            const { stdout, stderr } = await execRunner(
                'codex',
                [
                    'exec',
                    '--skip-git-repo-check',
                    '--cd', request.repo_root,
                    '-c', `model_reasoning_effort="${DEFAULT_DELEGATE_REASONING_EFFORT}"`,
                    '--output-last-message', outputPath,
                    delegatedPrompt,
                ],
                {
                    cwd: request.repo_root,
                    env: { ...env },
                    maxBuffer: DEFAULT_DELEGATE_MAX_BUFFER,
                },
            );

            const filePayload = await readFile(outputPath, 'utf-8').catch(() => '');
            const rawText = filePayload.trim() || stdout.trim() || stderr.trim();
            if (!rawText) {
                throw new Error('Codex native delegation returned no output.');
            }

            return {
                handle_id: request.request_id,
                provider,
                status: 'completed',
                raw_text: rawText,
                summary: 'provider-native-codex-cli',
                metadata: {
                    execution_surface: 'host-cli-inference',
                    delegation_mode: 'provider-native',
                    subagent_profile: request.subagent_profile ?? 'backend',
                },
            };
        } finally {
            await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    if (provider === 'gemini' || provider === 'claude') {
        const args = provider === 'gemini'
            ? ['--approval-mode', 'plan', '-p', delegatedPrompt]
            : ['-p', delegatedPrompt];
        const { stdout, stderr } = await execRunner(
            provider,
            args,
            {
                cwd: request.repo_root,
                env: { ...env },
                maxBuffer: DEFAULT_DELEGATE_MAX_BUFFER,
            },
        );
        const rawText = stdout.trim() || stderr.trim();
        if (!rawText) {
            throw new Error(`${provider} native delegation returned no output.`);
        }

        return {
            handle_id: request.request_id,
            provider,
            status: 'completed',
            raw_text: rawText,
            summary: `provider-native-${provider}-cli`,
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
                subagent_profile: request.subagent_profile ?? 'backend',
            },
        };
    }

    throw new Error(`Provider ${provider} does not support native delegated execution.`);
}

export async function requestHostDelegatedExecution(
    request: DelegatedExecutionRequest,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: HostDelegationDependencies = {},
): Promise<DelegatedExecutionHandle | DelegatedExecutionResult> {
    const provider = resolveHostProvider(env);
    if (!provider) {
        throw new Error('Host Agent session inactive.');
    }

    const bridge = resolveConfiguredDelegateBridge(env, provider);
    const execRunner = dependencies.execRunner ?? defaultExecRunner;
    if (!bridge) {
        return invokeProviderNativeDelegation(provider, request, env, execRunner);
    }

    const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'corvus-delegate-'));
    const requestPath = path.join(scratchDir, 'request.json');
    const resultPath = path.join(scratchDir, 'result.json');

    try {
        await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf-8');
        const args = expandDelegateBridgeArgs(bridge.args, {
            request_path: requestPath,
            result_path: resultPath,
            project_root: request.repo_root,
            provider,
            subagent_profile: request.subagent_profile ?? 'backend',
        });

        const { stdout, stderr } = await execRunner(bridge.command, args, {
            cwd: request.repo_root,
            env: { ...env },
            maxBuffer: DEFAULT_DELEGATE_MAX_BUFFER,
        });

        const filePayload = await readFile(resultPath, 'utf-8').catch(() => '');
        const raw = filePayload.trim() || stdout.trim() || stderr.trim();
        if (!raw) {
            throw new Error(`Delegate bridge for provider ${provider} returned no output.`);
        }

        return parseBridgeResult(raw);
    } finally {
        await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
