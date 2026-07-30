import { RETIRED_ONE_MIND_COMPATIBILITY_FAILURE } from './manager.js';

export interface OneMindFulfillmentCapability {
    ready: boolean;
    provider: string | null;
    reason: string;
}

/** Pure compatibility projection for a retired capability. */
export function getOneMindFulfillmentCapability(
    _env: NodeJS.ProcessEnv = {},
): OneMindFulfillmentCapability {
    return {
        ready: false,
        provider: null,
        reason: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
    };
}

/** Pure compatibility projection; retired capability has no execution surface. */
export function resolveExecutionSurface(_capability: OneMindFulfillmentCapability): string {
    return 'unavailable';
}

/** Mutation compatibility fails before Hall access. */
export function syncOneMindBrokerFulfillment(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = {},
): never {
    throw new Error(RETIRED_ONE_MIND_COMPATIBILITY_FAILURE);
}

/** Queue discovery compatibility returns no rows without Hall access. */
export function getOneMindQueueSummary(_rootPath: string): Record<string, number> {
    return {};
}

/** Mutation compatibility fails before Hall access. */
export function seedHallBrokerIfMissing(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = {},
): never {
    throw new Error(RETIRED_ONE_MIND_COMPATIBILITY_FAILURE);
}
