import { listHallOneMindRequests } from '../../../tools/pennyone/intel/database.js';

/**
 * One Mind is retained only as a read-only projection over historical Hall
 * records.  It is not an execution, model, claim, reconciliation, or Synapse
 * mutation lane.  Implementation must use the durable CStar Forge lifecycle.
 */
export const ONE_MIND_RETIRED_REASON = 'one-mind-retired-read-only';

export interface OneMindFulfillmentCapability {
    ready: false;
    provider: null;
    reason: typeof ONE_MIND_RETIRED_REASON;
}

export interface OneMindFulfillmentResult {
    outcome: 'failed';
    requestId?: string;
    error: string;
}

/**
 * Kept for source compatibility with callers that inject fulfillment helpers.
 * The retired lane never calls these dependencies.
 */
export interface OneMindFulfillmentDependencies {
    hostTextInvoker?: (...args: never[]) => unknown;
    delegatedExecutionInvoker?: (...args: never[]) => unknown;
    delegatedExecutionResolver?: (...args: never[]) => unknown;
}

function retiredResult(requestId?: string): OneMindFulfillmentResult {
    return {
        outcome: 'failed',
        ...(requestId ? { requestId } : {}),
        error: 'One Mind fulfillment is retired and read-only; route implementation through CStar Forge.',
    };
}

export function getOneMindFulfillmentCapability(
    _env: NodeJS.ProcessEnv = process.env,
): OneMindFulfillmentCapability {
    return {
        ready: false,
        provider: null,
        reason: ONE_MIND_RETIRED_REASON,
    };
}

/** Compatibility no-op. Never mutates the Hall broker projection. */
export function syncOneMindBrokerFulfillment(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = process.env,
): void {
    return;
}

/**
 * Fail closed without looking up, claiming, executing, or finalizing a Hall
 * request.  In particular, dependencies are intentionally ignored.
 */
export async function fulfillOneMindRequestById(
    _rootPath: string,
    requestId: string,
    _env: NodeJS.ProcessEnv = process.env,
    _dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    return retiredResult(requestId);
}

/** Fail closed without claiming the next Hall request. */
export async function fulfillNextOneMindRequest(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = process.env,
    _dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    return retiredResult();
}

/** Read-only historical queue projection. */
export function getOneMindQueueSummary(rootPath: string): Record<string, number> {
    const requests = listHallOneMindRequests(rootPath);
    return requests.reduce<Record<string, number>>((acc, request) => {
        acc[request.request_status] = (acc[request.request_status] ?? 0) + 1;
        return acc;
    }, {});
}

/** Compatibility no-op. Status inspection must never seed or update Hall. */
export function seedHallBrokerIfMissing(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = process.env,
): void {
    return;
}
