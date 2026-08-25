import type { HallOneMindRequestRecord } from '../../../types/hall.js';
import { RETIRED_ONE_MIND_COMPATIBILITY_FAILURE } from './manager.js';

function retired(): never {
    throw new Error(RETIRED_ONE_MIND_COMPATIBILITY_FAILURE);
}

/** Synapse compatibility fails before filesystem or SQLite access. */
export function updateSynapseRecord(
    _rootPath: string,
    _synapseId: number,
    _status: 'COMPLETED' | 'FAILED',
    _responseOrError: string,
): never {
    return retired();
}

/** Telemetry compatibility fails before StateRegistry or Hall access. */
export function markDelegatedRequestActive(
    _rootPath: string,
    _request: HallOneMindRequestRecord,
    _provider: string,
): never {
    return retired();
}

/** Telemetry compatibility fails before StateRegistry or Hall access. */
export function markDelegatedRequestSettled(
    _rootPath: string,
    _provider: string,
): never {
    return retired();
}
