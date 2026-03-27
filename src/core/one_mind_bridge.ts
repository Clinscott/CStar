import type { IntelligenceRequest, NormalizedIntelligenceRequest } from '../types/intelligence-contract.js';
import { isHostSessionActive, isInteractiveHostSession } from './host_session.js';

type ResolvedIntelligenceTransport = 'host_session' | 'synapse_db';

export type OneMindBoundary = 'primary' | 'subagent' | 'autobot';

export interface OneMindDecision {
    boundary: OneMindBoundary;
    transportMode: ResolvedIntelligenceTransport;
    reason: string;
}

interface OneMindOptions {
    hostSessionActive?: boolean;
    brokerActive?: boolean;
}

function normalizeFlag(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return undefined;
}

function isLegacyInteractiveOneMindBrokerActive(env: NodeJS.ProcessEnv): boolean {
    const brokerFlag = normalizeFlag(env.CORVUS_ONE_MIND_BROKER_ACTIVE);
    return brokerFlag === true;
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
    if (!normalized) {
        return 'primary';
    }

    if (
        normalized.includes('autobot')
        || normalized.includes('sovereign-worker')
    ) {
        return 'autobot';
    }

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
    if (explicitBoundary === 'autobot' || explicitBoundary === 'subagent' || explicitBoundary === 'primary') {
        return explicitBoundary;
    }

    const executionRole = readMetadataValue(request, 'execution_role');
    if (executionRole === 'autobot' || executionRole === 'subagent' || executionRole === 'primary') {
        return executionRole;
    }

    return classifySourceBoundary(request.caller?.source);
}

export function resolveOneMindDecision(
    request: IntelligenceRequest | NormalizedIntelligenceRequest,
    env: NodeJS.ProcessEnv = process.env,
    options: OneMindOptions = {},
): OneMindDecision {
    if (request.transport_mode === 'host_session') {
        return {
            boundary: resolveOneMindBoundary(request),
            transportMode: 'host_session',
            reason: 'explicit-host-session',
        };
    }

    if (request.transport_mode === 'synapse_db') {
        return {
            boundary: resolveOneMindBoundary(request),
            transportMode: 'synapse_db',
            reason: 'explicit-synapse-db',
        };
    }

    const boundary = resolveOneMindBoundary(request);
    if (boundary === 'subagent' || boundary === 'autobot') {
        return {
            boundary,
            transportMode: 'synapse_db',
            reason: `delegated-${boundary}-boundary`,
        };
    }

    if (isInteractiveHostSession(env)) {
        if (options.brokerActive === true || isLegacyInteractiveOneMindBrokerActive(env)) {
            return {
                boundary,
                transportMode: 'synapse_db',
                reason: 'interactive-host-session-bus',
            };
        }
        return {
            boundary,
            transportMode: 'host_session',
            reason: 'interactive-host-session-direct',
        };
    }

    if (typeof options.hostSessionActive === 'boolean') {
        return {
            boundary,
            transportMode: options.hostSessionActive ? 'host_session' : 'synapse_db',
            reason: options.hostSessionActive ? 'declared-host-session' : 'declared-local-session',
        };
    }

    return {
        boundary,
        transportMode: isHostSessionActive(env) ? 'host_session' : 'synapse_db',
        reason: isHostSessionActive(env) ? 'ambient-host-session' : 'local-fallback',
    };
}
