import { getHallOneMindBroker } from '../../../tools/pennyone/intel/database.js';
import { type HallOneMindBrokerRecord } from '../../../types/hall.js';
import { ONE_MIND_RETIRED_REASON } from './fulfillment.js';

export interface OneMindBrokerStatus {
    running: false;
    responsive: false;
    fulfillmentReady: false;
    fulfillmentReason: string;
    fulfillmentMode: 'read_only';
    executionSurface: 'unavailable';
    provider: string | null;
    sessionId: string | null;
    pid: null;
    port: null;
    bindingState: 'OFFLINE';
}

function mapRecordToStatus(record: HallOneMindBrokerRecord | null): OneMindBrokerStatus {
    return {
        running: false,
        responsive: false,
        fulfillmentReady: false,
        fulfillmentReason: ONE_MIND_RETIRED_REASON,
        fulfillmentMode: 'read_only',
        executionSurface: 'unavailable',
        provider: record?.provider ?? null,
        sessionId: record?.session_id ?? null,
        pid: null,
        port: null,
        bindingState: 'OFFLINE',
    };
}

/** Read-only projection over any historical broker record. */
export async function getOneMindBrokerStatus(rootPath: string): Promise<OneMindBrokerStatus> {
    return mapRecordToStatus(getHallOneMindBroker(rootPath));
}

/**
 * Compatibility entry point. One Mind cannot be started and this function
 * never creates or updates a Hall record.
 */
export async function ensureOneMindBroker(
    rootPath: string,
    _env: NodeJS.ProcessEnv = process.env,
): Promise<OneMindBrokerStatus> {
    return getOneMindBrokerStatus(rootPath);
}

/** Compatibility entry point. One Mind is already retired; Hall is untouched. */
export async function stopOneMindBroker(
    _rootPath: string,
    _env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
    return false;
}
