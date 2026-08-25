import type {
    DelegatedExecutionHandle,
    DelegatedExecutionResult,
} from '../../../../core/host_delegation.js';
import type { HostProvider } from '../../../../core/host_session.js';

type DelegatedResult = DelegatedExecutionHandle | DelegatedExecutionResult;

export interface DelegatedAttemptEvidence extends Record<string, unknown> {
    requested_provider: HostProvider | null;
    actual_provider: HostProvider | null;
    requested_surface: string;
    actual_surface: string | null;
    execution_dispatched: boolean | null;
}

export interface DelegatedAttemptFailure {
    message: string;
    evidence: DelegatedAttemptEvidence;
}

const DEFAULT_DELEGATE_SURFACE = 'configured_delegate_bridge';
const PROVIDERS = new Set<HostProvider>(['codex', 'gemini', 'claude', 'droid']);

function providerValue(value: unknown): HostProvider | null {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return PROVIDERS.has(normalized as HostProvider) ? normalized as HostProvider : null;
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function initialDelegatedAttemptEvidence(
    provider: HostProvider,
    requestedSurface = DEFAULT_DELEGATE_SURFACE,
): DelegatedAttemptEvidence {
    return {
        requested_provider: provider,
        actual_provider: null,
        requested_surface: requestedSurface,
        actual_surface: null,
        execution_dispatched: false,
    };
}

function unreportedDelegatedAttemptEvidence(
    provider: HostProvider,
    requestedSurface: string,
): DelegatedAttemptEvidence {
    return {
        requested_provider: provider,
        actual_provider: null,
        requested_surface: requestedSurface,
        actual_surface: null,
        execution_dispatched: null,
    };
}

function completeEvidence(
    value: unknown,
    allowUnreported: boolean,
): DelegatedAttemptEvidence | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const requestedProvider = record.requested_provider === null
        ? null
        : providerValue(record.requested_provider);
    const actualProvider = record.actual_provider === null
        ? null
        : providerValue(record.actual_provider);
    const requestedSurface = stringValue(record.requested_surface);
    const actualSurface = record.actual_surface === null
        ? null
        : stringValue(record.actual_surface);
    const executionDispatched = typeof record.execution_dispatched === 'boolean'
        ? record.execution_dispatched
        : allowUnreported && record.execution_dispatched === null
            ? null
            : undefined;
    if (
        (record.requested_provider !== null && requestedProvider === null)
        || (record.actual_provider !== null && actualProvider === null)
        || requestedSurface === null
        || (record.actual_surface !== null && actualSurface === null)
        || executionDispatched === undefined
    ) {
        return null;
    }
    return {
        requested_provider: requestedProvider,
        actual_provider: actualProvider,
        requested_surface: requestedSurface,
        actual_surface: actualSurface,
        execution_dispatched: executionDispatched,
    };
}

function parseEvidence(message: string): Partial<DelegatedAttemptEvidence> {
    const read = (key: string): string | null => {
        const match = message.match(new RegExp(`${key}=([^\\s)]+)`, 'i'));
        return match?.[1] ?? null;
    };
    const requestedProvider = read('requested_provider');
    const actualProvider = read('actual_provider');
    const requestedSurface = read('requested_surface');
    const actualSurface = read('actual_surface');
    const dispatched = read('execution_dispatched');
    return {
        ...(requestedProvider ? {
            requested_provider: requestedProvider === 'unresolved' ? null : providerValue(requestedProvider),
        } : {}),
        ...(actualProvider ? {
            actual_provider: actualProvider === 'unresolved' ? null : providerValue(actualProvider),
        } : {}),
        ...(requestedSurface ? { requested_surface: requestedSurface } : {}),
        ...(actualSurface ? { actual_surface: actualSurface === 'none' ? null : actualSurface } : {}),
        ...(dispatched === 'true' || dispatched === 'false' || dispatched === 'unreported'
            ? { execution_dispatched: dispatched === 'unreported' ? null : dispatched === 'true' }
            : {}),
    };
}

function formatEvidence(evidence: DelegatedAttemptEvidence): string {
    return [
        `requested_provider=${evidence.requested_provider ?? 'unresolved'}`,
        `actual_provider=${evidence.actual_provider ?? 'unresolved'}`,
        `requested_surface=${evidence.requested_surface}`,
        `actual_surface=${evidence.actual_surface ?? 'none'}`,
        `execution_dispatched=${evidence.execution_dispatched === null ? 'unreported' : String(evidence.execution_dispatched)}`,
    ].join(' ');
}

function buildFailure(reason: string, evidence: DelegatedAttemptEvidence): DelegatedAttemptFailure {
    const formattedEvidence = formatEvidence(evidence);
    const identity = reason.includes(formattedEvidence)
        ? ''
        : ` (${formattedEvidence})`;
    const freshAction = /new explicit (request|operator action)/i.test(reason)
        ? ''
        : ' A new explicit operator action is required to select another provider or surface.';
    return { message: `${reason}${freshAction}${identity}`, evidence };
}

function stripLegacyEvidenceClaims(reason: string): string {
    return reason
        .replace(
            /\b(?:requested_provider|actual_provider|requested_surface|actual_surface|execution_dispatched)=[^\s,;|)]+/gi,
            '',
        )
        .replace(/\(\s*[,;|]*\s*\)/g, '')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/([,;|])\s*(?:[,;|]\s*)+/g, '$1 ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(/[,;:|\-]+\s*$/g, '')
        .trim();
}

function throwEvidenceFailure(reason: string, evidence: DelegatedAttemptEvidence): never {
    const failure = buildFailure(reason, evidence);
    const error = new Error(failure.message) as Error & { evidence: DelegatedAttemptEvidence };
    error.evidence = failure.evidence;
    throw error;
}

export function delegatedResultEvidence(
    result: DelegatedResult,
    expectedProvider: HostProvider,
    expectedSurface: string,
): DelegatedAttemptEvidence {
    const evidence = completeEvidence(result.metadata, false);
    if (!evidence) {
        throwEvidenceFailure(
            'Delegated execution returned without complete structured attempt evidence.',
            unreportedDelegatedAttemptEvidence(expectedProvider, expectedSurface),
        );
    }
    if (
        result.provider !== expectedProvider
        || evidence.requested_provider !== expectedProvider
        || evidence.actual_provider !== expectedProvider
        || evidence.requested_surface !== expectedSurface
        || evidence.actual_surface !== expectedSurface
        || evidence.execution_dispatched !== true
    ) {
        throwEvidenceFailure('Delegated execution returned an identity or surface mismatch.', evidence);
    }
    return evidence;
}

export function delegatedFailureFromError(
    error: unknown,
    expectedProvider: HostProvider,
    expectedSurface: string,
    fallback = initialDelegatedAttemptEvidence(expectedProvider, expectedSurface),
): DelegatedAttemptFailure {
    const reason = error instanceof Error ? error.message : String(error);
    const hasStructuredEvidence = Boolean(
        error
        && typeof error === 'object'
        && Object.prototype.hasOwnProperty.call(error, 'evidence'),
    );
    if (hasStructuredEvidence) {
        const structured = completeEvidence((error as { evidence?: unknown }).evidence, true);
        if (!structured) {
            return buildFailure(
                `Delegated execution failed with malformed structured attempt evidence: ${stripLegacyEvidenceClaims(reason)}`,
                unreportedDelegatedAttemptEvidence(expectedProvider, expectedSurface),
            );
        }
        return buildFailure(stripLegacyEvidenceClaims(reason), structured);
    }
    const parsed = parseEvidence(reason);
    if (Object.keys(parsed).length > 0) {
        return buildFailure(reason, {
            ...unreportedDelegatedAttemptEvidence(expectedProvider, expectedSurface),
            ...parsed,
        });
    }
    return buildFailure(
        reason,
        fallback.execution_dispatched === true
            ? fallback
            : unreportedDelegatedAttemptEvidence(expectedProvider, expectedSurface),
    );
}

export function delegatedFailureFromResult(
    reason: string,
    result: DelegatedResult,
    expectedProvider: HostProvider,
    expectedSurface: string,
): DelegatedAttemptFailure {
    return buildFailure(reason, delegatedResultEvidence(result, expectedProvider, expectedSurface));
}
