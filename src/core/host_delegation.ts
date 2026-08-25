import type { HostSubagentProfile } from './host_subagents.js';
import type { HostProvider } from './host_session.js';
import { DelegationAttemptFailure, delegationEvidence } from './host_delegation_evidence.js';
import {
    RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
    type DelegationExecRunner,
} from './host_delegation_transport.js';

export { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from './host_delegation_transport.js';

export type DelegatedExecutionBoundary = 'subagent';
export type DelegatedExecutionTaskKind = 'research' | 'implementation' | 'verification' | 'critique';
export type DelegatedExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type DelegatedExecutionSurface = 'configured_delegate_bridge' | 'provider_native_cli';

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
    requested_provider?: HostProvider;
    execution_surface?: DelegatedExecutionSurface;
    timeout_ms?: number;
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
    execRunner?: DelegationExecRunner;
}

export interface DelegatedExecutionResolutionRequest {
    handle_id: string;
    request_id: string;
    repo_root: string;
    provider: HostProvider;
    subagent_profile?: HostSubagentProfile;
    timeout_ms?: number;
}

function retiredFailure(
    requestedProvider: HostProvider | null,
    requestedSurface: string,
): DelegationAttemptFailure {
    return new DelegationAttemptFailure(
        RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
        delegationEvidence(requestedProvider, null, requestedSurface, null, false),
    );
}

/** Delegation compatibility fails before environment, filesystem, provider, process, or callback access. */
export async function requestHostDelegatedExecution(
    request: DelegatedExecutionRequest,
    _env: NodeJS.ProcessEnv = {},
    _dependencies: HostDelegationDependencies = {},
): Promise<DelegatedExecutionHandle | DelegatedExecutionResult> {
    throw retiredFailure(
        request.requested_provider ?? null,
        request.execution_surface ?? 'configured_delegate_bridge',
    );
}

/** Poll compatibility fails before filesystem, provider, process, or callback access. */
export async function resolveHostDelegatedExecution(
    request: DelegatedExecutionResolutionRequest,
    _env: NodeJS.ProcessEnv = {},
    _dependencies: HostDelegationDependencies = {},
): Promise<DelegatedExecutionHandle | DelegatedExecutionResult> {
    throw retiredFailure(request.provider, 'configured_delegate_poll_bridge');
}
