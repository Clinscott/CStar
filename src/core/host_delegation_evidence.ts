import {
    createHostAttemptEvidence,
    formatHostAttemptEvidence,
    type HostAttemptEvidence,
    type HostProvider,
} from './host_session.js';
import type {
    DelegatedExecutionHandle,
    DelegatedExecutionResult,
} from './host_delegation.js';

export class DelegationAttemptFailure extends Error {
    public readonly evidence: HostAttemptEvidence;

    public constructor(message: string, evidence: HostAttemptEvidence) {
        const freshAction = /new explicit (request|operator action)/i.test(message)
            ? ''
            : ' A new explicit request is required to select another provider or surface.';
        super(`${message}${freshAction} (${formatHostAttemptEvidence(evidence)})`);
        this.name = 'DelegationAttemptFailure';
        this.evidence = evidence;
    }
}

export function delegationEvidence(
    requestedProvider: HostProvider | null,
    actualProvider: HostProvider | null,
    requestedSurface: string,
    actualSurface: string | null,
    executionDispatched: boolean,
): HostAttemptEvidence {
    return createHostAttemptEvidence({
        requested_provider: requestedProvider,
        actual_provider: actualProvider,
        requested_surface: requestedSurface,
        actual_surface: actualSurface,
        execution_dispatched: executionDispatched,
    });
}

export function asDelegationAttemptFailure(
    error: unknown,
    evidence: HostAttemptEvidence,
): DelegationAttemptFailure {
    if (error instanceof DelegationAttemptFailure) {
        return error;
    }
    return new DelegationAttemptFailure(
        error instanceof Error ? error.message : String(error),
        evidence,
    );
}

export function attachDelegationAttemptEvidence<
    T extends DelegatedExecutionHandle | DelegatedExecutionResult,
>(result: T, evidence: HostAttemptEvidence): T {
    return {
        ...result,
        provider: evidence.actual_provider ?? result.provider,
        metadata: {
            ...(result.metadata ?? {}),
            ...evidence,
        },
    };
}

export function parseDelegatedBridgeResult(
    raw: string,
    expectedProvider: HostProvider,
): DelegatedExecutionHandle | DelegatedExecutionResult {
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
    if (!['codex', 'gemini', 'claude', 'droid'].includes(provider)) {
        throw new Error('Delegate bridge response is missing a valid provider.');
    }
    if (provider !== expectedProvider) {
        throw new Error(`Delegate bridge provider mismatch: requested ${expectedProvider}, reported ${provider}.`);
    }
    if (!status) {
        throw new Error('Delegate bridge response is missing status.');
    }
    return parsed as DelegatedExecutionHandle | DelegatedExecutionResult;
}
