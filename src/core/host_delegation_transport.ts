export const RETIRED_HOST_PROVIDER_DELEGATION_FAILURE =
    'legacy_host_provider_delegation_retired_use_cstar_kernel';

export interface DelegationExecOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxBuffer?: number;
    signal?: AbortSignal;
}

export type DelegationExecRunner = (
    command: string,
    args: string[],
    options: DelegationExecOptions,
) => Promise<{ stdout: string; stderr: string }>;

/** Process execution compatibility fails before spawning a child. */
export const defaultDelegationExecRunner: DelegationExecRunner = async () => {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
};

/** Pure input validation retained for callers that only validate envelopes. */
export function validateDelegationTimeout(timeoutMs: number | undefined): number | undefined {
    if (timeoutMs === undefined) {
        return undefined;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('Delegated execution timeout_ms must be a finite positive number.');
    }
    return timeoutMs;
}

/** Callback/process compatibility fails before invoking the supplied runner. */
export async function runDelegationCommand(
    _runner: DelegationExecRunner,
    _command: string,
    _args: string[],
    _options: DelegationExecOptions,
    _timeoutMs: number | undefined,
    _label: string,
): Promise<{ stdout: string; stderr: string }> {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
}
