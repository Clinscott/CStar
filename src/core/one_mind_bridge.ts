import type { IntelligenceRequest, NormalizedIntelligenceRequest } from '../types/intelligence-contract.js';
import { isHostSessionActive, isInteractiveHostSession } from './host_session.js';

type ResolvedIntelligenceTransport = 'host_session' | 'synapse_db';

export type OneMindBoundary = 'primary' | 'subagent';

export interface OneMindDecision {
    boundary: OneMindBoundary;
    transportMode: ResolvedIntelligenceTransport;
    reason: string;
    executionAllowed: boolean;
}

interface OneMindOptions {
    hostSessionActive?: boolean;
    /** @deprecated Historical compatibility input. It cannot activate a broker. */
    brokerActive?: boolean;
}

function readMetadataValue(
    request: IntelligenceRequest | NormalizedIntelligenceRequest,
    key: string,
): string | null {
    const value = request.metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function classifySourceBoundary(source: string | undefined): OneMindBoundary {
    const normalized = String(source ?? '').trim().toLowerCase();
    if (
        normalized.includes('subagent')
        || normalized.includes('sub-agent')
        || normalized.includes('host-worker')
        || normalized.includes('worker_bridge')
        || normalized.includes('runtime:host-worker')
    ) {
        return 'subagent';
    }
    return 'primary';
}

export function resolveOneMindBoundary(
    request: IntelligenceRequest | NormalizedIntelligenceRequest,
): OneMindBoundary {
    const explicitBoundary = readMetadataValue(request, 'one_mind_boundary');
    if (explicitBoundary === 'subagent' || explicitBoundary === 'primary') {
        return explicitBoundary;
    }

    const executionRole = readMetadataValue(request, 'execution_role');
    if (executionRole === 'subagent' || executionRole === 'primary') {
        return executionRole;
    }

    return classifySourceBoundary(request.caller?.source);
}

/**
 * Compatibility transport decision for primary intelligence sampling. The
 * retired One Mind broker can no longer alter routing. Delegated/subagent
 * execution is denied before either host or Synapse invocation.
 */
export function resolveOneMindDecision(
    request: IntelligenceRequest | NormalizedIntelligenceRequest,
    env: NodeJS.ProcessEnv = process.env,
    options: OneMindOptions = {},
): OneMindDecision {
    const boundary = resolveOneMindBoundary(request);
    if (boundary === 'subagent') {
        return {
            boundary,
            transportMode: 'synapse_db',
            reason: 'retired-subagent-execution-boundary',
            executionAllowed: false,
        };
    }

    if (request.transport_mode === 'host_session') {
        return {
            boundary,
            transportMode: 'host_session',
            reason: 'explicit-host-session',
            executionAllowed: true,
        };
    }

    if (request.transport_mode === 'synapse_db') {
        return {
            boundary,
            transportMode: 'synapse_db',
            reason: 'explicit-synapse-db',
            executionAllowed: true,
        };
    }

    if (isInteractiveHostSession(env)) {
        return {
            boundary,
            transportMode: 'host_session',
            reason: 'interactive-host-session-direct',
            executionAllowed: true,
        };
    }

    if (typeof options.hostSessionActive === 'boolean') {
        return {
            boundary,
            transportMode: options.hostSessionActive ? 'host_session' : 'synapse_db',
            reason: options.hostSessionActive ? 'declared-host-session' : 'declared-local-session',
            executionAllowed: true,
        };
    }

    const hostActive = isHostSessionActive(env);
    return {
        boundary,
        transportMode: hostActive ? 'host_session' : 'synapse_db',
        reason: hostActive ? 'ambient-host-session' : 'local-fallback',
        executionAllowed: true,
    };
}
