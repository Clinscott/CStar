/** Stable retirement code for the legacy One Mind broker compatibility API. */
export const RETIRED_ONE_MIND_COMPATIBILITY_FAILURE =
    'legacy_one_mind_compatibility_retired_use_cstar_kernel';

export interface OneMindBrokerStatus {
    running: boolean;
    responsive: boolean;
    fulfillmentReady: boolean;
    fulfillmentReason: string | null;
    fulfillmentMode: string | null;
    executionSurface: string | null;
    provider: string | null;
    sessionId: string | null;
    pid: number | null;
    port: number | null;
    bindingState: 'UNBOUND' | 'BOUND' | 'OFFLINE';
}

function retiredStatus(): OneMindBrokerStatus {
    return {
        running: false,
        responsive: false,
        fulfillmentReady: false,
        fulfillmentReason: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
        fulfillmentMode: 'retired',
        executionSurface: null,
        provider: null,
        sessionId: null,
        pid: null,
        port: null,
        bindingState: 'OFFLINE',
    };
}

/** Read compatibility returns a synthetic offline status without consulting Hall. */
export async function getOneMindBrokerStatus(_rootPath: string): Promise<OneMindBrokerStatus> {
    return retiredStatus();
}

/** Start compatibility is a no-effect tombstone. */
export async function ensureOneMindBroker(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = {},
): Promise<OneMindBrokerStatus> {
    return retiredStatus();
}

/** Stop compatibility cannot mutate a broker that no longer exists. */
export async function stopOneMindBroker(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = {},
): Promise<boolean> {
    return false;
}
