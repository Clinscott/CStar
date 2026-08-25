import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildHostSubagentPrompt, type HostSubagentProfile } from './host_subagents.js';
import type { HostProvider } from './host_session.js';
import {
    expandDelegateBridgeArgs,
    getDelegatePollBridgeConfigurationHint,
    resolveConfiguredDelegatePollBridge,
    resolveConfiguredDelegateBridge,
    resolveHostProvider,
} from './host_session.js';

const execFileAsync = promisify(execFile);
const DEFAULT_DELEGATE_MAX_BUFFER = 10 * 1024 * 1024;

export type DelegatedExecutionBoundary = 'subagent';
export type DelegatedExecutionTaskKind = 'research' | 'verification' | 'critique';
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

export interface DelegatedExecutionResolutionRequest {
    handle_id: string;
    request_id: string;
    repo_root: string;
    provider: HostProvider;
    subagent_profile?: HostSubagentProfile;
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

function assertAdvisoryTaskKind(taskKind: unknown): asserts taskKind is DelegatedExecutionTaskKind {
    if (taskKind === 'research' || taskKind === 'verification' || taskKind === 'critique') {
        return;
    }
    throw new Error(
        `Delegated execution task kind '${String(taskKind)}' is retired. Implementation must use the CStar Forge lifecycle.`,
    );
}

export async function requestHostDelegatedExecution(
    request: DelegatedExecutionRequest,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: HostDelegationDependencies = {},
): Promise<DelegatedExecutionHandle | DelegatedExecutionResult> {
    assertAdvisoryTaskKind(request.task_kind);
    const provider = resolveHostProvider(env);
    if (!provider) {
        throw new Error('Host Agent session inactive.');
    }

    const bridge = resolveConfiguredDelegateBridge(env, provider);
    const execRunner = dependencies.execRunner ?? defaultExecRunner;
    if (!bridge) {
        throw new Error(
            `Provider-native delegated execution is retired for ${provider}; configure an authorized advisory delegate bridge.`,
        );
    }

    const advisoryRequest: DelegatedExecutionRequest = {
        ...request,
        subagent_profile: request.subagent_profile ?? 'reviewer',
        prompt: buildHostSubagentPrompt(
            request.subagent_profile ?? 'reviewer',
            request.prompt,
            request,
        ),
        checker_shell: null,
        metadata: {
            ...(request.metadata ?? {}),
            execution_class: 'advisory-only',
            implementation_authority: false,
        },
    };
    const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'corvus-delegate-'));
    const requestPath = path.join(scratchDir, 'request.json');
    const resultPath = path.join(scratchDir, 'result.json');

    try {
        await writeFile(requestPath, JSON.stringify(advisoryRequest, null, 2), 'utf-8');
        const args = expandDelegateBridgeArgs(bridge.args, {
            request_path: requestPath,
            result_path: resultPath,
            project_root: request.repo_root,
            provider,
            subagent_profile: advisoryRequest.subagent_profile ?? 'reviewer',
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

export async function resolveHostDelegatedExecution(
    request: DelegatedExecutionResolutionRequest,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: HostDelegationDependencies = {},
): Promise<DelegatedExecutionHandle | DelegatedExecutionResult> {
    const bridge = resolveConfiguredDelegatePollBridge(env, request.provider);
    if (!bridge) {
        throw new Error(
            `No delegated execution poll bridge is configured for ${request.provider}. ${getDelegatePollBridgeConfigurationHint(request.provider)}`,
        );
    }

    const execRunner = dependencies.execRunner ?? defaultExecRunner;
    const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'corvus-delegate-poll-'));
    const resultPath = path.join(scratchDir, 'result.json');

    try {
        const args = expandDelegateBridgeArgs(bridge.args, {
            request_path: '',
            result_path: resultPath,
            project_root: request.repo_root,
            provider: request.provider,
            subagent_profile: request.subagent_profile ?? 'reviewer',
            request_id: request.request_id,
            handle_id: request.handle_id,
        });

        const { stdout, stderr } = await execRunner(bridge.command, args, {
            cwd: request.repo_root,
            env: { ...env },
            maxBuffer: DEFAULT_DELEGATE_MAX_BUFFER,
        });

        const filePayload = await readFile(resultPath, 'utf-8').catch(() => '');
        const raw = filePayload.trim() || stdout.trim() || stderr.trim();
        if (!raw) {
            throw new Error(`Delegate poll bridge for provider ${request.provider} returned no output.`);
        }

        return parseBridgeResult(raw);
    } finally {
        await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
