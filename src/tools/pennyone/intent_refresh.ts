export const PENNYONE_INTENT_REFRESH_RETIRED_ERROR =
    'legacy_pennyone_intent_refresh_retired_use_cstar_kernel';

export interface IntentRefreshResult {
    refreshed: number;
    failed: number;
    total_candidates: number;
}

/** Retired before target inspection, source reads, model calls, or Hall writes. */
export async function refreshOfflineIntents(_targetPath: string): Promise<IntentRefreshResult> {
    void _targetPath;
    throw new Error(PENNYONE_INTENT_REFRESH_RETIRED_ERROR);
}
