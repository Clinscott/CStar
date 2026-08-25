import type {
    IntelligenceExecutionSurface,
    NormalizedIntelligenceRequest,
} from '../types/intelligence-contract.js';
import {
    createHostAttemptEvidence,
    formatHostAttemptEvidence,
    type HostAttemptEvidence,
    type HostProvider,
} from './host_session.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from './host_delegation_transport.js';

export type HostExecRunner = (
    command: string,
    args: string[],
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        signal?: AbortSignal;
        maxBuffer?: number;
    },
) => Promise<{ stdout: string; stderr: string }>;

/** Process execution compatibility fails before spawning a child. */
export const defaultHostExecRunner: HostExecRunner = async () => {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
};

export class HostAttemptFailure extends Error {
    public readonly evidence: HostAttemptEvidence;

    public constructor(message: string, evidence: HostAttemptEvidence) {
        super(`${message} (${formatHostAttemptEvidence(evidence)})`);
        this.name = 'HostAttemptFailure';
        this.evidence = evidence;
    }
}

export interface HostAttemptSuccess {
    rawText: string;
    evidence: HostAttemptEvidence;
}

export function requiresNativeCodexInvoker(
    request: NormalizedIntelligenceRequest,
    provider: HostProvider,
): boolean {
    if (provider !== 'codex') {
        return false;
    }
    const truthy = (value: unknown): boolean => value === true || (
        typeof value === 'string'
        && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
    );
    return request.metadata?.execution_mode === 'agent-native'
        || truthy(request.metadata?.require_agent_harness)
        || truthy(request.metadata?.trace_critical);
}

interface InvokeHostAttemptInput {
    prompt: string;
    provider: HostProvider;
    projectRoot: string;
    env: NodeJS.ProcessEnv;
    hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    hostExecRunner: HostExecRunner;
    hostSessionTimeoutMs: number;
    requireNativeCodexInvoker: boolean;
    requestedSurface: IntelligenceExecutionSurface;
}

/** Host attempt compatibility fails before provider, process, filesystem, or callback access. */
export async function invokeSingleHostAttempt(
    input: InvokeHostAttemptInput,
): Promise<HostAttemptSuccess> {
    throw new HostAttemptFailure(
        RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
        createHostAttemptEvidence({
            requested_provider: input.provider,
            actual_provider: null,
            requested_surface: input.requestedSurface,
            actual_surface: null,
            execution_dispatched: false,
        }),
    );
}
