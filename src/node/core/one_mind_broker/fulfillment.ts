import type { requestHostDelegatedExecution, resolveHostDelegatedExecution } from '../../../core/host_delegation.js';
import type { requestHostText } from '../../../core/host_intelligence.js';
import { RETIRED_ONE_MIND_COMPATIBILITY_FAILURE } from './manager.js';

export {
    getOneMindFulfillmentCapability,
    getOneMindQueueSummary,
    seedHallBrokerIfMissing,
    syncOneMindBrokerFulfillment,
} from './fulfillment_capability.js';
export type { OneMindFulfillmentCapability } from './fulfillment_capability.js';

export interface OneMindFulfillmentResult {
    outcome: 'fulfilled' | 'failed' | 'idle' | 'deferred';
    requestId?: string;
    responseText?: string;
    error?: string;
}

export interface OneMindFulfillmentDependencies {
    hostTextInvoker?: typeof requestHostText;
    delegatedExecutionInvoker?: typeof requestHostDelegatedExecution;
    delegatedExecutionResolver?: typeof resolveHostDelegatedExecution;
}

/** Fulfillment compatibility fails before Hall, provider, process, source, or callback access. */
export async function fulfillOneMindRequestById(
    _rootPath: string,
    requestId: string,
    _env: NodeJS.ProcessEnv = {},
    _dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    return {
        outcome: 'failed',
        requestId,
        error: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
    };
}

/** Queue fulfillment compatibility fails before inspecting or claiming a row. */
export async function fulfillNextOneMindRequest(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = {},
    _dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    return {
        outcome: 'failed',
        error: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
    };
}
