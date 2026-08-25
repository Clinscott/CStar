import type {
    DelegatedExecutionHandle,
    DelegatedExecutionRequest,
    DelegatedExecutionResult,
    DelegatedExecutionSurface,
} from '../../../core/host_delegation.js';
import type { HostProvider } from '../../../core/host_session.js';
import type { HallOneMindRequestRecord } from '../../../types/hall.js';

export type OneMindDelegatedProvider = Exclude<HostProvider, 'droid'>;

export interface DelegatedQueueIdentity {
    provider: OneMindDelegatedProvider;
    surface: DelegatedExecutionSurface;
}

export type DelegatedQueueIdentityResolution =
    | { ok: true; identity: DelegatedQueueIdentity }
    | {
        ok: false;
        error: string;
        requestedProvider: string | null;
        requestedSurface: string | null;
        actualProvider: string | null;
        actualSurface: string | null;
    };

export function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function isSupportedProvider(value: string | undefined): value is OneMindDelegatedProvider {
    return value === 'codex' || value === 'gemini' || value === 'claude';
}

function isSupportedSurface(value: string | undefined): value is DelegatedExecutionSurface {
    return value === 'configured_delegate_bridge' || value === 'provider_native_cli';
}

export function resolveDelegatedQueueIdentity(
    request: HallOneMindRequestRecord,
    options: { allowPollSurfaceEvidence?: boolean } = {},
): DelegatedQueueIdentityResolution {
    const metadata = request.metadata ?? {};
    const requestedProvider = asNonEmptyString(metadata.requested_provider);
    const requestedSurface = asNonEmptyString(metadata.requested_surface);
    const providerAliases = [
        ['metadata.actual_provider', asNonEmptyString(metadata.actual_provider)],
        ['metadata.provider', asNonEmptyString(metadata.provider)],
        ['metadata.broker_state_provider', asNonEmptyString(metadata.broker_state_provider)],
    ] as const;
    const surfaceAliases = [
        ['metadata.execution_surface', asNonEmptyString(metadata.execution_surface), false],
        ['metadata.actual_surface', asNonEmptyString(metadata.actual_surface), true],
        ['metadata.last_attempt_surface', asNonEmptyString(metadata.last_attempt_surface), true],
    ] as const;
    const handleId = asNonEmptyString(metadata.handle_id);
    const isBoundPollRecord = options.allowPollSurfaceEvidence === true
        && request.request_status === 'CLAIMED'
        && requestedSurface === 'configured_delegate_bridge'
        && Boolean(handleId);
    let actualProvider = providerAliases.find(([, value]) => value)?.[1];
    let actualSurface = surfaceAliases.find(([, value]) => value)?.[1];

    const failure = (error: string): DelegatedQueueIdentityResolution => ({
        ok: false,
        error: `${error} A fresh explicit operator action must create a new request.`,
        requestedProvider: requestedProvider ?? null,
        requestedSurface: requestedSurface ?? null,
        actualProvider: actualProvider ?? null,
        actualSurface: actualSurface ?? null,
    });

    if (!isSupportedProvider(requestedProvider)) {
        return failure('Queued delegated fulfillment requires immutable metadata.requested_provider.');
    }
    if (!isSupportedSurface(requestedSurface)) {
        return failure('Queued delegated fulfillment requires immutable metadata.requested_surface.');
    }
    const providerMismatch = providerAliases.find(([, value]) => value && value !== requestedProvider);
    if (providerMismatch) {
        actualProvider = providerMismatch[1];
        return failure(
            `Queued delegated provider mismatch in ${providerMismatch[0]}: requested ${requestedProvider}, stored ${actualProvider}.`,
        );
    }
    const surfaceMismatch = surfaceAliases.find(([, value, mayBePollSurface]) => value
        && value !== requestedSurface
        && !(mayBePollSurface && isBoundPollRecord && value === 'configured_delegate_poll_bridge'));
    if (surfaceMismatch) {
        actualSurface = surfaceMismatch[1];
        return failure(
            `Queued delegated surface mismatch in ${surfaceMismatch[0]}: requested ${requestedSurface}, stored ${actualSurface}.`,
        );
    }
    const storedActualSurface = asNonEmptyString(metadata.actual_surface);
    const storedLastAttemptSurface = asNonEmptyString(metadata.last_attempt_surface);
    if (storedActualSurface && storedLastAttemptSurface && storedActualSurface !== storedLastAttemptSurface) {
        actualSurface = storedLastAttemptSurface;
        return failure(
            `Queued delegated surface aliases disagree: actual_surface ${storedActualSurface}, last_attempt_surface ${storedLastAttemptSurface}.`,
        );
    }

    return {
        ok: true,
        identity: {
            provider: requestedProvider,
            surface: requestedSurface,
        },
    };
}

export function buildDelegatedRequestFromHall(
    request: HallOneMindRequestRecord,
    rootPath: string,
    identity: DelegatedQueueIdentity,
): DelegatedExecutionRequest {
    const metadata = request.metadata ?? {};
    return {
        request_id: request.request_id,
        repo_root: rootPath,
        boundary: 'subagent',
        task_kind: String(metadata.task_kind ?? 'research') as DelegatedExecutionRequest['task_kind'],
        subagent_profile: typeof metadata.subagent_profile === 'string'
            ? metadata.subagent_profile as DelegatedExecutionRequest['subagent_profile']
            : undefined,
        prompt: request.prompt,
        target_paths: Array.isArray(metadata.target_paths)
            ? metadata.target_paths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : undefined,
        acceptance_criteria: Array.isArray(metadata.acceptance_criteria)
            ? metadata.acceptance_criteria.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : undefined,
        checker_shell: typeof metadata.checker_shell === 'string' ? metadata.checker_shell : null,
        requested_provider: identity.provider,
        execution_surface: identity.surface,
        metadata,
    };
}

export function validateDelegatedAttemptIdentity(
    delegated: DelegatedExecutionHandle | DelegatedExecutionResult,
    identity: DelegatedQueueIdentity,
    polling: boolean,
): string {
    const metadata = delegated.metadata ?? {};
    const expectedSurface = polling ? 'configured_delegate_poll_bridge' : identity.surface;
    const reportedRequestedProvider = asNonEmptyString(metadata.requested_provider);
    const reportedRequestedSurface = asNonEmptyString(metadata.requested_surface);
    const providerAliases = [
        ['result.provider', delegated.provider],
        ['metadata.actual_provider', asNonEmptyString(metadata.actual_provider)],
        ['metadata.provider', asNonEmptyString(metadata.provider)],
    ] as const;
    const surfaceAliases = [
        ['metadata.actual_surface', asNonEmptyString(metadata.actual_surface)],
        ['metadata.execution_surface', asNonEmptyString(metadata.execution_surface)],
        ['metadata.last_attempt_surface', asNonEmptyString(metadata.last_attempt_surface)],
    ] as const;
    const actualProvider = asNonEmptyString(metadata.actual_provider) ?? delegated.provider;
    const actualSurface = asNonEmptyString(metadata.actual_surface)
        ?? asNonEmptyString(metadata.execution_surface)
        ?? asNonEmptyString(metadata.last_attempt_surface);
    const mismatch = (
        message: string,
        conflictAlias?: string,
        conflictValue?: string,
    ): Error => {
        const error = new Error(message) as Error & { evidence: Record<string, unknown> };
        error.evidence = {
            requested_provider: identity.provider,
            actual_provider: actualProvider ?? null,
            requested_surface: expectedSurface,
            actual_surface: actualSurface ?? null,
            attempt_surface: expectedSurface,
            execution_dispatched: metadata.execution_dispatched === true,
            identity_conflict_alias: conflictAlias ?? null,
            identity_conflict_value: conflictValue ?? null,
        };
        return error;
    };

    const providerMismatch = providerAliases.find(([, value]) => value && value !== identity.provider);
    if (providerMismatch) {
        throw mismatch(
            `Delegated result provider mismatch in ${providerMismatch[0]}: requested ${identity.provider}, reported ${providerMismatch[1]}.`,
            providerMismatch[0],
            providerMismatch[1],
        );
    }
    if (reportedRequestedProvider && reportedRequestedProvider !== identity.provider) {
        throw mismatch(
            `Delegated result changed requested provider from ${identity.provider} to ${reportedRequestedProvider}.`,
        );
    }
    if (reportedRequestedSurface && reportedRequestedSurface !== expectedSurface) {
        throw mismatch(
            `Delegated result changed requested surface from ${expectedSurface} to ${reportedRequestedSurface}.`,
        );
    }
    const surfaceMismatch = surfaceAliases.find(([, value]) => value && value !== expectedSurface);
    if (surfaceMismatch) {
        throw mismatch(
            `Delegated result surface mismatch in ${surfaceMismatch[0]}: requested ${expectedSurface}, reported ${surfaceMismatch[1]}.`,
            surfaceMismatch[0],
            surfaceMismatch[1],
        );
    }
    if (!actualSurface) {
        throw mismatch(`Delegated result surface mismatch: requested ${expectedSurface}, reported unreported.`);
    }
    if (metadata.execution_dispatched !== true) {
        throw mismatch('Delegated result did not prove execution_dispatched=true.');
    }

    return expectedSurface;
}
